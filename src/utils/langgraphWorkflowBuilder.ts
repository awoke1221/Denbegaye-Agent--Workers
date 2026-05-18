/**
 * Advanced LangGraph Workflow Builder
 * Creates and executes LangGraph workflows with streaming, memory, and error handling
 */

import { StateGraph, START, END } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import {
  AgentState,
  AgentStateType,
  StreamEvent,
  StateUtils,
  ExtendedAgentState,
} from "./langgraphState";
import {
  AdvancedToolRegistry,
  AdvancedToolExecutor,
  registerWorkflowNodes,
  globalToolRegistry,
} from "./langgraphToolRegistry";
import { logger } from "./logger";
import { LLMFactory } from "./llmFactory";

export interface WorkflowNodeConfig {
  id: string;
  type: string;
  config: Record<string, any>;
  label?: string;
  description?: string;
}

export interface WorkflowEdgeConfig {
  source: string;
  target: string;
  condition?: (state: AgentStateType) => boolean;
}

export interface WorkflowConfig {
  workflowId: string;
  executionId: string;
  userId: string;
  nodes: WorkflowNodeConfig[];
  edges: WorkflowEdgeConfig[];
  apiKeys: Record<string, any>;
  variables?: Record<string, any>;
  maxRetries?: number;
  enableStreaming?: boolean;
  streamingInterval?: number;
}

function resolvePreviousOutput(
  nodeId: string,
  nodeResults: Record<string, any>,
  edges: WorkflowEdgeConfig[],
): any {
  const incomingEdges = edges.filter((e) => e.target === nodeId);

  if (incomingEdges.length === 0) return {};

  if (incomingEdges.length === 1) {
    const parentId = incomingEdges[0].source;
    const parentResult = nodeResults[parentId];
    return parentResult?.output || parentResult || {};
  }

  return incomingEdges.reduce((acc, edge) => {
    const parentId = edge.source;
    const parentResult = nodeResults[parentId];
    const parentOutput = parentResult?.output || parentResult || {};
    return { ...acc, ...parentOutput };
  }, {});
}

function getNestedValue(obj: any, path: string): any {
  if (!obj || typeof obj !== "object") return undefined;
  const parts = path.split(".");
  let current: any = obj;
  for (const part of parts) {
    current = current?.[part];
    if (current === undefined) return undefined;
  }
  return current;
}

function interpolateConfig(
  config: Record<string, any>,
  nodeResults: Record<string, any>,
  variables: Record<string, any>,
  state?: AgentStateType,
): Record<string, any> {
  if (!config) return {};

  const interpolateValue = (value: any): any => {
    if (typeof value === "string" && value.includes("{{")) {
      return value.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
        const trimmed = path.trim();

        if (trimmed === "variables") {
          const resolved = state?.variables || variables || {};
          return resolved !== undefined
            ? String(JSON.stringify(resolved))
            : match;
        }

        if (trimmed.startsWith("variables.")) {
          const varKey = trimmed.replace("variables.", "");
          const resolved = getNestedValue(
            state?.variables || variables || {},
            varKey,
          );
          return resolved !== undefined ? String(resolved) : match;
        }

        const parts = trimmed.split(".");
        let resolved: any = nodeResults;
        for (const part of parts) {
          resolved = resolved?.[part];
          if (resolved === undefined) return match;
        }
        return resolved !== undefined ? String(resolved) : match;
      });
    }

    if (Array.isArray(value)) {
      return value.map(interpolateValue);
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => [
          key,
          interpolateValue(nestedValue),
        ]),
      );
    }

    return value;
  };

  return interpolateValue(config) as Record<string, any>;
}

/**
 * Advanced LangGraph Workflow Builder
 */
export class AdvancedWorkflowBuilder {
  private config: WorkflowConfig;
  private graph: StateGraph<any>;
  private toolRegistry: AdvancedToolRegistry;
  private toolExecutor: AdvancedToolExecutor;
  private streamCallbacks: Array<(event: StreamEvent) => void> = [];
  private llmFactory: LLMFactory;

  constructor(workflowConfig: WorkflowConfig) {
    this.config = workflowConfig;
    this.graph = new StateGraph(AgentState);
    this.toolRegistry = globalToolRegistry;
    this.toolExecutor = new AdvancedToolExecutor(this.toolRegistry);
    this.llmFactory = new LLMFactory();

    this.initialize();
  }

