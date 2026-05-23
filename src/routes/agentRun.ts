import { Request, Response } from "express";
import { supabase } from "../utils/supabaseClient";
import { encryptValue } from "../utils/encryption";
import {
  validateAgentGraph,
  normalizeAgentEdges,
  normalizeAgentNodes,
} from "../utils/validation";
import { agentQueue, agentRunSchema } from "../utils/agentQueue";
import { logger } from "../utils/logger";
import { checkRateLimit, incrementUsage } from "../utils/rateLimiting";
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

    const rateCheck = await checkRateLimit(user.id, "api_calls");
    if (!rateCheck.allowed) {
      return res.status(429).json({
        error: "Rate limit exceeded",
        current: rateCheck.current,
        limit: rateCheck.limit,
        resetTime: rateCheck.resetTime,
      });
    }

    await incrementUsage(user.id, "api_calls", 1);

    const userId = user.id;
    const body = req.body;

    const normalizedBody = {
      ...body,
      agentId: body.agentId ?? body.agent_id,
      executionId: body.executionId ?? body.execution_id,
      input: body.input ?? body.inputs ?? {},
      nodes: body.nodes ?? body.config?.nodes ?? body.configuration?.nodes,
      edges: body.edges ?? body.config?.edges ?? body.configuration?.edges,
      apiKeys:
        body.apiKeys ??
        body.api_keys ??
        (body.apiKeysString ? JSON.parse(body.apiKeysString) : undefined) ??
        (body.api_keys_string ? JSON.parse(body.api_keys_string) : undefined) ??
        {},
      agentName: body.agentName ?? body.agent_name,
      saveAsAgent: body.saveAsAgent ?? body.save_as_agent,
      isTemporary: body.isTemporary ?? body.is_temporary,
    };

    const parseResult = agentRunSchema.safeParse(normalizedBody);
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
      saveAsAgent = false, // NEW: Default to false - don't auto-save as new agent
      isTemporary = true, // NEW: Mark as temporary execution
      executionId: providedExecutionId,
    } = parseResult.data;

    const normalizedNodes = normalizeAgentNodes(nodes as any);
    const graphValidation = validateAgentGraph(
      normalizedNodes as any,
      edges as any,
    );
    if (!graphValidation.valid) {
      console.debug("Workflow graph failed validation", {
        errors: graphValidation.errors,
        warnings: graphValidation.warnings,
      });

      return res.status(400).json({
        error: "Invalid workflow graph",
        details: {
          errors: graphValidation.errors,
          warnings: graphValidation.warnings,
        },
      });
    }

    const normalizedEdges =
      graphValidation.normalizedEdges ?? normalizeAgentEdges(edges);

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
    } else if (saveAsAgent && agentName) {
      // FIXED: Only save as agent if explicitly requested with saveAsAgent=true and agentName provided
      // This prevents auto-creating agents for temporary workflow executions
      const { data: agentData, error: agentError } = await supabase
        .from("user_agents")
        .insert({
          user_id: userId,
          name: agentName,
          config: { nodes: normalizedNodes, edges: normalizedEdges },
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
    } else {
      // FIXED: Use temporary execution ID without creating an agent record
      // This is for ad-hoc workflow testing/execution without persisting as an agent
      agentId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      agentVersion = "temp";
    }

    let executionId = providedExecutionId;

    // Generate idempotency key
    const idempotencyKey = createHash("sha256")
      .update(`${userId}${agentId}${JSON.stringify(input)}${agentVersion}`)
      .digest("hex");

    // Check for existing execution
    const { data: existingExecution, error: checkError } = await supabase
      .from("agent_executions")
      .select("id, status")
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
      if (
        existingExecution.status === "queued" ||
        existingExecution.status === "running" ||
        existingExecution.status === "completed"
      ) {
        return res.json({ executionId: existingExecution.id, reused: true });
      }

      // If the previous execution failed or was cancelled, retry it instead of
      // returning an invalid stale result. This keeps the idempotency key stable
      // while allowing recovery from transient failures.
      const resetResult = await supabase
        .from("agent_executions")
        .update({
          status: "queued",
          started_at: null,
          completed_at: null,
          error_message: null,
          result: null,
          workflow_id: null,
        })
        .eq("id", existingExecution.id);

      if (resetResult.error) {
        console.error("Failed to reset previous execution:", resetResult.error);
        return res.status(500).json({
          error: "Failed to reset previous execution",
          details: resetResult.error.message,
        });
      }

      executionId = existingExecution.id;
    }

    // Check global queue limit
    const waitingJobs = await agentQueue.getWaiting();
    const activeJobs = await agentQueue.getActive();
    const totalQueuedJobs = waitingJobs.length + activeJobs.length;

    if (totalQueuedJobs > 100000) {
      return res.status(429).json({ error: "System busy, try later" });
    }

    // Check per-user running execution limit (max 100 concurrent running jobs)
    const { count: userRunningJobs, error: countError } = await supabase
      .from("agent_executions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "running");

    if (countError) {
      console.error("Error checking user jobs:", countError);
      return res.status(500).json({ error: "Internal server error" });
    }

    if ((userRunningJobs || 0) >= 10000) {
      return res.status(429).json({
        error:
          "Too many concurrent running executions. Wait for current jobs to finish.",
      });
    }

    // For temporary executions, don't store agent_id to avoid foreign key conflicts
    if (executionId) {
      const { data: existingExecution, error: existingExecError } =
        await supabase
          .from("agent_executions")
          .select("id, user_id, status")
          .eq("id", executionId)
          .single();

      if (existingExecError && existingExecError.code !== "PGRST116") {
        return res.status(500).json({
          error: "Failed to verify provided execution ID",
          details: existingExecError.message,
        });
      }

      if (existingExecution) {
        if (existingExecution.user_id !== userId) {
          return res
            .status(404)
            .json({ error: "Execution not found or access denied" });
        }

        if (existingExecution.status === "completed") {
          return res.status(400).json({ error: "Execution already completed" });
        }

        if (
          existingExecution.status === "queued" ||
          existingExecution.status === "running"
        ) {
          executionId = existingExecution.id;
        } else {
          const updateResult = await supabase
            .from("agent_executions")
            .update({
              status: "queued",
              started_at: null,
              completed_at: null,
              error_message: null,
              input_data: input,
            })
            .eq("id", executionId);

          if (updateResult.error) {
            return res.status(500).json({
              error: "Failed to update existing execution",
              details: updateResult.error.message,
            });
          }
        }
      } else {
        const executionData: any = {
          id: executionId,
          user_id: userId,
          idempotency_key: idempotencyKey,
          status: "queued",
          input_data: input,
          started_at: new Date().toISOString(),
        };

        // Only include agent_id if it's not a temporary ID
        if (!agentId.startsWith("temp_")) {
          executionData.agent_id = agentId;
        } else {
          executionData.agent_id = null;
        }

        const executionInsert = await supabase
          .from("agent_executions")
          .insert(executionData)
          .select("id")
          .single();

        if (executionInsert.error || !executionInsert.data?.id) {
          console.error("Execution insert error:", executionInsert.error);
          return res.status(500).json({
            error: "Failed to create execution record",
            details:
              executionInsert.error?.message ||
              JSON.stringify(executionInsert.error),
          });
        }

        executionId = executionInsert.data.id;
      }
    } else {
      const executionData: any = {
        user_id: userId,
        idempotency_key: idempotencyKey,
        status: "queued",
        input_data: input,
        started_at: new Date().toISOString(),
      };

      // Only include agent_id if it's not a temporary ID
      if (!agentId.startsWith("temp_")) {
        executionData.agent_id = agentId;
      } else {
        executionData.agent_id = null;
      }

      const executionInsert = await supabase
        .from("agent_executions")
        .insert(executionData)
        .select("id")
        .single();

      if (executionInsert.error || !executionInsert.data?.id) {
        console.error("Execution insert error:", executionInsert.error);
        return res.status(500).json({
          error: "Failed to create execution record",
          details:
            executionInsert.error?.message ||
            JSON.stringify(executionInsert.error),
        });
      }

      executionId = executionInsert.data.id;
    }

    if (isTemporary || agentId.startsWith("temp_")) {
      const tempUpdate = await supabase
        .from("agent_executions")
        .update({ is_temporary: true })
        .eq("id", executionId);

      if (tempUpdate.error) {
        if (tempUpdate.error.code === "PGRST204") {
          logger.info(
            "Temporary execution flag skipped because schema is not migrated",
          );
        } else {
          logger.error(
            "Failed to apply temporary execution flag",
            tempUpdate.error,
          );
        }
      }
    }

    const encryptedApiKeys = encryptValue(JSON.stringify(apiKeys || {}));

    let job;
    try {
      job = await agentQueue.add(
        {
          agentId,
          nodes: normalizedNodes,
          userId,
          input: input || {},
          config: { nodes: normalizedNodes, edges: normalizedEdges },
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
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
