"use strict";
/**
 * Advanced LangGraph State System
 * Provides type-safe state management with memory integration and streaming support
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateUtils = exports.StateValidation = exports.AgentState = void 0;
const langgraph_1 = require("@langchain/langgraph");
const zod_1 = require("zod");
/**
 * Agent Execution State - Advanced state management for LangGraph
 */
exports.AgentState = langgraph_1.Annotation.Root({
    // Core execution data
    messages: (0, langgraph_1.Annotation)({
        reducer: (x, y) => x.concat(y),
    }),
    // Workflow context
    workflowId: (langgraph_1.Annotation),
    executionId: (langgraph_1.Annotation),
    userId: (langgraph_1.Annotation),
    // Variables and configuration
    variables: (0, langgraph_1.Annotation)({
        reducer: (x, y) => ({ ...x, ...y }),
    }),
    apiKeys: (langgraph_1.Annotation),
    // Memory systems
    shortTermMemory: (0, langgraph_1.Annotation)({
        reducer: (x, y) => ({ ...x, ...y }),
    }),
    longTermMemory: (0, langgraph_1.Annotation)({
        reducer: (x, y) => [...x, ...y],
    }),
    // Node execution results
    nodeResults: (0, langgraph_1.Annotation)({
        reducer: (x, y) => ({ ...x, ...y }),
    }),
    // Node status tracking
    nodeStatuses: (0, langgraph_1.Annotation)({
        reducer: (x, y) => ({ ...x, ...y }),
    }),
    // Execution tracking
    nodeExecutionOrder: (0, langgraph_1.Annotation)({
        reducer: (x, y) => [...x, ...y],
    }),
    nodeDependencies: (langgraph_1.Annotation),
    // Streaming and updates
    streamEvents: (0, langgraph_1.Annotation)({
        reducer: (x, y) => [...x, ...y],
    }),
    // Status tracking
    status: (langgraph_1.Annotation),
    currentNode: (langgraph_1.Annotation),
    // Logs and debugging
    logs: (0, langgraph_1.Annotation)({
        reducer: (x, y) => [...x, ...y],
    }),
    // Errors
    errors: (0, langgraph_1.Annotation)({
        reducer: (x, y) => [...x, ...y],
    }),
    // Timing information
    startTime: (langgraph_1.Annotation),
    endTime: (langgraph_1.Annotation),
    nodeStartTimes: (0, langgraph_1.Annotation)({
        reducer: (x, y) => ({ ...x, ...y }),
    }),
    nodeEndTimes: (0, langgraph_1.Annotation)({
        reducer: (x, y) => ({ ...x, ...y }),
    }),
    // Retry mechanism
    nodeRetryCount: (0, langgraph_1.Annotation)({
        reducer: (x, y) => ({ ...x, ...y }),
    }),
    maxRetries: (langgraph_1.Annotation),
    // Tool calls and results
    toolCalls: (0, langgraph_1.Annotation)({
        reducer: (x, y) => [...x, ...y],
    }),
    toolResults: (0, langgraph_1.Annotation)({
        reducer: (x, y) => ({ ...x, ...y }),
    }),
    // Metadata
    metadata: (0, langgraph_1.Annotation)({
        reducer: (x, y) => ({ ...x, ...y }),
    }),
    // Output
    output: (0, langgraph_1.Annotation)({
        reducer: (x, y) => ({ ...x, ...y }),
    }),
});
/**
 * Validation schemas
 */
exports.StateValidation = {
    nodeResult: zod_1.z.object({
        nodeId: zod_1.z.string(),
        success: zod_1.z.boolean(),
        data: zod_1.z.record(zod_1.z.any()),
        messages: zod_1.z.array(zod_1.z.any()).optional(),
        errors: zod_1.z
            .array(zod_1.z.object({
            error: zod_1.z.string(),
            timestamp: zod_1.z.date(),
        }))
            .optional(),
        executionTime: zod_1.z.number(),
        toolCalls: zod_1.z
            .array(zod_1.z.object({
            id: zod_1.z.string(),
            toolName: zod_1.z.string(),
            input: zod_1.z.record(zod_1.z.any()),
        }))
            .optional(),
    }),
    streamEvent: zod_1.z.object({
        type: zod_1.z.enum([
            "node_start",
            "node_end",
            "node_error",
            "tool_call",
            "tool_result",
            "message",
            "debug",
            "state_update",
            "execution_complete",
            "execution_error",
        ]),
        nodeId: zod_1.z.string().optional(),
        data: zod_1.z.any(),
        timestamp: zod_1.z.date(),
        executionId: zod_1.z.string(),
    }),
};
/**
 * State utility functions
 */
exports.StateUtils = {
    /**
     * Add a message to state
     */
    addMessage(state, message) {
        return {
            ...state,
            messages: [...state.messages, message],
        };
    },
    /**
     * Add a log entry
     */
    addLog(state, level, message, details, nodeId) {
        return {
            ...state,
            logs: [
                ...state.logs,
                {
                    timestamp: new Date(),
                    level,
                    message,
                    nodeId,
                    details,
                },
            ],
        };
    },
    /**
     * Add an error
     */
    addError(state, error, nodeId, stack) {
        const currentRetries = state.nodeRetryCount[nodeId || "global"] || 0;
        return {
            ...state,
            errors: [
                ...state.errors,
                {
                    nodeId,
                    error,
                    timestamp: new Date(),
                    stack,
                    retryCount: currentRetries,
                },
            ],
            nodeRetryCount: {
                ...state.nodeRetryCount,
                [nodeId || "global"]: currentRetries + 1,
            },
        };
    },
    /**
     * Add a stream event
     */
    addStreamEvent(state, event) {
        return {
            ...state,
            streamEvents: [
                ...state.streamEvents,
                {
                    ...event,
                    timestamp: new Date(),
                },
            ],
        };
    },
    /**
     * Update node result
     */
    updateNodeResult(state, nodeId, result) {
        return {
            ...state,
            nodeResults: {
                ...state.nodeResults,
                [nodeId]: result,
            },
        };
    },
    /**
     * Get node execution time
     */
    getNodeExecutionTime(state, nodeId) {
        const start = state.nodeStartTimes[nodeId];
        const end = state.nodeEndTimes[nodeId];
        if (!start || !end)
            return 0;
        return end.getTime() - start.getTime();
    },
    /**
     * Get total execution time
     */
    getTotalExecutionTime(state) {
        if (!state.endTime || !state.startTime)
            return 0;
        return state.endTime.getTime() - state.startTime.getTime();
    },
    /**
     * Check if node can be retried
     */
    canRetry(state, nodeId) {
        const retries = state.nodeRetryCount[nodeId] || 0;
        return retries < state.maxRetries;
    },
    /**
     * Update short-term memory
     */
    updateShortTermMemory(state, key, value) {
        return {
            ...state,
            shortTermMemory: {
                ...state.shortTermMemory,
                [key]: value,
            },
        };
    },
    /**
     * Add to long-term memory
     */
    addToLongTermMemory(state, content, embedding, metadata) {
        return {
            ...state,
            longTermMemory: [
                ...state.longTermMemory,
                {
                    id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    content,
                    embedding,
                    metadata: metadata || {},
                    timestamp: new Date(),
                },
            ],
        };
    },
};