  /**
   * Initialize the workflow
   */
  private initialize(): void {
    logger.debug("Initializing advanced workflow builder", {
      workflowId: this.config.workflowId,
      nodeCount: this.config.nodes.length,
    });

    // Register all nodes as tools
    registerWorkflowNodes(
      this.toolRegistry,
      this.config.nodes,
      this.config.apiKeys,
    );
  }

  /**
   * Add a stream callback
   */
  onStream(callback: (event: StreamEvent) => void): void {
    this.streamCallbacks.push(callback);
    this.toolExecutor.setStreamCallback((event) => {
      this.emitStreamEvent(event);
    });
  }

  /**
   * Emit a stream event
   */
  private emitStreamEvent(event: Omit<StreamEvent, "executionId">): void {
    const fullEvent: StreamEvent = {
      ...event,
      timestamp: event.timestamp || new Date(),
      executionId: this.config.executionId,
    };

    for (const callback of this.streamCallbacks) {
      try {
        callback(fullEvent);
      } catch (error) {
        logger.error("Stream callback error", {
          error: (error as Error).message,
        });
      }
    }
  }

  /**
   * Build the graph topology
   */
  private buildGraphTopology(): void {
    const { nodes, edges } = this.config;

    // Add node processors
    for (const node of nodes) {
      this.addNodeProcessor(node);
    }

    // Add edges with routing logic
    for (const edge of edges) {
      this.addEdgeRouter(edge);
    }

    // Add conditional routing
    this.addConditionalRouting();
  }

  /**
   * Add a node processor to the graph
   */
  private addNodeProcessor(nodeConfig: WorkflowNodeConfig): void {
    const nodeId = nodeConfig.id;

    this.graph.addNode(nodeId, async (state: AgentStateType) => {
      logger.info("Node processor invoked by LangGraph", {
        executionId: this.config.executionId,
        nodeId,
      });
      return await this.executeNode(state, nodeConfig);
    });

    logger.debug(`Added node to graph: ${nodeId}`);
  }

