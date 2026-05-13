/**
 * Advanced LangGraph State System
 * Provides type-safe state management with memory integration and streaming support
 */

import { Annotation } from "@langchain/langgraph";
import {
  BaseMessage,
  AIMessage,
  HumanMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { z } from "zod";

/**
 * Agent Execution State - Advanced state management for LangGraph
 */
export const AgentState = Annotation.Root({
  // Core execution data
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),

  // Workflow context
  workflowId: Annotation<string>,
  executionId: Annotation<string>,
  userId: Annotation<string>,

  // Variables and configuration
  variables: Annotation<Record<string, any>>({
    reducer: (x, y) => ({ ...x, ...y }),
  }),

  apiKeys: Annotation<Record<string, any>>,

  // Memory systems
  shortTermMemory: Annotation<Record<string, any>>({
    reducer: (x, y) => ({ ...x, ...y }),
  }),

  longTermMemory: Annotation<
    Array<{
      id: string;
      content: string;
      embedding: number[];
      metadata: Record<string, any>;
      timestamp: Date;
    }>
  >({
    reducer: (x, y) => [...x, ...y],
  }),

  // Node execution results
  nodeResults: Annotation<Record<string, any>>({
    reducer: (x, y) => ({ ...x, ...y }),
  }),

  // Node status tracking
  nodeStatuses: Annotation<
    Record<string, "pending" | "running" | "completed" | "failed">
  >({
    reducer: (x, y) => ({ ...x, ...y }),
  }),

  // Execution tracking
  nodeExecutionOrder: Annotation<string[]>({
    reducer: (x, y) => [...x, ...y],
  }),

  nodeDependencies: Annotation<Record<string, string[]>>,

  // Streaming and updates
  streamEvents: Annotation<
    Array<{
      type: string;
      nodeId?: string;
      data: any;
      timestamp: Date;
    }>
  >({
    reducer: (x, y) => [...x, ...y],
  }),

  // Status tracking
  status: Annotation<"idle" | "running" | "completed" | "failed" | "cancelled">,

  currentNode: Annotation<string | null>,

  // Logs and debugging
  logs: Annotation<
    Array<{
      timestamp: Date;
      level: "info" | "warn" | "error" | "debug";
      message: string;
      nodeId?: string;
      details?: Record<string, any>;
    }>
  >({
    reducer: (x, y) => [...x, ...y],
  }),

  // Errors
  errors: Annotation<
    Array<{
      nodeId?: string;
      error: string;
      timestamp: Date;
      stack?: string;
      retryCount: number;
    }>
  >({
    reducer: (x, y) => [...x, ...y],
  }),

  // Timing information
  startTime: Annotation<Date>,

  endTime: Annotation<Date | null>,

  nodeStartTimes: Annotation<Record<string, Date>>({
    reducer: (x, y) => ({ ...x, ...y }),
  }),

  nodeEndTimes: Annotation<Record<string, Date>>({
    reducer: (x, y) => ({ ...x, ...y }),
  }),

  // Retry mechanism
  nodeRetryCount: Annotation<Record<string, number>>({
    reducer: (x, y) => ({ ...x, ...y }),
  }),

  maxRetries: Annotation<number>,

  // Tool calls and results
  toolCalls: Annotation<
    Array<{
      id: string;
      toolName: string;
      input: Record<string, any>;
      nodeId: string;
      timestamp: Date;
    }>
  >({
    reducer: (x, y) => [...x, ...y],
  }),

  toolResults: Annotation<Record<string, any>>({
    reducer: (x, y) => ({ ...x, ...y }),
  }),

  // Metadata
  metadata: Annotation<Record<string, any>>({
    reducer: (x, y) => ({ ...x, ...y }),
  }),

  // Output
  output: Annotation<Record<string, any>>({
    reducer: (x, y) => ({ ...x, ...y }),
  }),
});

export type AgentStateType = typeof AgentState.State;

/**
 * Extended State with LangChain integration
 */
export interface ExtendedAgentState extends AgentStateType {
  // For LangChain integration
  input?: Record<string, any>;

  // Streaming configuration
  enableStreaming?: boolean;
  streamingInterval?: number;

