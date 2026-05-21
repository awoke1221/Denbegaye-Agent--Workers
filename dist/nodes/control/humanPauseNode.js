"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.humanPauseHandler = humanPauseHandler;
const supabaseClient_1 = require("../../utils/supabaseClient");
const socket_1 = require("../../utils/socket");
const logger_1 = require("../../utils/logger");
async function humanPauseHandler(context) {
    const executionId = context.executionId;
    const nodeId = context.nodeId;
    const question = context.config?.question || "Please review and approve to continue";
    const options = context.config?.options || ["Approve", "Reject"];
    const timeoutMs = context.config?.timeoutMs || 300000; // 5 minutes default
    // Check if executionId is provided
    if (!executionId ||
        typeof executionId !== "string" ||
        executionId.trim() === "") {
        return {
            success: false,
            error: "human-pause requires an executionId and cannot run outside of a tracked execution context",
            output: {
                text: "Pause failed: missing executionId",
                message: "human-pause requires an executionId and cannot run outside of a tracked execution context",
            },
            logs: ["human-pause failed: missing or invalid executionId"],
        };
    }
    try {
        // Step 1: Update execution row to awaiting_approval status
        const { data: executionData, error: fetchError } = await supabaseClient_1.supabase
            .from("agent_executions")
            .select("metadata")
            .eq("id", executionId)
            .single();
        if (fetchError) {
            logger_1.logger.error("Failed to fetch execution for pause", {
                error: fetchError,
            });
            return {
                success: false,
                error: `Failed to fetch execution: ${fetchError.message}`,
                output: {
                    text: "Pause failed: could not fetch execution",
                    message: fetchError.message,
                },
                logs: [`human-pause failed: ${fetchError.message}`],
            };
        }
        const existingMetadata = executionData?.metadata || {};
        const mergedMetadata = {
            ...existingMetadata,
            pausedAtNode: nodeId,
            approvalQuestion: question,
            approvalOptions: options,
        };
        const { error: updateError } = await supabaseClient_1.supabase
            .from("agent_executions")
            .update({
            status: "awaiting_approval",
            metadata: mergedMetadata,
            updated_at: new Date().toISOString(),
        })
            .eq("id", executionId);
        if (updateError) {
            logger_1.logger.error("Failed to update execution status to awaiting_approval", {
                error: updateError,
            });
            return {
                success: false,
                error: `Failed to update execution status: ${updateError.message}`,
                output: {
                    text: "Pause failed: could not update execution status",
                    message: updateError.message,
                },
                logs: [`human-pause failed to update status: ${updateError.message}`],
            };
        }
        // Step 2: Emit socket event to notify frontend
        try {
            (0, socket_1.emitSocketEvent)("execution-paused", {
                executionId,
                nodeId,
                question,
                options,
            });
        }
        catch (socketError) {
            logger_1.logger.error("Failed to emit execution-paused socket event", {
                error: socketError,
                executionId,
            });
            // Don't fail the handler - polling mechanism will still work
        }
        // Step 3: Poll Supabase for human response
        return new Promise((resolve) => {
            const startTime = Date.now();
            let interval;
            const pollForResponse = async () => {
                const elapsedTime = Date.now() - startTime;
                // Check for timeout
                if (elapsedTime >= timeoutMs) {
                    clearInterval(interval);
                    // Update execution row to timed_out status
                    try {
                        await supabaseClient_1.supabase
                            .from("agent_executions")
                            .update({
                            status: "timed_out",
                            updated_at: new Date().toISOString(),
                        })
                            .eq("id", executionId);
                        // Emit timeout event
                        try {
                            (0, socket_1.emitSocketEvent)("execution-timeout", {
                                executionId,
                                nodeId,
                            });
                        }
                        catch (socketError) {
                            logger_1.logger.error("Failed to emit execution-timeout socket event", {
                                error: socketError,
                                executionId,
                            });
                        }
                    }
                    catch (error) {
                        logger_1.logger.error("Failed to update execution status to timed_out", {
                            error,
                        });
                    }
                    return resolve({
                        success: false,
                        error: `Human approval timed out after ${timeoutMs}ms`,
                        output: {
                            text: "Approval timed out",
                            message: `Human approval timed out after ${timeoutMs}ms`,
                            approved: false,
                            timedOut: true,
                        },
                        logs: [
                            `human-pause timed out after ${timeoutMs}ms waiting for approval`,
                        ],
                    });
                }
                // Query execution for response
                try {
                    const { data, error } = await supabaseClient_1.supabase
                        .from("agent_executions")
                        .select("metadata, status")
                        .eq("id", executionId)
                        .single();
                    if (error) {
                        // Log but continue polling on transient errors
                        logger_1.logger.warn("Error polling execution for human response", {
                            error,
                            executionId,
                        });
                        return; // Continue polling
                    }
                    const metadata = data?.metadata || {};
                    // Check if human response exists
                    if (metadata.humanResponse != null) {
                        clearInterval(interval);
                        const humanResponse = metadata.humanResponse;
                        const respondedBy = metadata.respondedBy;
                        const respondedAt = metadata.respondedAt;
                        // Update execution: set status to running, remove approval fields
                        const cleanedMetadata = {
                            ...metadata,
                        };
                        delete cleanedMetadata.humanResponse;
                        delete cleanedMetadata.respondedBy;
                        delete cleanedMetadata.respondedAt;
                        delete cleanedMetadata.approvalQuestion;
                        delete cleanedMetadata.approvalOptions;
                        delete cleanedMetadata.pausedAtNode;
                        try {
                            await supabaseClient_1.supabase
                                .from("agent_executions")
                                .update({
                                status: "running",
                                metadata: cleanedMetadata,
                                updated_at: new Date().toISOString(),
                            })
                                .eq("id", executionId);
                        }
                        catch (updateErr) {
                            logger_1.logger.error("Failed to update execution after approval", {
                                error: updateErr,
                                executionId,
                            });
                        }
                        return resolve({
                            success: true,
                            output: {
                                approved: humanResponse === options[0],
                                response: humanResponse,
                                respondedBy,
                                respondedAt,
                            },
                            logs: [
                                `human-pause: received response "${humanResponse}" from ${respondedBy} at ${respondedAt}`,
                            ],
                        });
                    }
                }
                catch (queryError) {
                    logger_1.logger.warn("Error during execution polling", { error: queryError });
                    // Continue polling on error
                }
            };
            // Start polling every 2 seconds
            interval = setInterval(pollForResponse, 2000);
            // Initial poll
            pollForResponse();
        });
    }
    catch (error) {
        logger_1.logger.error("Unexpected error in human-pause handler", { error });
        return {
            success: false,
            error: `Unexpected error in human-pause: ${error?.message || String(error)}`,
            output: {
                text: "Pause failed with unexpected error",
                message: error?.message || String(error),
            },
            logs: [
                `human-pause failed with unexpected error: ${error?.message || String(error)}`,
            ],
        };
    }
}