  /**
   * Execute a node
   */
  private async executeNode(
    state: AgentStateType,
    nodeConfig: WorkflowNodeConfig,
  ): Promise<Partial<AgentStateType>> {
    const nodeId = nodeConfig.id;
    const startTime = new Date();
    logger.info("Executing node", {
      executionId: this.config.executionId,
      nodeId,
      nodeType: nodeConfig.type,
    });

    let updatedState = StateUtils.addStreamEvent(state, {
      type: "node_start",
      nodeId,
      data: { config: nodeConfig.config },
      executionId: this.config.executionId,
    });

    updatedState = {
      ...updatedState,
      currentNode: nodeId,
      nodeStartTimes: {
        ...updatedState.nodeStartTimes,
        [nodeId]: startTime,
      },
      nodeStatuses: {
        ...updatedState.nodeStatuses,
        [nodeId]: "running",
      },
    };

    try {
      const currentNodeResults = state.nodeResults || {};
      const edges = this.config.edges || [];

      const previousOutput = resolvePreviousOutput(
        nodeId,
        currentNodeResults,
        edges,
      );

      const resolvedConfig = interpolateConfig(
        nodeConfig.config || {},
        currentNodeResults,
        state.variables,
        state,
      );

      const context = {
        nodeId,
        nodeType: nodeConfig.type,
        config: resolvedConfig,
        input: previousOutput,
        previousOutputs: currentNodeResults,
        variables: state.variables,
        apiKeys: this.config.apiKeys,
        edges: this.config.edges || [],
        nodes: this.config.nodes || [],
        workflowId: this.config.workflowId,
        executionId: this.config.executionId,
      };

      // Debug logs
      console.log(
        `[data-passing] Node ${nodeId} (${nodeConfig.type}) input:`,
        JSON.stringify(previousOutput).slice(0, 200),
      );
      console.log(
        `[data-passing] Node ${nodeId} resolved config:`,
        JSON.stringify(resolvedConfig).slice(0, 200),
      );

      // Execute the node tool
      const result = await this.toolExecutor.executeNodeTool(
        nodeId,
        context,
        state,
      );

      const endTime = new Date();

      console.log(
        `[data-passing] Node ${nodeId} output:`,
        JSON.stringify(result?.data?.output || result?.data).slice(0, 200),
      );

      // Update state with result
      updatedState = StateUtils.updateNodeResult(
        updatedState,
        nodeId,
        result.data,
      );

      // After core-set runs, merge its output into state.variables
      if (nodeConfig.type === "core-set" && result.data?.output?.data) {
        const newVars = result.data.output.data as Record<string, any>;
        // Update state variables so downstream nodes can use them
        updatedState = StateUtils.updateVariables(updatedState, newVars);
      }

      const nodeVariables =
        result.data?.output?.variables || result.data?.variables;
      if (
        nodeVariables &&
        typeof nodeVariables === "object" &&
        !Array.isArray(nodeVariables)
      ) {
        updatedState = StateUtils.updateVariables(updatedState, nodeVariables);
      }

      updatedState = {
        ...updatedState,
        nodeEndTimes: {
          ...updatedState.nodeEndTimes,
          [nodeId]: endTime,
        },
      };

      if (result.success === false) {
        const errorMessage =
          result.error ||
          result.data?.error ||
          result.data?.message ||
          "Node execution failed";

        updatedState = StateUtils.addStreamEvent(updatedState, {
          type: "node_error",
          nodeId,
          data: { error: errorMessage },
          executionId: this.config.executionId,
        });

        updatedState = StateUtils.addError(
          updatedState,
          errorMessage,
          nodeId,
          undefined,
        );

        updatedState = StateUtils.addLog(
          updatedState,
          "warn",
          `Node ${nodeId} failed: ${errorMessage}`,
          { executionTime: result.executionTime },
          nodeId,
        );

        updatedState = {
          ...updatedState,
          nodeStatuses: {
            ...updatedState.nodeStatuses,
            [nodeId]: "failed",
          },
          status: "failed",
        };

        return updatedState;
      }

      updatedState = StateUtils.addStreamEvent(updatedState, {
        type: "node_end",
        nodeId,
        data: result.data,
        executionId: this.config.executionId,
      });

      updatedState = StateUtils.addLog(
        updatedState,
        "info",
        `Node ${nodeId} executed successfully`,
        { executionTime: result.executionTime },
        nodeId,
      );

      // Mark node as completed
      updatedState = {
        ...updatedState,
        nodeStatuses: {
          ...updatedState.nodeStatuses,
          [nodeId]: "completed",
        },
      };

      return updatedState;
    } catch (error) {
      const errorMessage = (error as Error).message;
      const endTime = new Date();

      logger.error(`Node execution failed: ${nodeId}`, { error: errorMessage });

      // Check if we can retry
      if (StateUtils.canRetry(updatedState, nodeId)) {
        updatedState = StateUtils.addError(
          updatedState,
          errorMessage,
          nodeId,
          (error as Error).stack,
        );

        updatedState = StateUtils.addLog(
          updatedState,
          "warn",
          `Node ${nodeId} failed, retrying...`,
          { error: errorMessage },
          nodeId,
        );

        // Retry the node
        return await this.executeNode(updatedState, nodeConfig);
      }

      // Max retries exceeded
      updatedState = StateUtils.addError(
        updatedState,
        `Node execution failed after ${updatedState.maxRetries} retries: ${errorMessage}`,
        nodeId,
        (error as Error).stack,
      );

      updatedState = {
        ...updatedState,
        nodeEndTimes: {
          ...updatedState.nodeEndTimes,
          [nodeId]: endTime,
        },
        status: "failed",
      };

      updatedState = StateUtils.addStreamEvent(updatedState, {
        type: "node_error",
        nodeId,
        data: { error: errorMessage },
        executionId: this.config.executionId,
      });

      // Mark node as failed
      updatedState = {
        ...updatedState,
        nodeStatuses: {
          ...updatedState.nodeStatuses,
          [nodeId]: "failed",
        },
      };

      // Return error state without throwing - allow graph to continue
      return updatedState;
    }
  }

  /**
   * Prepare node input from state variables
   */
  private prepareNodeInput(
    state: AgentStateType,
    nodeConfig: WorkflowNodeConfig,
  ): Record<string, any> {
    const input: Record<string, any> = {};

    // Add workflow variables
    Object.assign(input, state.variables);

    // Add node-specific configuration
    Object.assign(input, nodeConfig.config);

    // Add previous node results
    Object.assign(input, state.nodeResults);

    return input;
  }

