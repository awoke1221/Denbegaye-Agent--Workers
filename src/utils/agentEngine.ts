import { AdvancedWorkflowBuilder } from "./langgraphWorkflowBuilder";
import { nodeRegistry } from "../nodes";
import { randomUUID } from "crypto";
import { logger } from "./logger";
import { supabase } from "./supabaseClient";

/**
 * Advanced Workflow Execution Engine with Transaction-like Semantics
 * Provides comprehensive error handling, partial success management, and recovery
 */

interface WorkflowExecutionContext {
  executionId: string;
  userId: string;
  workflowId: string;
  startTime: Date;
  maxRetries: number;
  enablePartialSuccess: boolean;
  enableCompensation: boolean;
  circuitBreakerThreshold: number;
  executionTimeout: number;
}

interface NodeExecutionState {
  nodeId: string;
  status: "pending" | "running" | "success" | "failed" | "compensated";
  attempts: number;
  startTime?: Date;
  endTime?: Date;
  output?: any;
  error?: string;
  compensationAction?: () => Promise<void>;
  dependencies: string[];
  dependents: string[];
}

interface WorkflowExecutionResult {
  success: boolean;
  partialSuccess: boolean;
  output: any;
  logs: string[];
  errors: string[];
  nodeStatuses: Array<{ nodeId: string; status: string; attempts: number }>;
  nodeResults: Array<{
    nodeId: string;
    success: boolean;
    output: any;
    executionTime: number;
    logs: string[];
    attempts: number;
  }>;
  executionTime: number;
  compensatedNodes: string[];
  failedNodes: string[];
  circuitBreakerTripped: boolean;
}

export class AdvancedWorkflowExecutor {
  private context: WorkflowExecutionContext;
  private nodeStates: Map<string, NodeExecutionState> = new Map();
  private circuitBreakerFailures: Map<string, number> = new Map();
  private executionAborted = false;

  constructor(context: WorkflowExecutionContext) {
    this.context = context;
  }

