"use strict";
/**
 * Advanced LangGraph Workflow Builder
 * Creates and executes LangGraph workflows with streaming, memory, and error handling
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdvancedWorkflowBuilder = void 0;
exports.createWorkflowBuilder = createWorkflowBuilder;
const langgraph_1 = require("@langchain/langgraph");
const langgraphState_1 = require("./langgraphState");
const langgraphToolRegistry_1 = require("./langgraphToolRegistry");
const logger_1 = require("./logger");
const llmFactory_1 = require("./llmFactory");
function resolvePreviousOutput(nodeId, nodeResults, edges) {
    const incomingEdges = edges.filter((e) => e.target === nodeId);
    if (incomingEdges.length === 0)
        return {};
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
function interpolateConfig(config, nodeResults) {
    if (!config)
        return {};
    const result = { ...config };
    for (const [key, value] of Object.entries(result)) {
        if (typeof value === "string" && value.includes("{{")) {
            result[key] = value.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
                const parts = path.trim().split(".");
                let resolved = nodeResults;
                for (const part of parts) {
                    resolved = resolved?.[part];
                    if (resolved === undefined)
                        return match;
                }
                return String(resolved ?? match);
            });
        }
    }
    return result;
}
/**
 * Advanced LangGraph Workflow Builder
 */
