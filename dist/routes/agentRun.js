"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentRunHandler = void 0;
const supabaseClient_1 = require("../utils/supabaseClient");
const encryption_1 = require("../utils/encryption");
const validation_1 = require("../utils/validation");
const agentQueue_1 = require("../utils/agentQueue");
const logger_1 = require("../utils/logger");
const crypto_1 = require("crypto");
// Status transition validation
const VALID_STATUS_TRANSITIONS = {
    queued: ["running"],
    running: ["completed", "failed"],
    completed: [],
    failed: [],
    cancelled: [],
};
function isValidStatusTransition(currentStatus, newStatus) {
    return VALID_STATUS_TRANSITIONS[currentStatus]?.includes(newStatus) ?? false;
}
const agentRunHandler = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const token = authHeader.substring(7);
        // Verify the JWT token with Supabase
        const { data: { user }, error, } = await supabaseClient_1.supabase.auth.getUser(token);
        if (error || !user) {
            return res.status(401).json({ error: "Invalid token" });
        }
        const userId = user.id;
        const body = req.body;
        const parseResult = agentQueue_1.agentRunSchema.safeParse(body);
        if (!parseResult.success) {
            const details = parseResult.error.errors.map((err) => ({
                field: err.path.join("."),
                message: err.message,
            }));
            return res.status(400).json({ error: "Invalid workflow", details });
        }
        const { agentId: providedAgentId, nodes, edges, input, apiKeys, agentName, saveAsAgent = false, // NEW: Default to false - don't auto-save as new agent
        isTemporary = true, // NEW: Mark as temporary execution
         } = parseResult.data;
        const graphValidation = (0, validation_1.validateAgentGraph)(nodes, edges);
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
        const normalizedEdges = graphValidation.normalizedEdges ?? (0, validation_1.normalizeAgentEdges)(edges);
        let agentId;
        let agentVersion;
        if (providedAgentId) {
            // Fetch existing agent
            const { data: agentData, error: agentError } = await supabaseClient_1.supabase
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
        }
        else if (saveAsAgent && agentName) {
            // FIXED: Only save as agent if explicitly requested with saveAsAgent=true and agentName provided
            // This prevents auto-creating agents for temporary workflow executions
            const { data: agentData, error: agentError } = await supabaseClient_1.supabase
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
        else {
            // FIXED: Use temporary execution ID without creating an agent record
            // This is for ad-hoc workflow testing/execution without persisting as an agent
            agentId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            agentVersion = "temp";
        }
        // Generate idempotency key
        const idempotencyKey = (0, crypto_1.createHash)("sha256")
            .update(`${userId}${agentId}${JSON.stringify(input)}${agentVersion}`)
            .digest("hex");
        // Check for existing execution
        const { data: existingExecution, error: checkError } = await supabaseClient_1.supabase
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
        const waitingJobs = await agentQueue_1.agentQueue.getWaiting();
        const activeJobs = await agentQueue_1.agentQueue.getActive();
        const totalQueuedJobs = waitingJobs.length + activeJobs.length;
        if (totalQueuedJobs > 1000) {
            return res.status(429).json({ error: "System busy, try later" });
        }
        // Check per-user limit (max 5 concurrent jobs)
        const { count: userActiveJobs, error: countError } = await supabaseClient_1.supabase
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
        // For temporary executions, don't store agent_id to avoid foreign key conflicts
        const executionData = {
            user_id: userId,
            idempotency_key: idempotencyKey,
            status: "queued",
            input_data: input,
            started_at: new Date().toISOString(),
        };
        // Only include agent_id if it's not a temporary ID
        if (!agentId.startsWith("temp_")) {
            executionData.agent_id = agentId;
        }
        else {
            executionData.agent_id = null;
        }
        const executionInsert = await supabaseClient_1.supabase
            .from("agent_executions")
            .insert(executionData)
            .select("id")
            .single();
        if (executionInsert.error || !executionInsert.data?.id) {
            console.error("Execution insert error:", executionInsert.error);
            return res.status(500).json({
                error: "Failed to create execution record",
                details: executionInsert.error?.message ||
                    JSON.stringify(executionInsert.error),
            });
        }
        const executionId = executionInsert.data.id;
        if (isTemporary || agentId.startsWith("temp_")) {
            const tempUpdate = await supabaseClient_1.supabase
                .from("agent_executions")
                .update({ is_temporary: true })
                .eq("id", executionId);
            if (tempUpdate.error) {
                if (tempUpdate.error.code === "PGRST204") {
                    logger_1.logger.info("Temporary execution flag skipped because schema is not migrated");
                }
                else {
                    logger_1.logger.error("Failed to apply temporary execution flag", tempUpdate.error);
                }
            }
        }
        const encryptedApiKeys = (0, encryption_1.encryptValue)(JSON.stringify(apiKeys || {}));
        let job;
        try {
            job = await agentQueue_1.agentQueue.add({
                agentId,
                nodes,
                userId,
                input: input || {},
                config: { nodes, edges: normalizedEdges },
                apiKeys: encryptedApiKeys,
                executionId,
            }, {
                priority: 1, // Higher priority for user-initiated jobs
            });
        }
        catch (error) {
            console.error("Failed to enqueue job:", error);
            // Update execution status to failed
            await supabaseClient_1.supabase
                .from("agent_executions")
                .update({ status: "failed", error_message: "Failed to enqueue job" })
                .eq("id", executionId);
            return res.status(500).json({ error: "Failed to enqueue job" });
        }
        await supabaseClient_1.supabase
            .from("agent_executions")
            .update({ workflow_id: job.id })
            .eq("id", executionId);
        console.log(`Job enqueued for user ${userId}, agent ${agentId}, job ID: ${job.id}`);
        return res.json({ executionId, reused: false });
    }
    catch (error) {
        console.error("Agent execution error:", error);
        return res.status(500).json({
            error: "Internal server error",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
exports.agentRunHandler = agentRunHandler;