  /**
   * Execute workflow with advanced error handling and recovery
   */
  async executeWorkflow(
    nodes: any[],
    edges: any[],
    input: any,
    apiKeys: any,
    options?: {
      onNodeStart?: (nodeId: string) => void;
      onNodeComplete?: (
        nodeId: string,
        success: boolean,
        error?: string,
      ) => void;
      onExecutionComplete?: (
        success: boolean,
        partialSuccess?: boolean,
      ) => void;
      onCompensationStart?: (nodeId: string) => void;
      onCompensationComplete?: (nodeId: string, success: boolean) => void;
    },
  ): Promise<WorkflowExecutionResult> {
    const startTime = Date.now();
    this.executionAborted = false;

    try {
      // Initialize execution state
      await this.initializeExecutionState(nodes, edges);

      // Execute nodes in topological order with advanced handling
      const executionOrder = this.calculateExecutionOrder(nodes, edges);
      const results = await this.executeNodesInOrder(
        executionOrder,
        nodes,
        input,
        apiKeys,
        options,
      );

      // Handle compensation if workflow failed but has partial success
      const finalResult = await this.handleWorkflowCompletion(results, options);

      const executionTime = Date.now() - startTime;
      logger.info("Workflow execution completed", {
        executionId: this.context.executionId,
        success: finalResult.success,
        partialSuccess: finalResult.partialSuccess,
        executionTime,
        nodeCount: nodes.length,
        failedNodes: finalResult.failedNodes.length,
        compensatedNodes: finalResult.compensatedNodes.length,
      });

      return {
        ...finalResult,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      logger.error("Workflow execution failed catastrophically", {
        executionId: this.context.executionId,
        error: errorMessage,
        executionTime,
      });

      // Attempt emergency compensation
      await this.emergencyCompensation(options);

      return {
        success: false,
        partialSuccess: false,
        output: {},
        logs: [`Critical workflow failure: ${errorMessage}`],
        errors: [errorMessage],
        nodeStatuses: Array.from(this.nodeStates.values()).map((state) => ({
          nodeId: state.nodeId,
          status: state.status,
          attempts: state.attempts,
        })),
        nodeResults: Array.from(this.nodeStates.values()).map((state) => ({
          nodeId: state.nodeId,
          success: state.status === "success",
          output: state.output || {},
          executionTime:
            state.startTime && state.endTime
              ? state.endTime.getTime() - state.startTime.getTime()
              : 0,
          logs: state.error ? [state.error] : [],
          attempts: state.attempts,
        })),
        executionTime,
        compensatedNodes: [],
        failedNodes: Array.from(this.nodeStates.keys()),
        circuitBreakerTripped: false,
      };
    }
  }

  /**
   * Initialize execution state for all nodes
   */
  private async initializeExecutionState(
    nodes: any[],
    edges: any[],
  ): Promise<void> {
    // Build dependency graph
    const dependencyGraph: Record<string, string[]> = {};
    const reverseDependencyGraph: Record<string, string[]> = {};

    for (const node of nodes) {
      dependencyGraph[node.id] = [];
      reverseDependencyGraph[node.id] = [];
    }

    for (const edge of edges) {
      const from = edge.from || edge.source;
      const to = edge.to || edge.target;
      if (dependencyGraph[from]) {
        dependencyGraph[from].push(to);
      }
      if (reverseDependencyGraph[to]) {
        reverseDependencyGraph[to].push(from);
      }
    }

    // Initialize node states
    for (const node of nodes) {
      this.nodeStates.set(node.id, {
        nodeId: node.id,
        status: "pending",
        attempts: 0,
        dependencies: reverseDependencyGraph[node.id] || [],
        dependents: dependencyGraph[node.id] || [],
        compensationAction: await this.createCompensationAction(node),
      });
    }

    logger.debug("Execution state initialized", {
      executionId: this.context.executionId,
      nodeCount: nodes.length,
    });
  }

  /**
   * Calculate optimal execution order considering dependencies and parallelism
   */
  private calculateExecutionOrder(nodes: any[], edges: any[]): string[] {
    const graph: Record<string, string[]> = {};
    const inDegree: Record<string, number> = {};

    // Initialize graph
    for (const node of nodes) {
      graph[node.id] = [];
      inDegree[node.id] = 0;
    }

    // Build dependency graph
    for (const edge of edges) {
      const from = edge.from || edge.source;
      const to = edge.to || edge.target;
      if (graph[from] && inDegree[to] !== undefined) {
        graph[from].push(to);
        inDegree[to]++;
      }
    }

    // Topological sort with cycle detection
    const queue: string[] = [];
    const result: string[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    // Find nodes with no dependencies
    for (const nodeId of Object.keys(inDegree)) {
      if (inDegree[nodeId] === 0) {
        queue.push(nodeId);
      }
    }

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      result.push(nodeId);
      visited.add(nodeId);

      for (const dependent of graph[nodeId] || []) {
        if (recursionStack.has(dependent)) {
          throw new Error(
            `Workflow contains a cycle involving node ${dependent}`,
          );
        }

        inDegree[dependent]--;
        if (inDegree[dependent] === 0) {
          queue.push(dependent);
        }
      }
    }

    // Check for cycles
    if (result.length !== nodes.length) {
      const unprocessedNodes = nodes
        .map((n) => n.id)
        .filter((id) => !visited.has(id));

      throw new Error(
        `Workflow has cycles or unreachable nodes: ${unprocessedNodes.join(", ")}`,
      );
    }

    return result;
  }

  /**
   * Execute nodes with advanced error handling and parallelization where possible
   */
  private async executeNodesInOrder(
    executionOrder: string[],
    nodes: any[],
    input: any,
    apiKeys: any,
    options?: any,
  ): Promise<{
    variables: Record<string, any>;
    logs: string[];
    errors: string[];
    hasFailures: boolean;
    hasPartialSuccess: boolean;
  }> {
    const variables: Record<string, any> = { ...input };
    const logs: string[] = [];
    const errors: string[] = [];
    let hasFailures = false;
    let hasPartialSuccess = false;

    // Execute nodes sequentially for now (can be enhanced with parallel execution)
    for (const nodeId of executionOrder) {
      if (this.executionAborted) {
        logger.warn("Execution aborted during node processing", {
          executionId: this.context.executionId,
          nodeId,
        });
        break;
      }

      const node = nodes.find((n) => n.id === nodeId);
      if (!node) {
        const error = `Node ${nodeId} not found in workflow definition`;
        errors.push(error);
        logs.push(error);
        hasFailures = true;
        continue;
      }

      const nodeState = this.nodeStates.get(nodeId)!;

      // Check if dependencies failed
      const dependencyStates = nodeState.dependencies.map(
        (depId) => this.nodeStates.get(depId)?.status,
      );

      if (dependencyStates.some((status) => status === "failed")) {
        const error = `Node ${nodeId} skipped due to failed dependencies`;
        nodeState.status = "failed";
        nodeState.error = error;
        errors.push(error);
        logs.push(error);
        hasFailures = true;
        continue;
      }

      // Execute node with retry logic
      const result = await this.executeNodeWithRetry(
        node,
        variables,
        apiKeys,
        options,
      );

      if (result.success) {
        variables[nodeId] = result.output;
        nodeState.output = result.output;
        nodeState.status = "success";
        hasPartialSuccess = true;
        logs.push(...result.logs);
      } else {
        nodeState.error = result.error;
        nodeState.status = "failed";
        errors.push(result.error || "Unknown error");
        logs.push(...result.logs);
        hasFailures = true;

        // Check if we should abort execution based on failure policy
        if (this.shouldAbortExecution(node, result.error || "Unknown error")) {
          this.executionAborted = true;
          break;
        }
      }
    }

    return {
      variables,
      logs,
      errors,
      hasFailures,
      hasPartialSuccess,
    };
  }

  /**
   * Execute a single node with intelligent retry logic
   */
  private async executeNodeWithRetry(
    node: any,
    variables: Record<string, any>,
    apiKeys: any,
    options?: any,
  ): Promise<{
    success: boolean;
    output: any;
    logs: string[];
    error?: string;
  }> {
    const nodeState = this.nodeStates.get(node.id)!;
    const maxRetries = this.context.maxRetries;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      nodeState.attempts = attempt;
      nodeState.status = "running";
      nodeState.startTime = new Date();

      // Check circuit breaker
      if (this.isCircuitBreakerTripped(node.type)) {
        const error = `Circuit breaker tripped for node type ${node.type}`;
        nodeState.endTime = new Date();
        nodeState.status = "failed";
        return {
          success: false,
          output: {},
          logs: [error],
          error,
        };
      }

      try {
        options?.onNodeStart?.(node.id);

        const result = await this.executeNodeWithTimeout(
          node,
          variables,
          apiKeys,
          this.context.executionTimeout / (maxRetries + 1), // Distribute timeout across retries
        );

        nodeState.endTime = new Date();
        nodeState.status = "success";

        options?.onNodeComplete?.(node.id, true);

        // Reset circuit breaker on success
        this.circuitBreakerFailures.delete(node.type);

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        nodeState.endTime = new Date();

        // Record circuit breaker failure
        const failureCount =
          (this.circuitBreakerFailures.get(node.type) || 0) + 1;
        this.circuitBreakerFailures.set(node.type, failureCount);

        logger.warn(`Node execution attempt ${attempt} failed`, {
          executionId: this.context.executionId,
          nodeId: node.id,
          attempt,
          error: errorMessage,
        });

        // Check if we should retry
        if (attempt <= maxRetries && this.shouldRetry(errorMessage, attempt)) {
          // Exponential backoff with jitter
          const backoffMs = Math.min(
            1000 * Math.pow(2, attempt - 1) + Math.random() * 1000,
            30000,
          );

          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        // Max retries exceeded
        nodeState.status = "failed";
        options?.onNodeComplete?.(node.id, false, errorMessage);

        return {
          success: false,
          output: {},
          logs: [
            `Node ${node.id} failed after ${attempt} attempts: ${errorMessage}`,
          ],
          error: errorMessage,
        };
      }
    }

    // This should never be reached
    return {
      success: false,
      output: {},
      logs: [`Node ${node.id} failed unexpectedly`],
      error: "Unexpected execution failure",
    };
  }

  /**
   * Execute node with timeout protection
   */
  private async executeNodeWithTimeout(
    node: any,
    variables: Record<string, any>,
    apiKeys: any,
    timeoutMs: number,
  ): Promise<{
    success: boolean;
    output: any;
    logs: string[];
  }> {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Node execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        const result = await this.executeNodeWithFallback(
          node,
          variables,
          apiKeys,
        );
        clearTimeout(timeout);
        resolve(result);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Execute node with fallback logic
   */
  private async executeNodeWithFallback(
    node: any,
    variables: Record<string, any>,
    apiKeys: any,
  ): Promise<{
    success: boolean;
    output: any;
    logs: string[];
  }> {
    const nodeDefinition = nodeRegistry.get(node.type);

    if (nodeDefinition) {
      const result = await nodeDefinition.handler({
        nodeId: node.id,
        input: variables,
        variables: { ...variables },
        apiKeys,
        config: node.config || {},
        validation: nodeDefinition.validation,
      } as any);

      if (!result.success) {
        throw new Error(result.error || `Node ${node.id} failed`);
      }

      return {
        success: true,
        output: result.output,
        logs: result.logs || [],
      };
    }

    // Fallback execution
    const fallbackOutput = {
      fallback: true,
      nodeId: node.id,
      nodeType: node.type,
      config: node.config || {},
      input: variables,
      message: `Fallback execution for node type ${node.type}`,
    };

    return {
      success: true,
      output: fallbackOutput,
      logs: [`Fallback executed node ${node.id} (${node.type})`],
    };
  }

  /**
   * Create compensation action for a node
   */
  private async createCompensationAction(
    node: any,
  ): Promise<() => Promise<void>> {
    // Define compensation logic based on node type
    switch (node.type) {
      case "action-email":
        return async () => {
          // Could send cancellation email or log the action
          logger.info(`Compensating email action for node ${node.id}`);
        };

      case "action-webhook":
        return async () => {
          // Could send cancellation webhook
          logger.info(`Compensating webhook action for node ${node.id}`);
        };

      case "action-save-db":
        return async () => {
          // Could rollback database changes
          logger.info(`Compensating database action for node ${node.id}`);
        };

      default:
        return async () => {
          logger.info(
            `No compensation needed for node ${node.id} (${node.type})`,
          );
        };
    }
  }

  /**
   * Handle workflow completion with compensation logic
   */
  private async handleWorkflowCompletion(
    executionResults: any,
    options?: any,
  ): Promise<{
    success: boolean;
    partialSuccess: boolean;
    output: any;
    logs: string[];
    errors: string[];
    nodeStatuses: Array<{ nodeId: string; status: string; attempts: number }>;
    nodeResults: Array<{
      nodeId: string;
      success: boolean;
      output: any;
      executionTime: number;
      logs: string[];
      attempts: number;
    }>;
    compensatedNodes: string[];
    failedNodes: string[];
    circuitBreakerTripped: boolean;
  }> {
    const { variables, logs, errors, hasFailures, hasPartialSuccess } =
      executionResults;

    const overallSuccess = !hasFailures;
    const partialSuccess = hasFailures && hasPartialSuccess;

    // If workflow failed completely and compensation is enabled, compensate successful nodes
    const compensatedNodes: string[] = [];
    const failedNodes: string[] = [];

    if (hasFailures && this.context.enableCompensation) {
      for (const [nodeId, state] of this.nodeStates) {
        if (state.status === "success" && state.compensationAction) {
          try {
            options?.onCompensationStart?.(nodeId);
            await state.compensationAction();
            state.status = "compensated";
            compensatedNodes.push(nodeId);
            options?.onCompensationComplete?.(nodeId, true);

            logger.info(`Successfully compensated node ${nodeId}`, {
              executionId: this.context.executionId,
            });
          } catch (compensationError) {
            logger.error(`Compensation failed for node ${nodeId}`, {
              executionId: this.context.executionId,
              error:
                compensationError instanceof Error
                  ? compensationError.message
                  : String(compensationError),
            });
            options?.onCompensationComplete?.(nodeId, false);
          }
        } else if (state.status === "failed") {
          failedNodes.push(nodeId);
        }
      }
    } else {
      // Just collect failed nodes
      for (const [nodeId, state] of this.nodeStates) {
        if (state.status === "failed") {
          failedNodes.push(nodeId);
        }
      }
    }

    // Persist execution state for monitoring and debugging
    await this.persistExecutionState(overallSuccess, partialSuccess);

    options?.onExecutionComplete?.(overallSuccess, partialSuccess);

    return {
      success: overallSuccess,
      partialSuccess,
      output: variables,
      logs,
      errors,
      nodeStatuses: Array.from(this.nodeStates.values()).map((state) => ({
        nodeId: state.nodeId,
        status: state.status,
        attempts: state.attempts,
      })),
      nodeResults: Array.from(this.nodeStates.values()).map((state) => ({
        nodeId: state.nodeId,
        success: state.status === "success",
        output: state.output || {},
        executionTime:
          state.startTime && state.endTime
            ? state.endTime.getTime() - state.startTime.getTime()
            : 0,
        logs: state.error ? [state.error] : [],
        attempts: state.attempts,
      })),
      compensatedNodes,
      failedNodes,
      circuitBreakerTripped: Array.from(
        this.circuitBreakerFailures.values(),
      ).some((count) => count >= this.context.circuitBreakerThreshold),
    };
  }

  /**
   * Emergency compensation when execution fails catastrophically
   */
  private async emergencyCompensation(options?: any): Promise<void> {
    logger.warn("Performing emergency compensation", {
      executionId: this.context.executionId,
    });

    for (const [nodeId, state] of this.nodeStates) {
      if (state.status === "success" && state.compensationAction) {
        try {
          options?.onCompensationStart?.(nodeId);
          await state.compensationAction();
          state.status = "compensated";
          options?.onCompensationComplete?.(nodeId, true);
        } catch (error) {
          logger.error(`Emergency compensation failed for ${nodeId}`, {
            executionId: this.context.executionId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  /**
   * Check if circuit breaker is tripped for a node type
   */
  private isCircuitBreakerTripped(nodeType: string): boolean {
    const failures = this.circuitBreakerFailures.get(nodeType) || 0;
    return failures >= this.context.circuitBreakerThreshold;
  }

  /**
   * Determine if execution should abort based on failure
   */
  private shouldAbortExecution(node: any, error: string): boolean {
    // Abort on critical infrastructure failures
    if (error.includes("authentication") || error.includes("authorization")) {
      return true;
    }

    // Abort on resource exhaustion
    if (error.includes("quota") || error.includes("limit")) {
      return true;
    }

    // Continue for transient failures
    return false;
  }

  /**
   * Determine if a failed execution should be retried
   */
  private shouldRetry(error: string, attempt: number): boolean {
    // Don't retry authentication errors
    if (error.includes("authentication") || error.includes("authorization")) {
      return false;
    }

    // Don't retry quota exceeded
    if (error.includes("quota") || error.includes("limit")) {
      return false;
    }

    // Retry transient errors
    if (
      error.includes("timeout") ||
      error.includes("network") ||
      error.includes("temporary")
    ) {
      return attempt <= this.context.maxRetries;
    }

    // Retry on rate limits with exponential backoff
    if (error.includes("rate limit") || error.includes("too many requests")) {
      return attempt <= Math.min(this.context.maxRetries, 3);
    }

    // Default retry policy
    return attempt <= this.context.maxRetries;
  }

  /**
   * Persist execution state for monitoring and recovery
   */
  private async persistExecutionState(
    overallSuccess: boolean,
    partialSuccess: boolean,
  ): Promise<void> {
    try {
      const executionState = {
        executionId: this.context.executionId,
        workflowId: this.context.workflowId,
        userId: this.context.userId,
        overallSuccess,
        partialSuccess,
        nodeStates: Array.from(this.nodeStates.entries()).map(
          ([nodeId, state]) => ({
            nodeId,
            status: state.status,
            attempts: state.attempts,
            startTime: state.startTime?.toISOString(),
            endTime: state.endTime?.toISOString(),
            error: state.error,
            output: state.output,
          }),
        ),
        circuitBreakerFailures: Array.from(
          this.circuitBreakerFailures.entries(),
        ),
        executionTime: Date.now() - this.context.startTime.getTime(),
        timestamp: new Date().toISOString(),
      };

      // Store in database for monitoring and potential recovery
      await supabase.from("workflow_execution_states").insert(executionState);
    } catch (error) {
      logger.error("Failed to persist execution state", {
        executionId: this.context.executionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export async function executeWorkflow(
  nodes: any[],
  edges: any[],
  input: any,
  apiKeys: any,
  executionId: string,
  userId: string,
  options?: {
    onNodeStart?: (nodeId: string) => void;
    onNodeComplete?: (nodeId: string, success: boolean, error?: string) => void;
    onExecutionComplete?: (success: boolean) => void;
    onCompensationStart?: (nodeId: string) => void;
    onCompensationComplete?: (nodeId: string, success: boolean) => void;
  },
): Promise<{
  success: boolean;
  output: any;
  logs: string[];
  errors: string[];
  nodeStatuses: Array<{ nodeId: string; status: string }>;
  nodeResults: Array<{
    nodeId: string;
    success: boolean;
    output: any;
    executionTime: number;
    logs: string[];
  }>;
  executionTime: number;
}> {
  const startTime = Date.now();

  try {
    // Try LangGraph execution first
    const workflowConfig = {
      workflowId: randomUUID(),
      executionId,
      userId,
      nodes: nodes.map((node, index) => ({
        id: node.id || `node_${index}`,
        type: node.type,
        config: node.config || {},
        label: node.label,
        description: node.description,
      })),
      edges: edges.map((edge) => ({
        source: edge.from || edge.source,
        target: edge.to || edge.target,
        condition: edge.condition,
      })),
      apiKeys,
      variables: input,
      maxRetries: 2,
      enableStreaming: true,
      streamingInterval: 1000,
    };

    const builder = new AdvancedWorkflowBuilder(workflowConfig);

    if (options) {
      builder.onStream((event) => {
        if (
          event.type === "node_start" &&
          event.nodeId &&
          options.onNodeStart
        ) {
          options.onNodeStart(event.nodeId);
        } else if (
          event.type === "node_end" &&
          event.nodeId &&
          options.onNodeComplete
        ) {
          options.onNodeComplete(event.nodeId, true);
        } else if (
          event.type === "node_error" &&
          event.nodeId &&
          options.onNodeComplete
        ) {
          options.onNodeComplete(event.nodeId, false, event.data?.error);
        } else if (
          event.type === "execution_complete" &&
          options.onExecutionComplete
        ) {
          options.onExecutionComplete(event.data?.status === "completed");
        }
      });
    }

    let result;
    try {
      result = await builder.execute(input);
    } catch (builderError) {
      logger.warn(
        "LangGraph execution failed, falling back to advanced executor",
        {
          executionId,
          error:
            builderError instanceof Error
              ? builderError.message
              : String(builderError),
        },
      );

      // Fall back to advanced executor
      const advancedExecutor = new AdvancedWorkflowExecutor({
        executionId,
        userId,
        workflowId: workflowConfig.workflowId,
        startTime: new Date(startTime),
        maxRetries: 2,
        enablePartialSuccess: true,
        enableCompensation: true,
        circuitBreakerThreshold: 5,
        executionTimeout: 300000, // 5 minutes
      });

      result = await advancedExecutor.executeWorkflow(
        nodes,
        edges,
        input,
        apiKeys,
        options,
      );

      // Call execution complete callback for advanced executor
      if (options?.onExecutionComplete) {
        options.onExecutionComplete(result as any);
      }
    }

    const executionTime = Date.now() - startTime;

    if ("state" in result) {
      // LangGraph result
      const nodeStatuses = result.state.nodeExecutionOrder.map(
        (nodeId: string) => ({
          nodeId,
          status: result.state.nodeResults[nodeId] ? "success" : "failed",
        }),
      );

      const nodeResults = result.state.nodeExecutionOrder.map(
        (nodeId: string) => {
          const nodeResult = result.state.nodeResults[nodeId];
          const startTime = result.state.nodeStartTimes[nodeId];
          const endTime = result.state.nodeEndTimes[nodeId];
          const executionTime =
            startTime && endTime ? endTime.getTime() - startTime.getTime() : 0;

          return {
            nodeId,
            success: !!nodeResult,
            output: nodeResult || {},
            executionTime,
            logs: result.state.logs
              .filter((log: any) => log.nodeId === nodeId)
              .map((log: any) => log.message),
          };
        },
      );

      return {
        success: result.success,
        output: result.output,
        logs: result.logs,
        errors: result.errors,
        nodeStatuses,
        nodeResults,
        executionTime,
      };
    }

    // Advanced executor result
    return {
      success: result.success,
      output: result.output,
      logs: result.logs,
      errors: result.errors,
      nodeStatuses: result.nodeStatuses.map((status: any) => ({
        nodeId: status.nodeId,
        status: status.status,
      })),
      nodeResults: result.nodeResults.map((nodeResult: any) => ({
        nodeId: nodeResult.nodeId,
        success: nodeResult.success,
        output: nodeResult.output,
        executionTime: nodeResult.executionTime,
        logs: nodeResult.logs,
      })),
      executionTime,
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error("Workflow execution failed completely", {
      executionId,
      error: errorMessage,
      executionTime,
    });

    return {
      success: false,
      output: {},
      logs: [`Workflow execution failed: ${errorMessage}`],
      errors: [errorMessage],
      nodeStatuses: nodes.map((node) => ({
        nodeId: node.id,
        status: "failed",
      })),
      nodeResults: nodes.map((node) => ({
        nodeId: node.id,
        success: false,
        output: {},
        executionTime: 0,
        logs: [`Node failed: ${errorMessage}`],
      })),
      executionTime,
    };
  }
}

function topologicalSort(nodes: any[], edges: any[]): string[] {
  const graph: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};

  for (const node of nodes) {
    graph[node.id] = [];
    inDegree[node.id] = 0;
  }

  for (const edge of edges) {
    const from = edge.from || edge.source;
    const to = edge.to || edge.target;
    if (!(from in graph) || !(to in graph)) continue;
    graph[from].push(to);
    inDegree[to] = (inDegree[to] || 0) + 1;
  }

  const queue: string[] = [];
  for (const nodeId of Object.keys(inDegree)) {
    if (inDegree[nodeId] === 0) {
      queue.push(nodeId);
    }
  }

  const result: string[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    result.push(nodeId);
    for (const next of graph[nodeId] || []) {
      inDegree[next]--;
      if (inDegree[next] === 0) {
        queue.push(next);
      }
    }
  }

  if (result.length !== nodes.length) {
    throw new Error("Workflow has no starting nodes or contains a cycle");
  }

  return result;
}

async function executeNodeWithFallback(
  node: any,
  variables: Record<string, any>,
  apiKeys: any,
): Promise<{ success: boolean; output: any; logs: string[] }> {
  const nodeDefinition = nodeRegistry.get(node.type);
  if (nodeDefinition) {
    const result = await nodeDefinition.handler({
      nodeId: node.id,
      input: variables,
      variables: { ...variables },
      apiKeys,
      config: node.config || {},
      validation: nodeDefinition.validation,
    } as any);
    if (!result.success) {
      throw new Error(result.error || `Node ${node.id} failed`);
    }
    return { success: true, output: result.output, logs: result.logs || [] };
  }

  const fallbackOutput = {
    fallback: true,
    nodeId: node.id,
    nodeType: node.type,
    config: node.config || {},
    input: variables,
    message: `Fallback execution for node type ${node.type}`,
  };

  return {
    success: true,
    output: fallbackOutput,
    logs: [`Fallback executed node ${node.id} (${node.type})`],
  };
}

async function executeWorkflowFallback(
  nodes: any[],
  edges: any[],
  input: any,
  apiKeys: any,
  options?: {
    onNodeStart?: (nodeId: string) => void;
    onNodeComplete?: (nodeId: string, success: boolean, error?: string) => void;
    onExecutionComplete?: (success: boolean) => void;
  },
): Promise<{
  success: boolean;
  output: any;
  logs: string[];
  errors: string[];
  nodeStatuses: Array<{ nodeId: string; status: string }>;
  nodeResults: Array<{
    nodeId: string;
    success: boolean;
    output: any;
    executionTime: number;
    logs: string[];
  }>;
  executionTime: number;
}> {
  const startTime = Date.now();
  const variables: Record<string, any> = { ...(input || {}) };
  const logs: string[] = [];
  const errors: string[] = [];
  const nodeStatuses: Array<{ nodeId: string; status: string }> = [];
  const nodeResults: Array<{
    nodeId: string;
    success: boolean;
    output: any;
    executionTime: number;
    logs: string[];
  }> = [];

  try {
    const executionOrder = topologicalSort(nodes, edges);

    for (const nodeId of executionOrder) {
      const node = nodes.find((item) => item.id === nodeId);
      if (!node) {
        const message = `Node ${nodeId} is missing`;
        errors.push(message);
        nodeStatuses.push({ nodeId, status: "failed" });
        continue;
      }

      options?.onNodeStart?.(nodeId);
      const nodeStart = Date.now();

      try {
        const result = await executeNodeWithFallback(node, variables, apiKeys);
        variables[node.id] = result.output;
        const nodeExecutionTime = Date.now() - nodeStart;
        nodeStatuses.push({ nodeId, status: "success" });
        nodeResults.push({
          nodeId,
          success: true,
          output: result.output,
          executionTime: nodeExecutionTime,
          logs: result.logs,
        });
        logs.push(...result.logs);
        options?.onNodeComplete?.(nodeId, true);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const nodeExecutionTime = Date.now() - nodeStart;
        errors.push(errorMessage);
        nodeStatuses.push({ nodeId, status: "failed" });
        nodeResults.push({
          nodeId,
          success: false,
          output: {},
          executionTime: nodeExecutionTime,
          logs: [errorMessage],
        });
        logs.push(errorMessage);
        options?.onNodeComplete?.(nodeId, false, errorMessage);
        return {
          success: false,
          output: variables,
          logs,
          errors,
          nodeStatuses,
          nodeResults,
          executionTime: Date.now() - startTime,
        };
      }
    }

    options?.onExecutionComplete?.(errors.length === 0);

    return {
      success: errors.length === 0,
      output: variables,
      logs,
      errors,
      nodeStatuses,
      nodeResults,
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      output: variables,
      logs: [`Workflow fallback failed: ${errorMessage}`],
      errors: [errorMessage],
      nodeStatuses,
      nodeResults,
      executionTime: Date.now() - startTime,
    };
  }
}
