"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdvancedWorkflowExecutor = void 0;
exports.executeWorkflow = executeWorkflow;
const langgraphWorkflowBuilder_1 = require("./langgraphWorkflowBuilder");
const nodes_1 = require("../nodes");
const crypto_1 = require("crypto");
const logger_1 = require("./logger");
const supabaseClient_1 = require("./supabaseClient");
class AdvancedWorkflowExecutor {
    constructor(context) {
        this.nodeStates = new Map();
        this.circuitBreakerFailures = new Map();
        this.executionAborted = false;
        this.context = context;
    }
    /**
     * Execute workflow with advanced error handling and recovery
     */
    async executeWorkflow(nodes, edges, input, apiKeys, options) {
        const startTime = Date.now();
        this.executionAborted = false;
        this.context.edges = edges;
        try {
            // Initialize execution state
            await this.initializeExecutionState(nodes, edges);
            // Execute nodes in topological order with advanced handling
            const executionOrder = this.calculateExecutionOrder(nodes, edges);
            const results = await this.executeNodesInOrder(executionOrder, nodes, input, apiKeys, options);
            // Handle compensation if workflow failed but has partial success
            const finalResult = await this.handleWorkflowCompletion(results, options);
            const executionTime = Date.now() - startTime;
            logger_1.logger.info("Workflow execution completed", {
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
        }
        catch (error) {
            const executionTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger_1.logger.error("Workflow execution failed catastrophically", {
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
                    executionTime: state.startTime && state.endTime
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
    async initializeExecutionState(nodes, edges) {
        // Build dependency graph
        const dependencyGraph = {};
        const reverseDependencyGraph = {};
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
        logger_1.logger.debug("Execution state initialized", {
            executionId: this.context.executionId,
            nodeCount: nodes.length,
        });
    }
    /**
     * Calculate optimal execution order considering dependencies and parallelism
     */
    calculateExecutionOrder(nodes, edges) {
        const graph = {};
        const inDegree = {};
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
        const queue = [];
        const result = [];
        const visited = new Set();
        const recursionStack = new Set();
        // Find nodes with no dependencies
        for (const nodeId of Object.keys(inDegree)) {
            if (inDegree[nodeId] === 0) {
                queue.push(nodeId);
            }
        }
        while (queue.length > 0) {
            const nodeId = queue.shift();
            result.push(nodeId);
            visited.add(nodeId);
            for (const dependent of graph[nodeId] || []) {
                if (recursionStack.has(dependent)) {
                    throw new Error(`Workflow contains a cycle involving node ${dependent}`);
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
            throw new Error(`Workflow has cycles or unreachable nodes: ${unprocessedNodes.join(", ")}`);
        }
        return result;
    }
    /**
     * Execute nodes with advanced error handling and parallelization where possible
     */
    async executeNodesInOrder(executionOrder, nodes, input, apiKeys, options) {
        const variables = { ...input };
        const logs = [];
        const errors = [];
        let hasFailures = false;
        let hasPartialSuccess = false;
        // Execute nodes sequentially for now (can be enhanced with parallel execution)
        for (const nodeId of executionOrder) {
            if (this.executionAborted) {
                logger_1.logger.warn("Execution aborted during node processing", {
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
            const nodeState = this.nodeStates.get(nodeId);
            // Check if dependencies failed
            const dependencyStates = nodeState.dependencies.map((depId) => this.nodeStates.get(depId)?.status);
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
            const result = await this.executeNodeWithRetry(node, variables, apiKeys, options);
            if (result.success) {
                variables[nodeId] = result.output;
                nodeState.output = result.output;
                nodeState.status = "success";
                hasPartialSuccess = true;
                logs.push(...result.logs);
            }
            else {
                nodeState.error = result.error;
                nodeState.status = "failed";
                const nodeError = result.error ||
                    result.output?.error ||
                    result.output?.message ||
                    "Node execution failed";
                errors.push(nodeError);
                logs.push(...result.logs);
                hasFailures = true;
                // Check if we should abort execution based on failure policy
                if (this.shouldAbortExecution(node, nodeError)) {
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
    async executeNodeWithRetry(node, variables, apiKeys, options) {
        const nodeState = this.nodeStates.get(node.id);
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
                const result = await this.executeNodeWithTimeout(node, variables, apiKeys, this.context.executionTimeout / (maxRetries + 1));
                nodeState.endTime = new Date();
                nodeState.status = "success";
                options?.onNodeComplete?.(node.id, true);
                // Reset circuit breaker on success
                this.circuitBreakerFailures.delete(node.type);
                return result;
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                nodeState.endTime = new Date();
                // Record circuit breaker failure
                const failureCount = (this.circuitBreakerFailures.get(node.type) || 0) + 1;
                this.circuitBreakerFailures.set(node.type, failureCount);
                logger_1.logger.warn(`Node execution attempt ${attempt} failed`, {
                    executionId: this.context.executionId,
                    nodeId: node.id,
                    attempt,
                    error: errorMessage,
                });
                // Check if we should retry
                if (attempt <= maxRetries && this.shouldRetry(errorMessage, attempt)) {
                    // Exponential backoff with jitter
                    const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1) + Math.random() * 1000, 30000);
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
    async executeNodeWithTimeout(node, variables, apiKeys, timeoutMs) {
        return new Promise(async (resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Node execution timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            try {
                const result = await this.executeNodeWithFallback(node, variables, apiKeys);
                clearTimeout(timeout);
                resolve(result);
            }
            catch (error) {
                clearTimeout(timeout);
                reject(error);
            }
        });
    }
    /**
     * Execute node with fallback logic
     */
    async executeNodeWithFallback(node, variables, apiKeys) {
        const nodeDefinition = nodes_1.nodeRegistry.get(node.type);
        if (nodeDefinition) {
            // Resolve previous node output from variables (stored keyed by node ID)
            const edges = this.context.edges || [];
            const incomingEdges = edges?.filter((e) => (e.target || e.to) === node.id) ||
                [];
            let previousOutput = {};
            if (incomingEdges.length === 1) {
                const parentId = incomingEdges[0].source || incomingEdges[0].from;
                const parentOutput = variables[parentId]?.output || variables[parentId] || {};
                previousOutput = {
                    ...parentOutput,
                    [parentId]: parentOutput,
                };
            }
            else if (incomingEdges.length > 1) {
                previousOutput = incomingEdges.reduce((acc, edge) => {
                    const parentId = edge.source || edge.from;
                    const parentResult = variables[parentId];
                    const parentOutput = parentResult?.output || parentResult || {};
                    return { ...acc, ...parentOutput, [parentId]: parentOutput };
                }, {});
            }
            // Interpolate {{variables}} and {{nodeId.field}} in config
            const interpolateConfig = (cfg) => {
                if (!cfg || typeof cfg !== "object")
                    return cfg;
                if (typeof cfg === "string") {
                    return cfg.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
                        const trimmed = path.trim();
                        if (trimmed.startsWith("variables.")) {
                            const key = trimmed.replace("variables.", "");
                            const val = key
                                .split(".")
                                .reduce((o, k) => o?.[k], variables);
                            return val !== undefined ? String(val) : match;
                        }
                        const parts = trimmed.split(".");
                        let resolved = variables;
                        for (const part of parts) {
                            resolved = resolved?.[part];
                            if (resolved === undefined)
                                return match;
                        }
                        return resolved !== undefined ? String(resolved) : match;
                    });
                }
                if (Array.isArray(cfg))
                    return cfg.map(interpolateConfig);
                return Object.fromEntries(Object.entries(cfg).map(([k, v]) => [k, interpolateConfig(v)]));
            };
            const resolvedConfig = interpolateConfig(node.config || {});
            const result = await nodeDefinition.handler({
                nodeId: node.id,
                type: node.type,
                nodeType: node.type,
                input: previousOutput,
                previousOutputs: { ...variables },
                variables: { ...variables },
                apiKeys,
                config: resolvedConfig,
                validation: nodeDefinition.validation,
                agentId: this.context.agentId,
                userId: this.context.userId,
                executionId: this.context.executionId,
                workflowId: this.context.workflowId,
            });
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
    async createCompensationAction(node) {
        // Define compensation logic based on node type
        switch (node.type) {
            case "action-email":
                return async () => {
                    // Could send cancellation email or log the action
                    logger_1.logger.info(`Compensating email action for node ${node.id}`);
                };
            case "action-webhook":
                return async () => {
                    // Could send cancellation webhook
                    logger_1.logger.info(`Compensating webhook action for node ${node.id}`);
                };
            case "action-save-db":
                return async () => {
                    // Could rollback database changes
                    logger_1.logger.info(`Compensating database action for node ${node.id}`);
                };
            default:
                return async () => {
                    logger_1.logger.info(`No compensation needed for node ${node.id} (${node.type})`);
                };
        }
    }
    /**
     * Handle workflow completion with compensation logic
     */
    async handleWorkflowCompletion(executionResults, options) {
        const { variables, logs, errors, hasFailures, hasPartialSuccess } = executionResults;
        const overallSuccess = !hasFailures;
        const partialSuccess = hasFailures && hasPartialSuccess;
        // If workflow failed completely and compensation is enabled, compensate successful nodes
        const compensatedNodes = [];
        const failedNodes = [];
        if (hasFailures && this.context.enableCompensation) {
            for (const [nodeId, state] of this.nodeStates) {
                if (state.status === "success" && state.compensationAction) {
                    try {
                        options?.onCompensationStart?.(nodeId);
                        await state.compensationAction();
                        state.status = "compensated";
                        compensatedNodes.push(nodeId);
                        options?.onCompensationComplete?.(nodeId, true);
                        logger_1.logger.info(`Successfully compensated node ${nodeId}`, {
                            executionId: this.context.executionId,
                        });
                    }
                    catch (compensationError) {
                        logger_1.logger.error(`Compensation failed for node ${nodeId}`, {
                            executionId: this.context.executionId,
                            error: compensationError instanceof Error
                                ? compensationError.message
                                : String(compensationError),
                        });
                        options?.onCompensationComplete?.(nodeId, false);
                    }
                }
                else if (state.status === "failed") {
                    failedNodes.push(nodeId);
                }
            }
        }
        else {
            // Just collect failed nodes
            for (const [nodeId, state] of this.nodeStates) {
                if (state.status === "failed") {
                    failedNodes.push(nodeId);
                }
            }
        }
        // Persist execution state for monitoring and debugging
        await this.persistExecutionState(overallSuccess, partialSuccess);
        const nodeStatusCount = Array.from(this.nodeStates.values()).reduce((acc, state) => {
            acc[state.status] = (acc[state.status] || 0) + 1;
            return acc;
        }, {});
        options?.onExecutionComplete?.({
            success: overallSuccess,
            partialSuccess,
            hasOutput: Object.keys(variables).length > 0,
            nodeStatusCount,
        });
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
                executionTime: state.startTime && state.endTime
                    ? state.endTime.getTime() - state.startTime.getTime()
                    : 0,
                logs: state.error ? [state.error] : [],
                attempts: state.attempts,
            })),
            compensatedNodes,
            failedNodes,
            circuitBreakerTripped: Array.from(this.circuitBreakerFailures.values()).some((count) => count >= this.context.circuitBreakerThreshold),
        };
    }
    /**
     * Emergency compensation when execution fails catastrophically
     */
    async emergencyCompensation(options) {
        logger_1.logger.warn("Performing emergency compensation", {
            executionId: this.context.executionId,
        });
        for (const [nodeId, state] of this.nodeStates) {
            if (state.status === "success" && state.compensationAction) {
                try {
                    options?.onCompensationStart?.(nodeId);
                    await state.compensationAction();
                    state.status = "compensated";
                    options?.onCompensationComplete?.(nodeId, true);
                }
                catch (error) {
                    logger_1.logger.error(`Emergency compensation failed for ${nodeId}`, {
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
    isCircuitBreakerTripped(nodeType) {
        const failures = this.circuitBreakerFailures.get(nodeType) || 0;
        return failures >= this.context.circuitBreakerThreshold;
    }
    /**
     * Determine if execution should abort based on failure
     */
    shouldAbortExecution(node, error) {
        // Abort on strict failure policy
        if (this.context.stopOnFailure) {
            return true;
        }
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
    shouldRetry(error, attempt) {
        // Don't retry authentication errors
        if (error.includes("authentication") || error.includes("authorization")) {
            return false;
        }
        // Don't retry quota exceeded
        if (error.includes("quota") || error.includes("limit")) {
            return false;
        }
        // Retry transient errors
        if (error.includes("timeout") ||
            error.includes("network") ||
            error.includes("temporary")) {
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
    async persistExecutionState(overallSuccess, partialSuccess) {
        try {
            const executionState = {
                executionId: this.context.executionId,
                workflowId: this.context.workflowId,
                userId: this.context.userId,
                overallSuccess,
                partialSuccess,
                nodeStates: Array.from(this.nodeStates.entries()).map(([nodeId, state]) => ({
                    nodeId,
                    status: state.status,
                    attempts: state.attempts,
                    startTime: state.startTime?.toISOString(),
                    endTime: state.endTime?.toISOString(),
                    error: state.error,
                    output: state.output,
                })),
                circuitBreakerFailures: Array.from(this.circuitBreakerFailures.entries()),
                executionTime: Date.now() - this.context.startTime.getTime(),
                timestamp: new Date().toISOString(),
            };
            // Store in database for monitoring and potential recovery
            await supabaseClient_1.supabase.from("workflow_execution_states").insert(executionState);
        }
        catch (error) {
            logger_1.logger.error("Failed to persist execution state", {
                executionId: this.context.executionId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
}
exports.AdvancedWorkflowExecutor = AdvancedWorkflowExecutor;
async function executeWorkflow(nodes, edges, input, apiKeys, executionId, userId, agentId, options) {
    const startTime = Date.now();
    try {
        // Try LangGraph execution first
        const workflowConfig = {
            workflowId: (0, crypto_1.randomUUID)(),
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
        const builder = new langgraphWorkflowBuilder_1.AdvancedWorkflowBuilder(workflowConfig);
        if (options) {
            builder.onStream((event) => {
                if (event.type === "node_start" &&
                    event.nodeId &&
                    options.onNodeStart) {
                    logger_1.logger.debug("Stream event: node_start", { nodeId: event.nodeId });
                    options.onNodeStart(event.nodeId);
                }
                else if (event.type === "node_end" &&
                    event.nodeId &&
                    options.onNodeComplete) {
                    logger_1.logger.debug("Stream event: node_end", { nodeId: event.nodeId });
                    options.onNodeComplete(event.nodeId, true);
                }
                else if (event.type === "node_error" &&
                    event.nodeId &&
                    options.onNodeComplete) {
                    logger_1.logger.debug("Stream event: node_error", { nodeId: event.nodeId });
                    options.onNodeComplete(event.nodeId, false, event.data?.error);
                }
                else if (event.type === "execution_complete" &&
                    options.onExecutionComplete) {
                    logger_1.logger.debug("Stream event: execution_complete", {
                        success: event.data?.success,
                        hasOutput: event.data?.hasOutput,
                        nodeStatusCount: event.data?.nodeStatusCount,
                    });
                    options.onExecutionComplete(event.data);
                }
            });
        }
        let result;
        logger_1.logger.info("Executing LangGraph workflow", { executionId });
        try {
            result = await builder.execute(input);
            logger_1.logger.info("LangGraph execution succeeded", {
                executionId,
                success: result.success,
            });
        }
        catch (builderError) {
            logger_1.logger.warn("LangGraph execution failed, falling back to advanced executor", {
                executionId,
                error: builderError instanceof Error
                    ? builderError.message
                    : String(builderError),
            });
            // Fall back to advanced executor
            const advancedExecutor = new AdvancedWorkflowExecutor({
                executionId,
                userId,
                agentId,
                workflowId: workflowConfig.workflowId,
                startTime: new Date(startTime),
                maxRetries: 2,
                enablePartialSuccess: true,
                enableCompensation: true,
                stopOnFailure: true,
                circuitBreakerThreshold: 5,
                executionTimeout: 300000, // 5 minutes
                edges,
            });
            result = await advancedExecutor.executeWorkflow(nodes, edges, input, apiKeys, options);
            // Call execution complete callback for advanced executor
            if (options?.onExecutionComplete) {
                options.onExecutionComplete(result);
            }
        }
        const executionTime = Date.now() - startTime;
        if ("state" in result) {
            // LangGraph result
            const nodeStatuses = result.state.nodeExecutionOrder.map((nodeId) => ({
                nodeId,
                status: result.state.nodeResults[nodeId] ? "success" : "failed",
            }));
            const nodeResults = result.state.nodeExecutionOrder.map((nodeId) => {
                const nodeResult = result.state.nodeResults[nodeId];
                const startTime = result.state.nodeStartTimes[nodeId];
                const endTime = result.state.nodeEndTimes[nodeId];
                const executionTime = startTime && endTime ? endTime.getTime() - startTime.getTime() : 0;
                return {
                    nodeId,
                    success: !!nodeResult,
                    output: nodeResult || {},
                    executionTime,
                    logs: result.state.logs
                        .filter((log) => log.nodeId === nodeId)
                        .map((log) => log.message),
                };
            });
            return {
                success: result.success,
                output: result.output,
                logs: result.logs,
                errors: result.errors,
                nodeStatuses,
                nodeResults,
                executionTime,
                hasOutput: Object.keys(result.output || {}).length > 0,
                nodeStatusCount: Object.keys(result.state.nodeStatuses || {}).reduce((acc, status) => {
                    acc[status] = (acc[status] || 0) + 1;
                    return acc;
                }, {}),
                nodeStatusMap: result.state.nodeStatuses,
            };
        }
        // Advanced executor result
        return {
            success: result.success,
            output: result.output,
            logs: result.logs,
            errors: result.errors,
            nodeStatuses: result.nodeStatuses.map((status) => ({
                nodeId: status.nodeId,
                status: status.status,
            })),
            nodeResults: result.nodeResults.map((nodeResult) => ({
                nodeId: nodeResult.nodeId,
                success: nodeResult.success,
                output: nodeResult.output,
                executionTime: nodeResult.executionTime,
                logs: nodeResult.logs,
            })),
            executionTime,
        };
    }
    catch (error) {
        const executionTime = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger_1.logger.error("Workflow execution failed completely", {
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
function topologicalSort(nodes, edges) {
    const graph = {};
    const inDegree = {};
    for (const node of nodes) {
        graph[node.id] = [];
        inDegree[node.id] = 0;
    }
    for (const edge of edges) {
        const from = edge.from || edge.source;
        const to = edge.to || edge.target;
        if (!(from in graph) || !(to in graph))
            continue;
        graph[from].push(to);
        inDegree[to] = (inDegree[to] || 0) + 1;
    }
    const queue = [];
    for (const nodeId of Object.keys(inDegree)) {
        if (inDegree[nodeId] === 0) {
            queue.push(nodeId);
        }
    }
    const result = [];
    while (queue.length > 0) {
        const nodeId = queue.shift();
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
async function executeNodeWithFallback(node, variables, apiKeys) {
    const nodeDefinition = nodes_1.nodeRegistry.get(node.type);
    if (nodeDefinition) {
        const result = await nodeDefinition.handler({
            nodeId: node.id,
            input: variables,
            variables: { ...variables },
            apiKeys,
            config: node.config || {},
            validation: nodeDefinition.validation,
        });
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
async function executeWorkflowFallback(nodes, edges, input, apiKeys, options) {
    const startTime = Date.now();
    const variables = { ...(input || {}) };
    const logs = [];
    const errors = [];
    const nodeStatuses = [];
    const nodeResults = [];
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
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
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
        options?.onExecutionComplete?.({ success: errors.length === 0 });
        return {
            success: errors.length === 0,
            output: variables,
            logs,
            errors,
            nodeStatuses,
            nodeResults,
            executionTime: Date.now() - startTime,
        };
    }
    catch (error) {
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