  /**
   * Add edge router
   */
  private addEdgeRouter(edge: WorkflowEdgeConfig): void {
    if (edge.condition) {
      this.graph.addConditionalEdges(edge.source as any, async (state: any) => {
        return edge.condition!(state) ? edge.target : END;
      });
    } else {
      this.graph.addEdge(edge.source as any, edge.target as any);
    }

    logger.debug(`Added edge: ${edge.source} -> ${edge.target}`);
  }

  /**
   * Add conditional routing
   */
  private addConditionalRouting(): void {
    // Route from start to all starting nodes
    const startNodes = this.findStartNodes();

    for (const startNode of startNodes) {
      this.graph.addEdge(START as any, startNode as any);
    }

    // Find end nodes and route to END
    const endNodes = this.findEndNodes();
    for (const endNode of endNodes) {
      this.graph.addEdge(endNode as any, END as any);
    }
  }

  /**
   * Find nodes with no incoming edges (start nodes)
   */
  private findStartNodes(): string[] {
    const nodes = new Set(this.config.nodes.map((n) => n.id));
    const hasIncoming = new Set<string>();

    for (const edge of this.config.edges) {
      hasIncoming.add(edge.target);
    }

    return Array.from(nodes).filter((id) => !hasIncoming.has(id));
  }

  /**
   * Find nodes with no outgoing edges (end nodes)
   */
  private findEndNodes(): string[] {
    const nodes = new Set(this.config.nodes.map((n) => n.id));
    const hasOutgoing = new Set<string>();

    for (const edge of this.config.edges) {
      hasOutgoing.add(edge.source);
    }

    return Array.from(nodes).filter((id) => !hasOutgoing.has(id));
  }

  /**
   * Compile the workflow
   */
  async compile() {
    this.buildGraphTopology();
    return this.graph.compile();
  }

  /**
   * Execute the workflow
   */
  async execute(input: Record<string, any>): Promise<{
    success: boolean;
    output: Record<string, any>;
    state: AgentStateType;
    logs: string[];
    errors: string[];
  }> {
    try {
      // Build initial state with enhanced error tracking
      const initialState: AgentStateType = {
        messages: [],
        workflowId: this.config.workflowId,
        executionId: this.config.executionId,
        userId: this.config.userId,
        variables: this.config.variables || {},
        apiKeys: this.config.apiKeys,
        shortTermMemory: {},
        longTermMemory: [],
        nodeResults: {},
        nodeStatuses: {},
        nodeExecutionOrder: [],
        nodeDependencies: {},
        streamEvents: [],
        status: "running",
        currentNode: null,
        logs: [],
        errors: [],
        startTime: new Date(),
        endTime: null,
        nodeStartTimes: {},
        nodeEndTimes: {},
        nodeRetryCount: {},
        maxRetries: this.config.maxRetries || 2,
        toolCalls: [],
        toolResults: {},
        metadata: {},
        output: input,
      };

      const compiler = await this.compile();
      logger.info("LangGraph workflow compiled successfully", {
        executionId: this.config.executionId,
        nodeCount: this.config.nodes.length,
      });

      // Execute graph with enhanced error handling
      let finalState: AgentStateType;
      logger.info("Invoking LangGraph compiler", {
        executionId: this.config.executionId,
      });
      try {
        const invokePromise = compiler.invoke(initialState);

        // Add 30-second timeout for workflow execution
        const timeoutPromise = new Promise<AgentStateType>((_, reject) =>
          setTimeout(
            () => reject(new Error("Workflow execution timeout after 30s")),
            30000,
          ),
        );

        finalState = await Promise.race([invokePromise, timeoutPromise]);
      } catch (executionError) {
        // Log the execution error but don't fail completely
        logger.error("LangGraph execution error", {
          executionId: this.config.executionId,
          error:
            executionError instanceof Error
              ? executionError.message
              : String(executionError),
        });

        // Create a partial state with the error
        finalState = {
          ...initialState,
          status: "failed",
          errors: [
            {
              nodeId: undefined,
              error:
                executionError instanceof Error
                  ? executionError.message
                  : String(executionError),
              timestamp: new Date(),
              stack:
                executionError instanceof Error
                  ? executionError.stack
                  : undefined,
              retryCount: 0,
            },
          ],
          endTime: new Date(),
        };
      }

      const endTime = new Date();
      finalState.endTime = endTime;

      // Update final status based on execution results
      const hasErrors = finalState.errors && finalState.errors.length > 0;
      const completedNodes = Object.values(finalState.nodeStatuses).filter(
        (status) => status === "completed",
      ).length;

      // Set final status
      if (hasErrors) {
        finalState.status = "failed";
      } else {
        finalState.status = "completed";
      }

      const finalOutput = {
        ...finalState.output,
        ...finalState.nodeResults,
      };

      const hasSuccessfulNodes =
        finalState.nodeResults &&
        Object.keys(finalState.nodeResults).length > 0;

      const hasOutput = Object.values(finalState.nodeResults || {}).some(
        (result) => result !== null && result !== undefined && result !== "",
      );

      const nodeStatusCount = completedNodes;

      logger.info("LangGraph compiler invocation completed", {
        executionId: this.config.executionId,
        status: finalState.status,
        errorCount: finalState.errors?.length || 0,
        nodeStatusCount,
        hasOutput,
      });

      logger.debug("LangGraph final state", {
        executionId: this.config.executionId,
        nodeStatuses: finalState.nodeStatuses,
        nodeResults: finalState.nodeResults,
        outputKeys: Object.keys(finalOutput),
        status: finalState.status,
        streamEvents: finalState.streamEvents.length,
      });

      const result = {
        success: !hasErrors,
        output: finalOutput,
        state: finalState,
        logs: finalState.logs.map((l: any) => l.message),
        errors: finalState.errors.map((e: any) => e.error),
        hasOutput,
        nodeStatusCount,
        nodeStatuses: finalState.nodeStatuses,
        partialSuccess: hasErrors && hasSuccessfulNodes,
      };

      if (this.config.enableStreaming) {
        this.emitStreamEvent({
          type: "execution_complete",
          timestamp: new Date(),
          data: {
            ...result,
            hasOutput,
            nodeStatusCount,
            success: result.success,
            executionTime: finalState.endTime
              ? finalState.endTime.getTime() - finalState.startTime.getTime()
              : 0,
            partialSuccess: hasErrors && hasSuccessfulNodes,
          },
        });
      }

      return result;
    } catch (error) {
      const errorMessage = (error as Error).message;
      logger.error("Workflow execution failed", { error: errorMessage });

      this.emitStreamEvent({
        type: "execution_complete",
        timestamp: new Date(),
        data: {
          success: false,
          error: errorMessage,
          hasOutput: false,
        },
      });

      throw error;
    }
  }

