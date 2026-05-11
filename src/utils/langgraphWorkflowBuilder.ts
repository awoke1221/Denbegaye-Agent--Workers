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
    };

    try {
      // Emit node start stream event immediately before execution begins
      this.emitStreamEvent({
        type: "node_start",
        nodeId,
        data: { config: nodeConfig.config },
        timestamp: startTime,
      });

      // Prepare node input
      const nodeInput = this.prepareNodeInput(state, nodeConfig);

      // Execute the node tool
      const result = await this.toolExecutor.executeNodeTool(
        nodeId,
        nodeInput,
        state,
      );

      const endTime = new Date();

      // Update state with result
      updatedState = StateUtils.updateNodeResult(
        updatedState,
        nodeId,
        result.data,
      );

      updatedState = {
        ...updatedState,
        nodeEndTimes: {
          ...updatedState.nodeEndTimes,
          [nodeId]: endTime,
        },
      };

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

      // Emit stream event
      this.emitStreamEvent({
        type: "node_end",
        nodeId,
        data: result.data,
        timestamp: endTime,
      });

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

      // Emit error event
      this.emitStreamEvent({
        type: "node_error",
        nodeId,
        data: { error: errorMessage },
        timestamp: endTime,
      });

      throw error;
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

      // Stream events if enabled
      if (this.config.enableStreaming) {
        this.emitStreamEvent({
          type: "execution_complete",
          timestamp: new Date(),
          data: {
            status: "started",
            workflowId: this.config.workflowId,
          },
        });
      }

      // Execute graph with enhanced error handling
      let finalState: AgentStateType;
      try {
        finalState = await compiler.invoke(initialState);
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

      // Determine success based on error analysis
      const hasErrors = finalState.errors && finalState.errors.length > 0;
      const hasSuccessfulNodes =
        finalState.nodeResults &&
        Object.keys(finalState.nodeResults).length > 0;

      const result = {
        success: !hasErrors, // Allow partial success
        output: finalState.output,
        state: finalState,
        logs: finalState.logs.map((l: any) => l.message),
        errors: finalState.errors.map((e: any) => e.error),
      };

      if (this.config.enableStreaming) {
        this.emitStreamEvent({
          type: "execution_complete",
          timestamp: new Date(),
          data: {
            ...result,
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
        data: { success: false, error: errorMessage },
      });

      throw error;
    }
  }

  /**
   * Stream execution with real-time updates
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

      // Collect events
      const eventPromise = new Promise<void>((resolve) => {
        this.onStream((event) => {
          pendingEvents.push(event);
          resolve();
        });
      });

      // Execute
      const executePromise = compiler.invoke(initialState);

      // Yield events as they come in
      while (true) {
        try {
          await Promise.race([eventPromise, executePromise]);
        } catch {
          break;
        }

        while (pendingEvents.length > 0) {
          yield pendingEvents.shift()!;
        }
      }

      // Yield final events
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