class AdvancedWorkflowBuilder {
    constructor(workflowConfig) {
        this.streamCallbacks = [];
        this.config = workflowConfig;
        this.graph = new langgraph_1.StateGraph(langgraphState_1.AgentState);
        this.toolRegistry = langgraphToolRegistry_1.globalToolRegistry;
        this.toolExecutor = new langgraphToolRegistry_1.AdvancedToolExecutor(this.toolRegistry);
        this.llmFactory = new llmFactory_1.LLMFactory();
        this.initialize();
    }
    /**
     * Initialize the workflow
     */
    initialize() {
        logger_1.logger.debug("Initializing advanced workflow builder", {
            workflowId: this.config.workflowId,
            nodeCount: this.config.nodes.length,
        });
        // Register all nodes as tools
        (0, langgraphToolRegistry_1.registerWorkflowNodes)(this.toolRegistry, this.config.nodes, this.config.apiKeys);
    }
    /**
     * Add a stream callback
     */
    onStream(callback) {
        this.streamCallbacks.push(callback);
        this.toolExecutor.setStreamCallback((event) => {
            this.emitStreamEvent(event);
        });
    }
    /**
     * Emit a stream event
     */
    emitStreamEvent(event) {
        const fullEvent = {
            ...event,
            timestamp: event.timestamp || new Date(),
            executionId: this.config.executionId,
        };
        for (const callback of this.streamCallbacks) {
            try {
                callback(fullEvent);
            }
            catch (error) {
                logger_1.logger.error("Stream callback error", {
                    error: error.message,
                });
            }
        }
    }
    /**
     * Build the graph topology
     */
    buildGraphTopology() {
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
    addNodeProcessor(nodeConfig) {
        const nodeId = nodeConfig.id;
        this.graph.addNode(nodeId, async (state) => {
            logger_1.logger.info("Node processor invoked by LangGraph", {
                executionId: this.config.executionId,
                nodeId,
            });
            return await this.executeNode(state, nodeConfig);
        });
        logger_1.logger.debug(`Added node to graph: ${nodeId}`);
    }
    /**
     * Execute a node
     */
    async executeNode(state, nodeConfig) {
        const nodeId = nodeConfig.id;
        const startTime = new Date();
        logger_1.logger.info("Executing node", {
            executionId: this.config.executionId,
            nodeId,
            nodeType: nodeConfig.type,
        });
        let updatedState = langgraphState_1.StateUtils.addStreamEvent(state, {
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
            const previousOutput = resolvePreviousOutput(nodeId, currentNodeResults, edges);
            const resolvedConfig = interpolateConfig(nodeConfig.config || {}, currentNodeResults);
            const context = {
                nodeId,
                nodeType: nodeConfig.type,
                config: resolvedConfig,
                input: previousOutput,
                previousOutputs: currentNodeResults,
                apiKeys: this.config.apiKeys,
            };
            // Debug logs
            console.log(`[data-passing] Node ${nodeId} (${nodeConfig.type}) input:`, JSON.stringify(previousOutput).slice(0, 200));
            console.log(`[data-passing] Node ${nodeId} resolved config:`, JSON.stringify(resolvedConfig).slice(0, 200));
            // Execute the node tool
            const result = await this.toolExecutor.executeNodeTool(nodeId, context, state);
            const endTime = new Date();
            console.log(`[data-passing] Node ${nodeId} output:`, JSON.stringify(result?.data?.output || result?.data).slice(0, 200));
            // Update state with result
            updatedState = langgraphState_1.StateUtils.updateNodeResult(updatedState, nodeId, result.data);
            updatedState = {
                ...updatedState,
                nodeEndTimes: {
                    ...updatedState.nodeEndTimes,
                    [nodeId]: endTime,
                },
            };
            updatedState = langgraphState_1.StateUtils.addStreamEvent(updatedState, {
                type: "node_end",
                nodeId,
                data: result.data,
                executionId: this.config.executionId,
            });
            updatedState = langgraphState_1.StateUtils.addLog(updatedState, "info", `Node ${nodeId} executed successfully`, { executionTime: result.executionTime }, nodeId);
            // Mark node as completed
            updatedState = {
                ...updatedState,
                nodeStatuses: {
                    ...updatedState.nodeStatuses,
                    [nodeId]: "completed",
                },
            };
            return updatedState;
        }
        catch (error) {
            const errorMessage = error.message;
            const endTime = new Date();
            logger_1.logger.error(`Node execution failed: ${nodeId}`, { error: errorMessage });
            // Check if we can retry
            if (langgraphState_1.StateUtils.canRetry(updatedState, nodeId)) {
                updatedState = langgraphState_1.StateUtils.addError(updatedState, errorMessage, nodeId, error.stack);
                updatedState = langgraphState_1.StateUtils.addLog(updatedState, "warn", `Node ${nodeId} failed, retrying...`, { error: errorMessage }, nodeId);
                // Retry the node
                return await this.executeNode(updatedState, nodeConfig);
            }
            // Max retries exceeded
            updatedState = langgraphState_1.StateUtils.addError(updatedState, `Node execution failed after ${updatedState.maxRetries} retries: ${errorMessage}`, nodeId, error.stack);
            updatedState = {
                ...updatedState,
                nodeEndTimes: {
                    ...updatedState.nodeEndTimes,
                    [nodeId]: endTime,
                },
                status: "failed",
            };
            updatedState = langgraphState_1.StateUtils.addStreamEvent(updatedState, {
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
    prepareNodeInput(state, nodeConfig) {
        const input = {};
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
    addEdgeRouter(edge) {
        if (edge.condition) {
            this.graph.addConditionalEdges(edge.source, async (state) => {
                return edge.condition(state) ? edge.target : langgraph_1.END;
            });
        }
        else {
            this.graph.addEdge(edge.source, edge.target);
        }
        logger_1.logger.debug(`Added edge: ${edge.source} -> ${edge.target}`);
    }
    /**
     * Add conditional routing
     */
    addConditionalRouting() {
        // Route from start to all starting nodes
        const startNodes = this.findStartNodes();
        for (const startNode of startNodes) {
            this.graph.addEdge(langgraph_1.START, startNode);
        }
        // Find end nodes and route to END
        const endNodes = this.findEndNodes();
        for (const endNode of endNodes) {
            this.graph.addEdge(endNode, langgraph_1.END);
        }
    }
    /**
     * Find nodes with no incoming edges (start nodes)
     */
    findStartNodes() {
        const nodes = new Set(this.config.nodes.map((n) => n.id));
        const hasIncoming = new Set();
        for (const edge of this.config.edges) {
            hasIncoming.add(edge.target);
        }
        return Array.from(nodes).filter((id) => !hasIncoming.has(id));
    }
    /**
     * Find nodes with no outgoing edges (end nodes)
     */
    findEndNodes() {
        const nodes = new Set(this.config.nodes.map((n) => n.id));
        const hasOutgoing = new Set();
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
    async execute(input) {
        try {
            // Build initial state with enhanced error tracking
            const initialState = {
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
            logger_1.logger.info("LangGraph workflow compiled successfully", {
                executionId: this.config.executionId,
                nodeCount: this.config.nodes.length,
            });
            // Execute graph with enhanced error handling
            let finalState;
            logger_1.logger.info("Invoking LangGraph compiler", {
                executionId: this.config.executionId,
            });
            try {
                const invokePromise = compiler.invoke(initialState);
                // Add 30-second timeout for workflow execution
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Workflow execution timeout after 30s")), 30000));
                finalState = await Promise.race([invokePromise, timeoutPromise]);
            }
            catch (executionError) {
                // Log the execution error but don't fail completely
                logger_1.logger.error("LangGraph execution error", {
                    executionId: this.config.executionId,
                    error: executionError instanceof Error
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
                            error: executionError instanceof Error
                                ? executionError.message
                                : String(executionError),
                            timestamp: new Date(),
                            stack: executionError instanceof Error
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
            const completedNodes = Object.values(finalState.nodeStatuses).filter((status) => status === "completed").length;
            // Set final status
            if (hasErrors && completedNodes === 0) {
                finalState.status = "failed";
            }
            else {
                finalState.status = "completed";
            }
            const finalOutput = {
                ...finalState.output,
                ...finalState.nodeResults,
            };
            const hasSuccessfulNodes = finalState.nodeResults &&
                Object.keys(finalState.nodeResults).length > 0;
            const hasOutput = Object.values(finalState.nodeResults || {}).some((result) => result !== null && result !== undefined && result !== "");
            const nodeStatusCount = completedNodes;
            logger_1.logger.info("LangGraph compiler invocation completed", {
                executionId: this.config.executionId,
                status: finalState.status,
                errorCount: finalState.errors?.length || 0,
                nodeStatusCount,
                hasOutput,
            });
            logger_1.logger.debug("LangGraph final state", {
                executionId: this.config.executionId,
                nodeStatuses: finalState.nodeStatuses,
                nodeResults: finalState.nodeResults,
                outputKeys: Object.keys(finalOutput),
                status: finalState.status,
                streamEvents: finalState.streamEvents.length,
            });
            const result = {
                success: !hasErrors || completedNodes > 0, // Allow partial success
                output: finalOutput,
                state: finalState,
                logs: finalState.logs.map((l) => l.message),
                errors: finalState.errors.map((e) => e.error),
                hasOutput,
                nodeStatusCount,
                nodeStatuses: finalState.nodeStatuses,
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
        }
        catch (error) {
            const errorMessage = error.message;
            logger_1.logger.error("Workflow execution failed", { error: errorMessage });
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
    async *streamExecute(input) {
        try {
            // Build initial state
            const initialState = {
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
            const pendingEvents = [];
            const originalCallbacks = [...this.streamCallbacks];
            // Clear callbacks to prevent duplicate emissions
            this.streamCallbacks = [];
            // Register a single local callback to collect events
            this.streamCallbacks.push((event) => {
                pendingEvents.push(event);
            });
            try {
                // Execute the workflow
                await compiler.invoke(initialState);
            }
            finally {
                // Restore original callbacks (though they may not be used after generator completes)
                this.streamCallbacks = originalCallbacks;
            }
            // Yield all collected events
            for (const event of pendingEvents) {
                yield event;
            }
        }
        catch (error) {
            yield {
                type: "execution_error",
                data: { error: error.message },
                timestamp: new Date(),
                executionId: this.config.executionId,
            };
        }
    }
}
exports.AdvancedWorkflowBuilder = AdvancedWorkflowBuilder;
/**
 * Factory function to create workflow builder
 */
function createWorkflowBuilder(config) {
    return new AdvancedWorkflowBuilder(config);
}
