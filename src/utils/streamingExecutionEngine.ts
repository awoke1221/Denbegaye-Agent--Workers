/**
 * Advanced Streaming Execution Engine
 * Handles real-time streaming with WebSocket support for agent execution
 */

import {
  createWorkflowBuilder,
  WorkflowConfig,
} from "./langgraphWorkflowBuilder";
import { StreamEvent } from "./langgraphState";
import { logger } from "./logger";

export interface StreamingExecutionConfig extends WorkflowConfig {
  socketId?: string;
  broadcastFn?: (event: StreamEvent) => void;
}

/**
 * Streaming execution engine for LangGraph workflows
 */
export class StreamingExecutionEngine {
  private activeExecutions: Map<string, AbortController> = new Map();
  private streamListeners: Map<string, Set<(event: StreamEvent) => void>> =
    new Map();

  /**
   * Start streaming execution
   */
  async executeWithStreaming(
    config: StreamingExecutionConfig,
    input: Record<string, any>,
    onStream?: (event: StreamEvent) => void,
  ): Promise<{
    success: boolean;
    output: Record<string, any>;
    logs: string[];
    errors: string[];
    executionTime: number;
  }> {
    const executionId = config.executionId;
    const abortController = new AbortController();

    this.activeExecutions.set(executionId, abortController);

    try {
      // Create workflow builder
      const builder = createWorkflowBuilder(config);

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
            } catch (error) {
              logger.error("Stream listener error", {
                error: (error as Error).message,
              });
            }
          }
        });
      }

      // Execute with streaming
      const startTime = Date.now();

      logger.debug("Starting streaming execution", {
        executionId,
        workflowId: config.workflowId,
      });

      const result = (await (config.enableStreaming
        ? this.streamExecuteWorkflow(
            builder,
            input,
            executionId,
            onStream,
            config.broadcastFn,
          )
        : builder.execute(input))) as any;

      const executionTime = Date.now() - startTime;

      // Cleanup
      this.activeExecutions.delete(executionId);
      this.streamListeners.delete(executionId);

      return {
        ...result,
        executionTime,
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      logger.error("Streaming execution failed", {
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
  private async streamExecuteWorkflow(
    builder: any,
    input: Record<string, any>,
    executionId: string,
    onStream?: (event: StreamEvent) => void,
    broadcastFn?: (event: StreamEvent) => void,
  ): Promise<{
    success: boolean;
    output: Record<string, any>;
    logs: string[];
    errors: string[];
    executionTime: number;
  }> {
    const logs: string[] = [];
    const errors: string[] = [];
    const startTime = Date.now();
    let output: Record<string, any> = input;

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
          } catch (error) {
            logger.error("Stream listener error", {
              error: (error as Error).message,
            });
          }
        }

        // Collect output from node_end events
        if (event.type === "node_end") {
          output = { ...output, ...event.data };
        } else if (event.type === "node_error") {
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
    } catch (error) {
      const errorMessage = (error as Error).message;
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
  subscribe(
    executionId: string,
    listener: (event: StreamEvent) => void,
  ): () => void {
    if (!this.streamListeners.has(executionId)) {
      this.streamListeners.set(executionId, new Set());
    }

    const listeners = this.streamListeners.get(executionId)!;
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
  cancel(executionId: string): void {
    const controller = this.activeExecutions.get(executionId);
    if (controller) {
      controller.abort();
      this.activeExecutions.delete(executionId);
    }

    this.streamListeners.delete(executionId);
    logger.debug("Execution cancelled", { executionId });
  }

  /**
   * Get active executions
   */
  getActiveExecutions(): string[] {
    return Array.from(this.activeExecutions.keys());
  }

  /**
   * Wait for execution to complete
   */
  async waitForCompletion(
    executionId: string,
    timeoutMs?: number,
  ): Promise<boolean> {
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
  isExecuting(executionId: string): boolean {
    return this.activeExecutions.has(executionId);
  }

  /**
   * Clear completed executions
   */
  clearCompletedExecutions(): number {
    const beforeCount = this.activeExecutions.size;
    // All non-active executions are considered completed
    this.activeExecutions.clear();
    return beforeCount;
  }
}

/**
 * Global streaming execution engine instance
 */
export const streamingExecutionEngine = new StreamingExecutionEngine();

/**
 * Execute workflow with streaming
 */
export async function executeWorkflowWithStreaming(
  config: StreamingExecutionConfig,
  input: Record<string, any>,
  onStream?: (event: StreamEvent) => void,
): Promise<any> {
  return streamingExecutionEngine.executeWithStreaming(config, input, onStream);
}

/**
 * Create a streaming execution context for WebSocket handlers
 */
export function createStreamingContext(executionId: string) {
  return {
    subscribe: (listener: (event: StreamEvent) => void) => {
      return streamingExecutionEngine.subscribe(executionId, listener);
    },
    cancel: () => streamingExecutionEngine.cancel(executionId),
    isExecuting: () => streamingExecutionEngine.isExecuting(executionId),
    waitForCompletion: (timeoutMs?: number) =>
      streamingExecutionEngine.waitForCompletion(executionId, timeoutMs),
  };
}