  /**
   * Stream execution with real-time updates
   * This method collects all stream events and yields them directly
   * to avoid duplicate listener registration
   */
  async *streamExecute(
    input: Record<string, any>,
  ): AsyncGenerator<StreamEvent> {
    try {
      // Build initial state
      const initialState: AgentStateType = {
        messages: [],
        workflowId: this.config.workflowId,
        executionId: this.config.executionId,
        userId: this.config.userId,
        variables: this.config.variables || {},
        apiKeys: this.config.apiKeys,
        shortTermMemory: {},
        longTermMemory: [],
        nodeResults: {},
        nodeStatuses: {},
        nodeExecutionOrder: [],
        nodeDependencies: {},
        streamEvents: [],
        status: "running",
        currentNode: null,
        logs: [],
        errors: [],
        startTime: new Date(),
        endTime: null,
        nodeStartTimes: {},
        nodeEndTimes: {},
        nodeRetryCount: {},
        maxRetries: this.config.maxRetries || 2,
        toolCalls: [],
        toolResults: {},
        metadata: {},
        output: input,
      };

      const compiler = await this.compile();
      const pendingEvents: StreamEvent[] = [];
      const originalCallbacks = [...this.streamCallbacks];

      // Clear callbacks to prevent duplicate emissions
      this.streamCallbacks = [];

      // Register a single local callback to collect events
      this.streamCallbacks.push((event: StreamEvent) => {
        pendingEvents.push(event);
      });

      try {
        // Execute the workflow
        await compiler.invoke(initialState);
      } finally {
        // Restore original callbacks (though they may not be used after generator completes)
        this.streamCallbacks = originalCallbacks;
      }

      // Yield all collected events
      for (const event of pendingEvents) {
        yield event;
      }
    } catch (error) {
      yield {
        type: "execution_error",
        data: { error: (error as Error).message },
        timestamp: new Date(),
        executionId: this.config.executionId,
      };
    }
  }
}

/**
 * Factory function to create workflow builder
 */
export function createWorkflowBuilder(
  config: WorkflowConfig,
): AdvancedWorkflowBuilder {
  return new AdvancedWorkflowBuilder(config);
}