  // Parallel execution
  parallelNodes?: string[];

  // Circuit breaker
  circuitBreakerOpen?: boolean;
  circuitBreakerErrors?: number;
}

/**
 * Node execution context for individual node handlers
 */
export interface NodeExecutionContext {
  state: AgentStateType;
  nodeId: string;
  nodeConfig: Record<string, any>;
  apiKeys: Record<string, any>;
  tools: Record<string, any>;
}

/**
 * Node execution result
 */
export interface NodeExecutionResult {
  nodeId: string;
  success: boolean;
  data?: Record<string, any>;
  error?: string;
  messages?: BaseMessage[];
  errors?: Array<{
    error: string;
    timestamp: Date;
  }>;
  executionTime: number;
  toolCalls?: Array<{
    id: string;
    toolName: string;
    input: Record<string, any>;
  }>;
}

/**
 * Stream event types
 */
export type StreamEventType =
  | "node_start"
  | "node_end"
  | "node_error"
  | "tool_call"
  | "tool_result"
  | "message"
  | "debug"
  | "state_update"
  | "execution_complete"
  | "execution_error";

/**
 * Stream event
 */
export interface StreamEvent {
  type: StreamEventType;
  nodeId?: string;
  data: any;
  timestamp: Date;
  executionId: string;
}

/**
 * Validation schemas
 */
export const StateValidation = {
  nodeResult: z.object({
    nodeId: z.string(),
    success: z.boolean(),
    data: z.record(z.any()),
    messages: z.array(z.any()).optional(),
    errors: z
      .array(
        z.object({
          error: z.string(),
          timestamp: z.date(),
        }),
      )
      .optional(),
    executionTime: z.number(),
    toolCalls: z
      .array(
        z.object({
          id: z.string(),
          toolName: z.string(),
          input: z.record(z.any()),
        }),
      )
      .optional(),
  }),

  streamEvent: z.object({
    type: z.enum([
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
    nodeId: z.string().optional(),
    data: z.any(),
    timestamp: z.date(),
    executionId: z.string(),
  }),
};

/**
 * State utility functions
 */
export const StateUtils = {
  /**
   * Add a message to state
   */
  addMessage(state: AgentStateType, message: BaseMessage): AgentStateType {
    return {
      ...state,
      messages: [...state.messages, message],
    };
  },

  /**
   * Add a log entry
   */
  addLog(
    state: AgentStateType,
    level: "info" | "warn" | "error" | "debug",
    message: string,
    details?: Record<string, any>,
    nodeId?: string,
  ): AgentStateType {
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
  addError(
    state: AgentStateType,
    error: string,
    nodeId?: string,
    stack?: string,
  ): AgentStateType {
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
  addStreamEvent(
    state: AgentStateType,
    event: Omit<StreamEvent, "timestamp">,
  ): AgentStateType {
    return {
      ...state,
      streamEvents: [
        ...state.streamEvents,
        {
          ...event,
          timestamp: new Date(),
        } as any,
      ],
    };
  },

  /**
   * Update node result
   */
  updateNodeResult(
    state: AgentStateType,
    nodeId: string,
    result: any,
  ): AgentStateType {
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
  getNodeExecutionTime(state: AgentStateType, nodeId: string): number {
    const start = state.nodeStartTimes[nodeId];
    const end = state.nodeEndTimes[nodeId];

    if (!start || !end) return 0;
    return end.getTime() - start.getTime();
  },

  /**
   * Get total execution time
   */
  getTotalExecutionTime(state: AgentStateType): number {
    if (!state.endTime || !state.startTime) return 0;
    return state.endTime.getTime() - state.startTime.getTime();
  },

  /**
   * Check if node can be retried
   */
  canRetry(state: AgentStateType, nodeId: string): boolean {
    const retries = state.nodeRetryCount[nodeId] || 0;
    return retries < state.maxRetries;
  },

  /**
   * Update short-term memory
   */
  updateShortTermMemory(
    state: AgentStateType,
    key: string,
    value: any,
  ): AgentStateType {
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
  addToLongTermMemory(
    state: AgentStateType,
    content: string,
    embedding: number[],
    metadata?: Record<string, any>,
  ): AgentStateType {
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
