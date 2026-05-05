"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeWorkflow = executeWorkflow;
// Types for workflow execution
const expr_eval_1 = require("expr-eval");
const nodes_1 = require("../nodes");
// Topological sort for execution order
function topologicalSort(nodes, edges) {
    const graph = {};
    const inDegree = {};
    const queue = [];
    const result = [];
    nodes.forEach((node) => {
        graph[node.id] = [];
        inDegree[node.id] = 0;
    });
    edges.forEach((edge) => {
        if (graph[edge.from]) {
            graph[edge.from].push(edge.to);
            inDegree[edge.to] = (inDegree[edge.to] || 0) + 1;
        }
    });
    nodes.forEach((node) => {
        if (inDegree[node.id] === 0) {
            queue.push(node.id);
        }
    });
    while (queue.length > 0) {
        const nodeId = queue.shift();
        result.push(nodeId);
        graph[nodeId].forEach((neighbor) => {
            inDegree[neighbor]--;
            if (inDegree[neighbor] === 0) {
                queue.push(neighbor);
            }
        });
    }
    if (result.length !== nodes.length) {
        throw new Error("Workflow has no starting nodes or contains a cycle");
    }
    return result;
}
// Safe expression evaluator to replace eval()
function safeEval(expression, context = {}) {
    try {
        // Create a parser instance
        const parser = new expr_eval_1.Parser();
        // Parse the expression
        const expr = parser.parse(expression);
        // Evaluate with the provided context
        return expr.evaluate(context);
    }
    catch (error) {
        throw new Error(`Expression evaluation error: ${error}`);
    }
}
async function executeWorkflow(nodes, edges, input, apiKeys, options) {
    const startTime = Date.now();
    const context = {
        input: input ?? {},
        variables: {},
        output: {},
        logs: [],
        errors: [],
    };
    const nodeStatuses = [];
    const nodeResults = [];
    const maxRetries = options?.retryCount ?? 2;
    const nodeTimeout = options?.nodeTimeoutMs ?? 30000;
    try {
        // Use provided execution plan or generate one
        const executionOrder = options?.executionPlan?.executionOrder || topologicalSort(nodes, edges);
        const nodeDependencies = options?.executionPlan?.nodeDependencies || {};
        // Execute nodes in topological order with enhanced error handling
        for (const nodeId of executionOrder) {
            const node = nodes.find((n) => n.id === nodeId);
            if (!node || !node.type) {
                const errorMsg = `Node ${nodeId} is missing or has no type`;
                throw new Error(errorMsg);
            }
            const nodeStartTime = Date.now();
            let lastError;
            let success = false;
            let retryCount = 0;
            const nodeLogs = [];
            // Execute node with retry logic
            while (retryCount <= maxRetries && !success) {
                try {
                    options?.onNodeStatus?.({ nodeId, status: "executing" });
                    options?.onNodeStart?.(nodeId);
                    // Create timeout promise
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error(`Node ${nodeId} execution timeout after ${nodeTimeout}ms`)), nodeTimeout);
                    });
                    // Execute node handler with timeout
                    const executionPromise = executeNodeWithContext(node, context, apiKeys, nodeLogs);
                    await Promise.race([executionPromise, timeoutPromise]);
                    success = true;
                    nodeStatuses.push({ nodeId, status: "success" });
                    options?.onNodeStatus?.({ nodeId, status: "success" });
                }
                catch (error) {
                    retryCount++;
                    lastError = error instanceof Error ? error.message : "Unknown error";
                    if (retryCount <= maxRetries) {
                        nodeLogs.push(`Node ${nodeId} failed (attempt ${retryCount}/${maxRetries + 1}): ${lastError}. Retrying...`);
                        // Exponential backoff
                        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
                    }
                    else {
                        nodeLogs.push(`Node ${nodeId} failed permanently after ${retryCount} attempts: ${lastError}`);
                        nodeStatuses.push({ nodeId, status: "error", error: lastError });
                        options?.onNodeStatus?.({
                            nodeId,
                            status: "error",
                            error: lastError,
                        });
                    }
                }
            }
            const executionTime = Date.now() - nodeStartTime;
            const nodeResult = {
                nodeId,
                success,
                output: success ? context.variables[nodeId] : undefined,
                error: success ? undefined : lastError,
                executionTime,
                logs: nodeLogs,
            };
            nodeResults.push(nodeResult);
            options?.onNodeComplete?.(nodeId, success, lastError, nodeResult);
            // If node failed after all retries, fail the entire workflow
            if (!success) {
                throw new Error(`Node ${nodeId} failed permanently: ${lastError}`);
            }
        }
        const lastNodeId = executionOrder[executionOrder.length - 1];
        context.output = context.variables[lastNodeId] || context.variables;
        context.logs.push("Workflow completed successfully.");
        const totalExecutionTime = Date.now() - startTime;
        options?.onExecutionComplete?.(true);
        return {
            success: true,
            output: context.output,
            logs: context.logs,
            errors: context.errors,
            nodeStatuses,
            nodeResults,
            executionTime: totalExecutionTime,
            executionPlan: {
                executionOrder,
                nodeDependencies,
            },
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        context.errors.push(errorMessage);
        const totalExecutionTime = Date.now() - startTime;
        options?.onExecutionComplete?.(false);
        return {
            success: false,
            output: context.output,
            logs: context.logs,
            errors: context.errors,
            nodeStatuses,
            nodeResults,
            executionTime: totalExecutionTime,
            executionPlan: options?.executionPlan,
        };
    }
}
// Enhanced node execution with better context isolation
async function executeNodeWithContext(node, context, apiKeys, nodeLogs) {
    const nodeDefinition = nodes_1.nodeRegistry.get(node.type);
    if (!nodeDefinition) {
        throw new Error(`No handler for node type: ${node.type}`);
    }
    // Create isolated context for this node execution
    const nodeExecutionContext = {
        nodeId: node.id,
        input: context.input,
        variables: { ...context.variables },
        apiKeys,
        config: node.config,
        validation: nodeDefinition.validation,
    };
    // Execute the handler
    const result = await nodeDefinition.handler(nodeExecutionContext);
    // Add nodeId to the result
    const fullResult = {
        nodeId: node.id,
        ...result,
    };
    // Merge results back to main context
    if (result.success) {
        context.variables[node.id] = result.output;
    }
    else {
        throw new Error(result.error || "Node execution failed");
    }
    // Add logs
    nodeLogs.push(...result.logs);
    context.logs.push(...result.logs);
}
