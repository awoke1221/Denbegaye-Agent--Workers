"use strict";
/**
 * Advanced Streaming Execution Engine
 * Handles real-time streaming with WebSocket support for agent execution
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.streamingExecutionEngine = exports.StreamingExecutionEngine = void 0;
exports.executeWorkflowWithStreaming = executeWorkflowWithStreaming;
exports.createStreamingContext = createStreamingContext;
const langgraphWorkflowBuilder_1 = require("./langgraphWorkflowBuilder");
const logger_1 = require("./logger");
/**
 * Streaming execution engine for LangGraph workflows
 */
class StreamingExecutionEngine {
    constructor() {
        this.activeExecutions = new Map();
        this.streamListeners = new Map();
    }
    /**
     * Start streaming execution
     */
    async executeWithStreaming(config, input, onStream) {
        const executionId = config.executionId;
        const abortController = new AbortController();
        this.activeExecutions.set(executionId, abortController);
        try {
            // Create workflow builder
            const builder = (0, langgraphWorkflowBuilder_1.createWorkflowBuilder)(config);
            // Register stream callback ONLY if not using streamExecute
            // (streamExecute handles its own event collection to avoid duplicates)
            if (!config.enableStreaming) {
                builder.onStream((event) => {
                    onStream?.(event);
                    config.broadcastFn?.(event);
                    // Emit to all listeners
                    const listeners = this.streamListeners.get(executionId) || new Set();
                    for (const listener of listeners) {
                        try {
                            listener(event);
                        }
                        catch (error) {
                            logger_1.logger.error("Stream listener error", {
                                error: error.message,
                            });
                        }
                    }
                });
            }
            // Execute with streaming
            const startTime = Date.now();
            logger_1.logger.debug("Starting streaming execution", {
                executionId,
                workflowId: config.workflowId,
            });
            const result = (await (config.enableStreaming
                ? this.streamExecuteWorkflow(builder, input, executionId, onStream, config.broadcastFn)
                : builder.execute(input)));
            const executionTime = Date.now() - startTime;
            // Cleanup
            this.activeExecutions.delete(executionId);
            this.streamListeners.delete(executionId);
            return {
                ...result,
                executionTime,
            };
        }
        catch (error) {
            const errorMessage = error.message;
            logger_1.logger.error("Streaming execution failed", {
                executionId,
                error: errorMessage,
            });
            // Cleanup
            this.activeExecutions.delete(executionId);
            this.streamListeners.delete(executionId);
            throw error;
        }
    }
    /**
     * Stream execute workflow
     */
    async streamExecuteWorkflow(builder, input, executionId, onStream, broadcastFn) {
        const logs = [];
        const errors = [];
        const startTime = Date.now();
        let output = input;
        try {
            // Use streamExecute generator to collect events without duplicate listeners
            for await (const event of builder.streamExecute(input)) {
                // Broadcast the event to all registered listeners
                onStream?.(event);
                broadcastFn?.(event);
                // Emit to all subscribed listeners for this execution
                const listeners = this.streamListeners.get(executionId) || new Set();
                for (const listener of listeners) {
                    try {
                        listener(event);
                    }
                    catch (error) {
                        logger_1.logger.error("Stream listener error", {
                            error: error.message,
                        });
                    }
                }
                // Collect output from node_end events
                if (event.type === "node_end") {
                    output = { ...output, ...event.data };
                }
                else if (event.type === "node_error") {
                    errors.push(event.data.error);
                }
            }
            return {
                success: errors.length === 0,
                output,
                logs,
                errors,
                executionTime: Date.now() - startTime,
            };
        }
        catch (error) {
            const errorMessage = error.message;
            errors.push(errorMessage);
            return {
                success: false,
                output,
                logs,
                errors,
                executionTime: Date.now() - startTime,
            };
        }
    }
    /**
     * Subscribe to execution events
     */
    subscribe(executionId, listener) {
        if (!this.streamListeners.has(executionId)) {
            this.streamListeners.set(executionId, new Set());
        }
        const listeners = this.streamListeners.get(executionId);
        listeners.add(listener);
        // Return unsubscribe function
        return () => {
            listeners.delete(listener);
            if (listeners.size === 0) {
                this.streamListeners.delete(executionId);
            }
        };
    }
    /**
     * Cancel execution
     */
    cancel(executionId) {
        const controller = this.activeExecutions.get(executionId);
        if (controller) {
            controller.abort();
            this.activeExecutions.delete(executionId);
        }
        this.streamListeners.delete(executionId);
        logger_1.logger.debug("Execution cancelled", { executionId });
    }
    /**
     * Get active executions
     */
    getActiveExecutions() {
        return Array.from(this.activeExecutions.keys());
    }
    /**
     * Wait for execution to complete
     */
    async waitForCompletion(executionId, timeoutMs) {
        const startTime = Date.now();
        const timeout = timeoutMs || 60000; // Default 60 seconds
        while (this.activeExecutions.has(executionId)) {
            if (Date.now() - startTime > timeout) {
                throw new Error(`Execution timeout after ${timeout}ms`);
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return true;
    }
    /**
     * Get execution status
     */
    isExecuting(executionId) {
        return this.activeExecutions.has(executionId);
    }
    /**
     * Clear completed executions
     */
    clearCompletedExecutions() {
        const beforeCount = this.activeExecutions.size;
        // All non-active executions are considered completed
        this.activeExecutions.clear();
        return beforeCount;
    }
}
exports.StreamingExecutionEngine = StreamingExecutionEngine;
/**
 * Global streaming execution engine instance
 */
exports.streamingExecutionEngine = new StreamingExecutionEngine();
/**
 * Execute workflow with streaming
 */
async function executeWorkflowWithStreaming(config, input, onStream) {
    return exports.streamingExecutionEngine.executeWithStreaming(config, input, onStream);
}
/**
 * Create a streaming execution context for WebSocket handlers
 */
function createStreamingContext(executionId) {
    return {
        subscribe: (listener) => {
            return exports.streamingExecutionEngine.subscribe(executionId, listener);
        },
        cancel: () => exports.streamingExecutionEngine.cancel(executionId),
        isExecuting: () => exports.streamingExecutionEngine.isExecuting(executionId),
        waitForCompletion: (timeoutMs) => exports.streamingExecutionEngine.waitForCompletion(executionId, timeoutMs),
    };
}
