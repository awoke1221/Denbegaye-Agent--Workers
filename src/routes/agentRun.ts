import { Request, Response } from "express";
import { supabase } from "../utils/supabaseClient";
import { encryptValue } from "../utils/encryption";
import {
  validateAgentGraph,
  normalizeAgentEdges,
  AgentEdgeInput,
} from "../utils/validation";
import { AgentEdge, AgentNode } from "../jobs/types";
import {
  agentQueue,
  agentRunSchema,
  AgentExecutionJobData,
} from "../utils/agentQueue";
import { createHash } from "crypto";

// Status transition validation
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  queued: ["running"],
  running: ["completed", "failed"],
  completed: [],
  failed: [],
  cancelled: [],
};

function isValidStatusTransition(
  currentStatus: string,
  newStatus: string,
): boolean {
  return VALID_STATUS_TRANSITIONS[currentStatus]?.includes(newStatus) ?? false;
}

export const agentRunHandler = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.substring(7);

    // Verify the JWT token with Supabase
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const userId = user.id;

    const body = req.body;
    const parseResult = agentRunSchema.safeParse(body);
    if (!parseResult.success) {
      const details = parseResult.error.errors.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));
      return res.status(400).json({ error: "Invalid workflow", details });
    }

    const {
      agentId: providedAgentId,
      nodes,
      edges,
      input,
      apiKeys,
      agentName,
    } = parseResult.data;

    const graphValidation = validateAgentGraph(
      nodes as AgentNode[],
      edges as Array<AgentEdge | AgentEdgeInput>,
    );
    if (!graphValidation.valid) {
      return res.status(400).json({
        error: "Invalid workflow graph",
        details: graphValidation.errors,
      });
    }

    const normalizedEdges =
      graphValidation.normalizedEdges ??
      normalizeAgentEdges(edges as Array<AgentEdge | AgentEdgeInput>);

    let agentId: string;
    let agentVersion: string;

    if (providedAgentId) {
      // Fetch existing agent
      const { data: agentData, error: agentError } = await supabase
        .from("user_agents")
        .select("id, version")
        .eq("id", providedAgentId)
        .eq("user_id", userId)
        .single();

      if (agentError || !agentData) {
        return res
          .status(404)
          .json({ error: "Agent not found or access denied" });
      }

      agentId = agentData.id;
      agentVersion = agentData.version;
    } else {
      // Save agent to database
      const { data: agentData, error: agentError } = await supabase
        .from("user_agents")
        .insert({
          user_id: userId,
          name: agentName,
          config: { nodes, edges: normalizedEdges },
          status: "active",
          version: "1.0.0",
        })
        .select("id, version")
        .single();

      if (agentError) {
        return res
          .status(500)
          .json({ error: "Failed to save agent", details: agentError.message });
      }

      agentId = agentData.id;
      agentVersion = agentData.version;
    }

    // Generate idempotency key
    const idempotencyKey = createHash("sha256")
      .update(`${userId}${agentId}${JSON.stringify(input)}${agentVersion}`)
      .digest("hex");

    // Check for existing execution
    const { data: existingExecution, error: checkError } = await supabase
      .from("agent_executions")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .single();

    if (checkError && checkError.code !== "PGRST116") {
      // PGRST116 is "not found"
      return res.status(500).json({
        error: "Failed to check existing execution",
        details: checkError.message,
      });
    }

    if (existingExecution) {
      return res.json({ executionId: existingExecution.id, reused: true });
    }

    // Check global queue limit
    const waitingJobs = await agentQueue.getWaiting();
    const activeJobs = await agentQueue.getActive();
    const totalQueuedJobs = waitingJobs.length + activeJobs.length;
    if (totalQueuedJobs > 1000) {
      return res.status(429).json({ error: "System busy, try later" });
    }

    // Check per-user limit (max 5 concurrent jobs)
    const { count: userActiveJobs, error: countError } = await supabase
      .from("agent_executions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["queued", "running"]);

    if (countError) {
      console.error("Error checking user jobs:", countError);
      return res.status(500).json({ error: "Internal server error" });
    }

    if ((userActiveJobs || 0) >= 5) {
      return res.status(429).json({ error: "System busy, try later" });
    }

    const executionInsert = await supabase
      .from("agent_executions")
      .insert({
        agent_id: agentId,
        user_id: userId,
        idempotency_key: idempotencyKey,
        status: "queued",
        input_data: input,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (executionInsert.error || !executionInsert.data?.id) {
      return res.status(500).json({
        error: "Failed to create execution record",
        details: executionInsert.error?.message,
      });
    }

    const executionId = executionInsert.data.id;

    const encryptedApiKeys = encryptValue(JSON.stringify(apiKeys || {}));

    let job;
    try {
      job = await agentQueue.add(
        {
          agentId,
          userId,
          input: input || {},
          config: { nodes, edges: normalizedEdges },
          apiKeys: encryptedApiKeys,
          executionId,
        },
        {
          priority: 1, // Higher priority for user-initiated jobs
        },
      );
    } catch (error) {
      console.error("Failed to enqueue job:", error);
      // Update execution status to failed
      await supabase
        .from("agent_executions")
        .update({ status: "failed", error_message: "Failed to enqueue job" })
        .eq("id", executionId);
      return res.status(500).json({ error: "Failed to enqueue job" });
    }

    await supabase
      .from("agent_executions")
      .update({ workflow_id: job.id })
      .eq("id", executionId);

    console.log(
      `Job enqueued for user ${userId}, agent ${agentId}, job ID: ${job.id}`,
    );

    return res.json({ executionId, reused: false });
  } catch (error) {
    console.error("Agent execution error:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
