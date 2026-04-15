"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentExecutionJob = void 0;
const supabaseClient_1 = require("../utils/supabaseClient");
const logger_1 = require("../utils/logger");
const agentEngine_1 = require("../utils/agentEngine");
const validation_1 = require("../utils/validation");
const auditLogger_1 = require("../utils/auditLogger");
const encryption_1 = require("../utils/encryption");
const parseJsonSafe = (value, fallback) => {
    if (!value)
        return fallback;
    try {
        return JSON.parse(value);
    }
    catch (error) {
        logger_1.logger.error("Failed to parse JSON safely.", {
            error: error.message,
        });
        return fallback;
    }
};
const decryptApiKeys = (encrypted) => {
    if (!encrypted) {
        return {};
    }
    try {
        const decrypted = (0, encryption_1.decryptValue)(encrypted);
        return parseJsonSafe(decrypted, {});
    }
    catch (error) {
        logger_1.logger.error("apiKeys decryption failed, proceeding with empty object.", {
            error: error.message,
        });
        return {};
    }
};
const fetchAndClaimExecution = async (executionId) => {
    // First, try to update the status to running
    const { error: updateError } = await supabaseClient_1.supabase
        .from("executions")
        .update({
        status: "running",
        started_at: new Date().toISOString(),
    })
        .eq("id", executionId)
        .eq("status", "queued");
    if (updateError) {
        throw new Error(`Supabase error claiming execution: ${updateError.message}`);
    }
    // Then fetch the updated row
    const { data: execution, error: fetchError } = await supabaseClient_1.supabase
        .from("executions")
        .select("id, agent_id, user_id, input_data, metadata, status, created_at")
        .eq("id", executionId)
        .eq("status", "running")
        .maybeSingle();
    if (fetchError) {
        throw new Error(`Supabase error fetching claimed execution: ${fetchError.message}`);
    }
    if (execution) {
        return execution;
    }
    // If no row was updated, check if it's already running or completed
    const { data: existingExecution, error: existingError } = await supabaseClient_1.supabase
        .from("executions")
        .select("status")
        .eq("id", executionId)
        .maybeSingle();
    if (existingError) {
        throw new Error(`Supabase error verifying execution state: ${existingError.message}`);
    }
    if (!existingExecution) {
        throw new Error(`Execution ${executionId} not found.`);
    }
    if (existingExecution.status === "running" ||
        existingExecution.status === "completed") {
        logger_1.logger.info("Execution already claimed or completed, skipping.", {
            executionId,
            status: existingExecution.status,
        });
        return null;
    }
    throw new Error(`Execution ${executionId} has invalid status: ${existingExecution.status}`);
};
const fetchAgentConfig = async (agentId) => {
    const { data, error } = await supabaseClient_1.supabase
        .from("agents")
        .select("nodes, edges")
        .eq("id", agentId)
        .maybeSingle();
    if (error) {
        throw new Error(`Supabase error fetching agent: ${error.message}`);
    }
    if (!data) {
        throw new Error(`Agent ${agentId} not found.`);
    }
    return data;
};
const fetchUserApiKeys = async (userId) => {
    const { data, error } = await supabaseClient_1.supabase
        .from("user_api_keys")
        .select("encrypted_keys")
        .eq("user_id", userId)
        .maybeSingle();
    if (error) {
        throw new Error(`Supabase error fetching API keys: ${error.message}`);
    }
    return data?.encrypted_keys ?? null;
};
const persistExecutionResult = async (executionId, payload) => {
    const { error } = await supabaseClient_1.supabase
        .from("executions")
        .update(payload)
        .eq("id", executionId);
    if (error) {
        throw new Error(`Supabase error updating execution result: ${error.message}`);
    }
};
const agentExecutionJob = async (job) => {
    const result = {
        success: false,
        output: {},
        logs: [],
        errors: [],
        nodeStatuses: [],
        nodeResults: [],
        executionTime: 0,
    };
    let executionMetadata;
    const startTime = Date.now();
    const { executionId } = job.data;
    try {
        logger_1.logger.info("Agent execution job started.", { executionId });
        const execution = await fetchAndClaimExecution(executionId);
        if (!execution) {
            return {
                success: true,
                output: {},
                logs: ["Execution was already claimed or completed."],
                errors: [],
                nodeStatuses: [],
                nodeResults: [],
                executionTime: 0,
            };
        }
        const { agent_id: agentId, user_id: userId, input_data: input, metadata, } = execution;
        executionMetadata = metadata;
        const [agent, encryptedKeys] = await Promise.all([
            fetchAgentConfig(agentId),
            fetchUserApiKeys(userId),
        ]);
        // Emit execution started
        global.io?.emit("execution-started", { executionId });
        await (0, auditLogger_1.logWorkflowAudit)(executionId, "workflow.start", {
            agentId,
            userId,
            queuedAt: execution.created_at,
        });
        const decryptedApiKeys = decryptApiKeys(encryptedKeys);
        const nodes = agent.nodes ?? [];
        const edges = agent.edges ?? [];
        const validation = (0, validation_1.validateAgentGraph)(nodes, edges);
        // Log validation errors and warnings but don't block execution
        if (validation.errors && validation.errors.length > 0) {
            await (0, auditLogger_1.logWorkflowAudit)(executionId, "workflow.validation.errors", {
                errors: validation.errors,
            });
            logger_1.logger.info("Agent graph validation errors (non-blocking)", {
                executionId,
                errors: validation.errors,
            });
        }
        if (validation.warnings && validation.warnings.length > 0) {
            await (0, auditLogger_1.logWorkflowAudit)(executionId, "workflow.validation.warnings", {
                warnings: validation.warnings,
            });
            logger_1.logger.info("Agent graph validation warnings", {
                executionId,
                warnings: validation.warnings,
            });
        }
        await (0, auditLogger_1.logWorkflowAudit)(executionId, "workflow.graph.validated", {
            nodeCount: nodes.length,
            edgeCount: edges.length,
            errorsCount: validation.errors?.length || 0,
            warningsCount: validation.warnings?.length || 0,
            executionOrder: validation.executionPlan?.executionOrder,
        });
        const workflowOptions = {
            concurrency: 3,
            timeoutMs: 45000,
            retryCount: 2,
            nodeTimeoutMs: 30000,
            auditLog: async (event, details) => {
                await (0, auditLogger_1.logWorkflowAudit)(executionId, event, details);
            },
        };
        const workflowResult = await (0, agentEngine_1.executeWorkflow)(nodes, edges, input ?? {}, decryptedApiKeys, {
            ...workflowOptions,
            executionId,
            executionPlan: validation.executionPlan,
            onNodeStart: (nodeId) => {
                global.io?.emit("execution-started", { executionId });
                global.io?.emit("node-started", { executionId, nodeId });
            },
            onNodeStatus: (status) => {
                global.io?.emit("node-status", {
                    executionId,
                    ...status,
                });
            },
            onNodeComplete: (nodeId, success, error, result) => {
                global.io?.emit("node-completed", {
                    executionId,
                    nodeId,
                    success,
                    error,
                    executionTime: result?.executionTime,
                    retryCount: result?.retryCount,
                });
            },
            onExecutionComplete: (success) => {
                global.io?.emit("execution-completed", { executionId, success });
            },
        });
        const status = workflowResult.success ? "completed" : "failed";
        const executionTimeMs = Date.now() - startTime;
        const updatePayload = {
            status,
            output_data: workflowResult.output,
            logs: workflowResult.logs,
            errors: workflowResult.errors ?? [],
            completed_at: new Date().toISOString(),
            execution_time_ms: executionTimeMs,
            metadata: {
                ...metadata,
                last_run_at: new Date().toISOString(),
                node_count: nodes.length,
                node_statuses: workflowResult.nodeStatuses,
                node_results: workflowResult.nodeResults,
                execution_plan: workflowResult.executionPlan,
                total_execution_time: workflowResult.executionTime,
                validation_warnings: validation.warnings,
            },
        };
        await (0, auditLogger_1.logWorkflowAudit)(executionId, "workflow.completed", {
            status,
            executionTimeMs,
            nodeCount: nodes.length,
        });
        await persistExecutionResult(executionId, updatePayload);
        logger_1.logger.info("Agent execution job completed.", {
            executionId,
            agentId,
            status,
            execution_time_ms: executionTimeMs,
        });
        return workflowResult;
    }
    catch (error) {
        const message = error?.message ?? String(error);
        logger_1.logger.error("Agent execution job failed.", {
            executionId,
            error: message,
        });
        const executionTimeMs = Date.now() - startTime;
        result.logs.push("Agent execution failed.");
        result.errors?.push(message);
        try {
            await (0, auditLogger_1.logWorkflowAudit)(executionId, "workflow.failed", {
                error: message,
                executionTimeMs,
            });
        }
        catch (auditError) {
            logger_1.logger.error("Failed to write workflow audit failure.", {
                executionId,
                error: auditError?.message || auditError,
            });
        }
        try {
            await persistExecutionResult(executionId, {
                status: "failed",
                output_data: null,
                logs: result.logs,
                errors: result.errors ?? [],
                completed_at: new Date().toISOString(),
                execution_time_ms: executionTimeMs,
                metadata: {
                    ...(executionMetadata ?? {}),
                    last_run_at: new Date().toISOString(),
                    node_statuses: result.nodeStatuses,
                },
            });
        }
        catch (writeError) {
            logger_1.logger.error("Failed to write execution failure to Supabase.", {
                executionId,
                error: writeError?.message || writeError,
            });
        }
        return result;
    }
};
exports.agentExecutionJob = agentExecutionJob;
