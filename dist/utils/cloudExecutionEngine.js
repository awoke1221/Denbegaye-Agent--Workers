"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromptEngineering = exports.CloudExecutionEngine = void 0;
exports.executeAgent = executeAgent;
const supabaseClient_1 = require("./supabaseClient");
const memorySystem_1 = require("./memorySystem");
const toolRegistry_1 = require("./toolRegistry");
const observability_1 = require("./observability");
class CloudExecutionEngine {
    constructor(memorySystem, toolRegistry, promptEngineering) {
        this.memorySystem = memorySystem;
        this.toolRegistry = toolRegistry;
        this.promptEngineering = promptEngineering;
    }
    async execute(workflow, context) {
        const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = new Date();
        // Create execution status in store
        const executionStatus = observability_1.executionStore.createExecution(executionId, workflow.id);
        // Create observable logger
        const logger = (0, observability_1.createObservableLogger)(executionId, workflow.id);
        const fullContext = {
            workflowId: workflow.id,
            executionId,
            userId: context.userId || "anonymous",
            variables: context.variables || {},
            apiKeys: context.apiKeys || {},
            memory: {
                shortTerm: {},
                longTerm: [],
            },
            logs: [],
            startTime,
            status: "running",
        };
        // Update execution status
        logger.updateExecutionStatus({
            status: "running",
            progress: 0,
        });
        try {
            // Validate workflow
            const validation = await this.validate(workflow);
            if (!validation.valid) {
                throw new Error(`Workflow validation failed: ${validation.errors.join(", ")}`);
            }
            // Store execution start
            await this.storeExecutionStart(fullContext);
            // Initialize node statuses
            workflow.nodes.forEach((node) => {
                logger.updateNodeStatus(node.id, {
                    nodeId: node.id,
                    type: node.type,
                    label: node.label || node.id,
                    status: observability_1.NodeStatus.PENDING,
                    progress: 0,
                });
            });
            // Execute workflow
            const result = await this.executeWorkflow(workflow, fullContext, logger);
            // Store execution result
            await this.storeExecutionResult(result);
            // Update final status
            logger.updateExecutionStatus({
                status: "completed",
                progress: 100,
                endTime: result.endTime,
                duration: result.duration,
                metrics: result.metrics,
            });
            return result;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            logger.addError(errorMessage);
            logger.updateExecutionStatus({
                status: "failed",
            });
            const errorResult = {
                success: false,
                executionTime: Date.now() - startTime.getTime(),
                nodeResults: {},
                executionId,
                status: "failed",
                endTime: new Date(),
                duration: Date.now() - startTime.getTime(),
                output: {},
                logs: fullContext.logs,
                errors: [errorMessage],
                metrics: {
                    nodesExecuted: 0,
                    totalExecutionTime: Date.now() - startTime.getTime(),
                    memoryUsed: 0,
                    apiCalls: 0,
                    retries: 0,
                },
            };
            await this.storeExecutionResult(errorResult);
            return errorResult;
        }
    }
    async executeWorkflow(workflow, context, logger) {
        const nodeMap = new Map(workflow.nodes.map((node) => [node.id, node]));
        const executedNodes = new Set();
        const pendingNodes = new Set(workflow.nodes.map((node) => node.id));
        const executingNodes = new Set();
        const nodeResults = new Map();
        const nodeErrors = new Map();
        // Build dependency graph
        const dependencyGraph = this.buildDependencyGraph(workflow.nodes, workflow.edges);
        const reverseDependencyGraph = this.buildReverseDependencyGraph(workflow.nodes, workflow.edges);
        // Find nodes with no dependencies (starting nodes)
        const readyNodes = workflow.nodes
            .filter((node) => dependencyGraph.get(node.id)?.size === 0)
            .map((node) => node.id);
        const parallelExecution = workflow.settings?.allowParallelExecution !== false;
        while (pendingNodes.size > 0 || executingNodes.size > 0) {
            // Execute ready nodes (parallel if enabled)
            if (readyNodes.length > 0) {
                const nodesToExecute = readyNodes.splice(0); // Take all ready nodes
                if (parallelExecution && nodesToExecute.length > 1) {
                    // Execute nodes in parallel
                    const executionPromises = nodesToExecute.map((nodeId) => this.executeNodeWithTimeout(nodeMap.get(nodeId), context, nodeResults, logger)
                        .then((result) => ({ nodeId, result, success: true }))
                        .catch((error) => ({ nodeId, error, success: false })));
                    const results = await Promise.allSettled(executionPromises);
                    for (const result of results) {
                        if (result.status === "fulfilled") {
                            const value = result.value;
                            if ("result" in value) {
                                await this.handleNodeSuccess(value.nodeId, value.result, nodeMap, executedNodes, pendingNodes, executingNodes, nodeResults, reverseDependencyGraph, dependencyGraph, readyNodes, context, logger);
                            }
                            else {
                                await this.handleNodeError(value.nodeId, value.error, nodeMap, executedNodes, pendingNodes, executingNodes, nodeErrors, reverseDependencyGraph, context, logger);
                            }
                        }
                        else {
                            // Promise rejection - this shouldn't happen with our error handling
                            console.error("Unexpected promise rejection:", result.reason);
                        }
                    }
                }
                else {
                    // Execute nodes sequentially
                    for (const nodeId of nodesToExecute) {
                        try {
                            const result = await this.executeNodeWithTimeout(nodeMap.get(nodeId), context, nodeResults, logger);
                            await this.handleNodeSuccess(nodeId, result, nodeMap, executedNodes, pendingNodes, executingNodes, nodeResults, reverseDependencyGraph, dependencyGraph, readyNodes, context, logger);
                        }
                        catch (error) {
                            await this.handleNodeError(nodeId, error instanceof Error ? error : new Error(String(error)), nodeMap, executedNodes, pendingNodes, executingNodes, nodeErrors, reverseDependencyGraph, context, logger);
                        }
                    }
                }
            }
            // Check for workflow-level timeout
            if (Date.now() - context.startTime.getTime() >
                (workflow.settings?.maxExecutionTime || 300000)) {
                throw new Error(`Workflow execution timeout after ${workflow.settings?.maxExecutionTime || 300000}ms`);
            }
            // If no nodes are ready and some are still pending, check for deadlocks
            if (readyNodes.length === 0 &&
                pendingNodes.size > 0 &&
                executingNodes.size === 0) {
                const remainingNodes = Array.from(pendingNodes);
                const deadlockDetected = remainingNodes.every((nodeId) => {
                    const deps = dependencyGraph.get(nodeId) || new Set();
                    return Array.from(deps).some((depId) => nodeErrors.has(depId) || !executedNodes.has(depId));
                });
                if (deadlockDetected) {
                    throw new Error(`Workflow deadlock detected. Failed nodes: ${Array.from(nodeErrors.keys()).join(", ")}`);
                }
                // Wait a bit before checking again
                await new Promise((resolve) => setTimeout(resolve, 10));
            }
        }
        const endTime = new Date();
        const duration = endTime.getTime() - context.startTime.getTime();
        // Collect all errors
        const allErrors = Array.from(nodeErrors.entries()).map(([nodeId, error]) => `${nodeId}: ${error.message}`);
        return {
            success: nodeErrors.size === 0,
            executionTime: duration,
            nodeResults: Object.fromEntries(nodeResults),
            executionId: context.executionId,
            status: nodeErrors.size > 0 ? "failed" : "success",
            endTime,
            duration,
            output: Object.fromEntries(nodeResults),
            logs: context.logs,
            errors: allErrors,
            metrics: {
                nodesExecuted: executedNodes.size,
                totalExecutionTime: duration,
                memoryUsed: this.calculateMemoryUsage(context),
                apiCalls: this.countApiCalls(context.logs),
                retries: workflow.nodes.reduce((sum, node) => sum + (node.retryCount || 0), 0),
            },
        };
    }
    buildDependencyGraph(nodes, edges) {
        const graph = new Map();
        nodes.forEach((node) => graph.set(node.id, new Set()));
        edges.forEach((edge) => {
            const targetDeps = graph.get(edge.target) || new Set();
            targetDeps.add(edge.source);
            graph.set(edge.target, targetDeps);
        });
        return graph;
    }
    buildReverseDependencyGraph(nodes, edges) {
        const graph = new Map();
        nodes.forEach((node) => graph.set(node.id, new Set()));
        edges.forEach((edge) => {
            const sourceDeps = graph.get(edge.source) || new Set();
            sourceDeps.add(edge.target);
            graph.set(edge.source, sourceDeps);
        });
        return graph;
    }
    async executeNodeWithTimeout(node, context, nodeResults, logger) {
        const timeout = node.config.timeout || 30000; // Default 30 seconds
        return Promise.race([
            this.executeNodeWithRetry(node, context, nodeResults, logger),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`Node ${node.id} execution timeout after ${timeout}ms`)), timeout)),
        ]);
    }
    async executeNodeWithRetry(node, context, nodeResults, logger) {
        const retryConfig = node.config.retryConfig || {
            maxRetries: 0,
            backoffMultiplier: 2,
            maxBackoff: 30000,
        };
        let lastError;
        for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
            try {
                node.executionState = "running";
                const startTime = Date.now();
                const result = await this.executeNode(node, context, nodeResults);
                node.executionState = "completed";
                node.executionResult = result;
                node.executionTime = Date.now() - startTime;
                node.retryCount = attempt;
                logger.log(node.id, "info", `Node executed successfully in ${node.executionTime}ms (attempt ${attempt + 1})`);
                return result;
            }
            catch (error) {
                lastError = error;
                node.executionState = "failed";
                logger.log(node.id, "warn", `Node execution failed (attempt ${attempt + 1}/${retryConfig.maxRetries + 1}): ${error.message}`);
                if (attempt < retryConfig.maxRetries) {
                    const backoffTime = Math.min(retryConfig.backoffMultiplier ** attempt * 1000, retryConfig.maxBackoff);
                    logger.log(node.id, "info", `Retrying in ${backoffTime}ms`);
                    await new Promise((resolve) => setTimeout(resolve, backoffTime));
                }
            }
        }
        throw lastError;
    }
    async handleNodeSuccess(nodeId, result, nodeMap, executedNodes, pendingNodes, executingNodes, nodeResults, reverseDependencyGraph, dependencyGraph, readyNodes, context, logger) {
        nodeResults.set(nodeId, result);
        executedNodes.add(nodeId);
        pendingNodes.delete(nodeId);
        executingNodes.delete(nodeId);
        // Update node status to completed
        const node = nodeMap.get(nodeId);
        logger.updateNodeStatus(nodeId, {
            status: observability_1.NodeStatus.COMPLETED,
            progress: 100,
            endTime: new Date(),
        });
        // Find nodes that now have all dependencies satisfied
        const dependentNodes = reverseDependencyGraph.get(nodeId) || new Set();
        for (const depNodeId of dependentNodes) {
            if (!executedNodes.has(depNodeId) &&
                !executingNodes.has(depNodeId) &&
                pendingNodes.has(depNodeId)) {
                const nodeDependencies = dependencyGraph.get(depNodeId) || new Set();
                const allDepsExecuted = Array.from(nodeDependencies).every((depId) => executedNodes.has(depId));
                if (allDepsExecuted && !readyNodes.includes(depNodeId)) {
                    readyNodes.push(depNodeId);
                }
            }
        }
    }
    async handleNodeError(nodeId, error, nodeMap, executedNodes, pendingNodes, executingNodes, nodeErrors, reverseDependencyGraph, context, logger) {
        nodeErrors.set(nodeId, error);
        pendingNodes.delete(nodeId);
        executingNodes.delete(nodeId);
        // Update node status to failed
        logger.updateNodeStatus(nodeId, {
            status: observability_1.NodeStatus.FAILED,
            endTime: new Date(),
            error: error.message,
        });
        logger.log(nodeId, "error", `Node execution failed: ${error.message}`);
        // Mark dependent nodes as failed due to dependency failure
        const dependentNodes = reverseDependencyGraph.get(nodeId) || new Set();
        for (const depNodeId of dependentNodes) {
            if (!executedNodes.has(depNodeId) && !nodeErrors.has(depNodeId)) {
                const depError = new Error(`Dependency ${nodeId} failed: ${error.message}`);
                nodeErrors.set(depNodeId, depError);
                pendingNodes.delete(depNodeId);
                executingNodes.delete(depNodeId);
                this.log(context, depNodeId, "error", `Node failed due to dependency failure: ${depError.message}`);
            }
        }
    }
    async executeNode(node, context, nodeResults) {
        switch (node.type) {
            case "ai-reasoning":
                return await this.executeAIReasoningNode(node, context);
            case "ai-memory":
                return await this.executeMemoryNode(node, context);
            case "ai-tool-calling":
                return await this.executeToolCallingNode(node, context);
            case "multi-agent-orchestrator":
                return await this.executeMultiAgentNode(node, context);
            case "conditional-branch":
                return await this.executeConditionalNode(node, context, nodeResults);
            case "loop-controller":
                return await this.executeLoopNode(node, context, nodeResults);
            case "human-approval":
                return await this.executeApprovalNode(node, context);
            case "action-api-call":
                return await this.executeApiCallNode(node, context);
            case "schedule-trigger":
            case "event-trigger":
                return await this.executeTriggerNode(node, context);
            default:
                return await this.executeGenericNode(node, context);
        }
    }
    async executeMultiAgentNode(node, context) {
        const config = node.config.multiAgent;
        const results = [];
        const errors = [];
        // Execute multiple agents in parallel or sequence
        const executionPromises = config.agents.map(async (agentConfig) => {
            try {
                // Create sub-execution for each agent
                const subExecutionId = `${context.executionId}_sub_${agentConfig.id}`;
                // Load agent configuration
                const { data: agent } = await supabaseClient_1.supabase
                    .from("user_agents")
                    .select("*")
                    .eq("id", agentConfig.id)
                    .single();
                if (!agent) {
                    throw new Error(`Agent ${agentConfig.id} not found`);
                }
                // Execute agent workflow using the external workflow engine
                const { executeAgentWorkflow } = await Promise.resolve().then(() => __importStar(require("./externalWorkflowEngine")));
                const agentResult = await executeAgentWorkflow({
                    agentId: agentConfig.id,
                    userId: context.userId,
                    input: agentConfig.input || context.variables,
                    config: agent.config,
                    apiKeys: context.variables.apiKeys || {},
                    executionId: subExecutionId,
                });
                return {
                    agentId: agentConfig.id,
                    result: agentResult,
                    success: true,
                };
            }
            catch (error) {
                errors.push({
                    agentId: agentConfig.id,
                    error: error instanceof Error ? error.message : String(error),
                });
                return {
                    agentId: agentConfig.id,
                    error: error instanceof Error ? error.message : String(error),
                    success: false,
                };
            }
        });
        let executionResults;
        if (config.executionMode === "parallel") {
            const settledResults = await Promise.allSettled(executionPromises);
            executionResults = settledResults.map((result) => {
                if (result.status === "fulfilled") {
                    return result.value;
                }
                else {
                    return { error: result.reason, success: false };
                }
            });
        }
        else {
            executionResults = await this.executeSequentially(executionPromises);
        }
        // Process results
        for (const result of executionResults) {
            if (result.success !== false && !result.error) {
                results.push(result);
            }
            else {
                errors.push({
                    agentId: result.agentId || "unknown",
                    error: result.error instanceof Error
                        ? result.error.message
                        : String(result.error),
                });
            }
        }
        // Apply aggregation strategy
        let finalResult;
        switch (config.aggregationStrategy) {
            case "consensus":
                finalResult = this.aggregateByConsensus(results);
                break;
            case "majority":
                finalResult = this.aggregateByMajority(results);
                break;
            case "weighted":
                finalResult = this.aggregateByWeighted(results, config.weights);
                break;
            default:
                finalResult = results;
        }
        return {
            results,
            errors,
            finalResult,
            totalAgents: config.agents.length,
            successCount: results.filter((r) => r.success).length,
            errorCount: errors.length,
        };
    }
    async executeLoopNode(node, context, nodeResults) {
        const config = node.config.loop;
        const iterations = [];
        let loopCount = 0;
        const maxIterations = config.maxIterations;
        // For now, implement a simple loop that executes the next connected node
        // In a real implementation, this would need workflow graph analysis
        while (loopCount < maxIterations) {
            loopCount++;
            // Simple iteration - in practice, this would execute child nodes
            const iterationResult = {
                iteration: loopCount,
                timestamp: new Date().toISOString(),
                data: context.variables,
            };
            iterations.push(iterationResult);
            // Check break condition if specified
            if (config.breakCondition) {
                // Simple evaluation - could be enhanced with expression evaluation
                const shouldBreak = this.evaluateLoopCondition(config.breakCondition, iterationResult);
                if (shouldBreak)
                    break;
            }
            // Update loop variable if specified
            if (config.loopVariable) {
                context.variables[config.loopVariable] = loopCount;
            }
            // Update accumulator if specified
            if (config.accumulator) {
                context.variables[config.accumulator] = iterations;
            }
        }
        return {
            iterations,
            totalIterations: loopCount,
            maxIterations,
            completed: loopCount < maxIterations,
            finalVariables: context.variables,
        };
    }
    async executeApprovalNode(node, context) {
        const config = node.config.approval;
        // Store approval request in database
        const { data: approvalRequest, error } = await supabaseClient_1.supabase
            .from("approval_requests")
            .insert({
            execution_id: context.executionId,
            node_id: node.id,
            workflow_id: context.workflowId,
            user_id: context.userId,
            request_data: {
                title: "Approval Required",
                description: config.approvalMessage || "Please review and approve this action",
                context: context.variables,
                options: ["Approve", "Reject"],
                approverRoles: config.approverRoles,
                timeout: config.timeout || 3600000, // 1 hour default
            },
            status: "pending",
            created_at: new Date().toISOString(),
        })
            .select()
            .single();
        if (error) {
            throw new Error(`Failed to create approval request: ${error.message}`);
        }
        // Wait for approval (in a real implementation, this would use websockets or polling)
        // For now, we'll simulate waiting with a timeout
        const timeout = config.timeout || 3600000; // 1 hour
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            // Check for approval status
            const { data: updatedRequest } = await supabaseClient_1.supabase
                .from("approval_requests")
                .select("status, decision, approved_by, approved_at")
                .eq("id", approvalRequest.id)
                .single();
            if (updatedRequest && updatedRequest.status !== "pending") {
                return {
                    approved: updatedRequest.status === "approved",
                    decision: updatedRequest.decision,
                    approvedBy: updatedRequest.approved_by,
                    approvedAt: updatedRequest.approved_at,
                    waitTime: Date.now() - startTime,
                };
            }
            // Wait before checking again
            await new Promise((resolve) => setTimeout(resolve, 5000)); // Check every 5 seconds
        }
        // Timeout - auto-decide based on config
        const autoDecision = config.autoApprove ? "approved" : "rejected";
        await supabaseClient_1.supabase
            .from("approval_requests")
            .update({
            status: autoDecision,
            decision: autoDecision,
            approved_at: new Date().toISOString(),
        })
            .eq("id", approvalRequest.id);
        return {
            approved: autoDecision === "approved",
            decision: autoDecision,
            timeout: true,
            waitTime: Date.now() - startTime,
        };
    }
    async executeTriggerNode(node, context) {
        const config = node.config.trigger;
        if (node.type === "schedule-trigger") {
            // Schedule-based trigger
            const { data: scheduledJob, error } = await supabaseClient_1.supabase
                .from("scheduled_jobs")
                .insert({
                workflow_id: context.workflowId,
                node_id: node.id,
                execution_id: context.executionId,
                schedule_type: "cron",
                schedule_config: { cron: config.schedule },
                status: "scheduled",
                next_run: this.calculateNextRun({
                    type: "cron",
                    cron: config.schedule,
                }),
                created_at: new Date().toISOString(),
            })
                .select()
                .single();
            if (error) {
                throw new Error(`Failed to schedule trigger: ${error.message}`);
            }
            return {
                triggerType: "schedule",
                scheduledJobId: scheduledJob.id,
                nextRun: scheduledJob.next_run,
                status: "scheduled",
            };
        }
        else if (node.type === "event-trigger") {
            // Event-based trigger
            const { data: eventTrigger, error } = await supabaseClient_1.supabase
                .from("event_triggers")
                .insert({
                workflow_id: context.workflowId,
                node_id: node.id,
                execution_id: context.executionId,
                event_type: config.eventType,
                event_filters: config.filters,
                status: "active",
                created_at: new Date().toISOString(),
            })
                .select()
                .single();
            if (error) {
                throw new Error(`Failed to create event trigger: ${error.message}`);
            }
            return {
                triggerType: "event",
                eventTriggerId: eventTrigger.id,
                eventType: config.eventType,
                status: "active",
            };
        }
        return {
            triggerType: "unknown",
            status: "configured",
        };
    }
    async executeGenericNode(node, context) {
        this.log(context, node.id, "info", `Executing generic node of type: ${node.type}`);
        return {
            success: true,
            message: `Generic node ${node.type} executed successfully.`,
        };
    }
    async executeAIReasoningNode(node, context) {
        const config = node.config.reasoning;
        let currentPlan = "";
        let iterations = 0;
        // Parse provider and model from config.model (expected format: "provider/model")
        const [provider, model] = config.model.split("/", 2);
        if (!provider || !model) {
            throw new Error(`Invalid model format: ${config.model}. Expected format: provider/model`);
        }
        // Get API key for the provider
        const apiKey = context.apiKeys[provider.toLowerCase()];
        if (!apiKey) {
            throw new Error(`Missing API key for provider: ${provider}`);
        }
        while (iterations < config.maxIterations) {
            // Planning phase
            const planningPrompt = await this.promptEngineering.optimize(config.planningPrompt, {
                context: context.variables,
                iteration: iterations,
            });
            const planResponse = await this.callAI(provider, model, [{ role: "user", content: planningPrompt }], apiKey, { temperature: 0.7, maxTokens: 1000 });
            const plan = planResponse.choices?.[0]?.message?.content ||
                planResponse.content ||
                planResponse;
            // Reflection phase
            const reflectionPrompt = await this.promptEngineering.optimize(config.reflectionPrompt, {
                plan,
                context: context.variables,
                iteration: iterations,
            });
            const reflectionResponse = await this.callAI(provider, model, [{ role: "user", content: reflectionPrompt }], apiKey, { temperature: 0.7, maxTokens: 1000 });
            const reflection = reflectionResponse.choices?.[0]?.message?.content ||
                reflectionResponse.content ||
                reflectionResponse;
            // Check confidence
            const confidence = this.extractConfidence(reflection);
            if (confidence >= config.confidenceThreshold) {
                return { plan, reflection, confidence, iterations: iterations + 1 };
            }
            currentPlan = plan;
            iterations++;
        }
        return { plan: currentPlan, iterations, confidence: 0 };
    }
    async executeMemoryNode(node, context) {
        const config = node.config.memory;
        if (config.type === "short-term") {
            if (config.storageKey) {
                context.memory.shortTerm[config.storageKey] = context.variables;
                return { stored: true, key: config.storageKey };
            }
            return context.memory.shortTerm;
        }
        else {
            // Long-term memory with vector search
            if (config.retrievalQuery) {
                const memories = await this.memorySystem.retrieve(config.retrievalQuery, 5, config.scope);
                return { memories, count: memories.length };
            }
            else if (config.storageKey) {
                const content = JSON.stringify(context.variables);
                const memoryId = await this.memorySystem.store({
                    content: JSON.stringify(context.variables),
                    embedding: [], // Would need to generate embedding in real implementation
                    metadata: {
                        workflowId: context.workflowId,
                        nodeId: node.id,
                        type: "workflow-data",
                    },
                    scope: config.scope,
                });
                return { stored: true, memoryId };
            }
        }
        return null;
    }
    async executeToolCallingNode(node, context) {
        const config = node.config.toolCalling;
        const results = [];
        for (const tool of config.tools) {
            try {
                const toolDef = await this.toolRegistry.getTool(tool.name);
                if (!toolDef)
                    continue;
                const result = await this.toolRegistry.executeTool(tool.name, tool.parameters || {});
                results.push({ tool: tool.name, result, success: true });
            }
            catch (error) {
                results.push({
                    tool: tool.name,
                    error: error instanceof Error ? error.message : String(error),
                    success: false,
                });
            }
        }
        return { results, totalTools: config.tools.length };
    }
    async executeConditionalNode(node, context, nodeResults) {
        const config = node.config.conditional;
        const results = [];
        for (const condition of config.conditions) {
            const value = this.getNestedValue(context.variables, condition.variable);
            const matches = this.evaluateCondition(value, condition.operator, condition.value);
            results.push({ condition: condition.variable, matches, value });
            if (config.evaluationMode === "any" && matches)
                break;
            if (config.evaluationMode === "all" && !matches)
                break;
        }
        const overallMatch = config.evaluationMode === "any"
            ? results.some((r) => r.matches)
            : results.every((r) => r.matches);
        return {
            conditions: results,
            overallMatch,
            nextPath: overallMatch ? "true" : "false",
        };
    }
    async executeApiCallNode(node, context) {
        const config = node.config.api;
        const url = this.interpolateVariables(config.url, context.variables);
        const headers = this.interpolateVariables(config.headers, context.variables);
        const body = config.body
            ? this.interpolateVariables(config.body, context.variables)
            : undefined;
        let attempt = 0;
        const maxRetries = config.retryConfig?.maxRetries || 3;
        while (attempt < maxRetries) {
            try {
                const response = await fetch(url, {
                    method: config.method,
                    headers: {
                        "Content-Type": "application/json",
                        ...headers,
                    },
                    body: body ? JSON.stringify(body) : undefined,
                });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                const data = await response.json();
                return {
                    success: true,
                    data,
                    status: response.status,
                    attempt: attempt + 1,
                };
            }
            catch (error) {
                attempt++;
                if (attempt >= maxRetries) {
                    throw new Error(`API call failed after ${maxRetries} attempts: ${error instanceof Error ? error.message : String(error)}`);
                }
                // Exponential backoff
                const backoff = Math.min((config.retryConfig?.backoffMultiplier || 2) ** attempt * 1000, config.retryConfig?.maxBackoff || 30000);
                await new Promise((resolve) => setTimeout(resolve, backoff));
            }
        }
    }
    log(context, nodeId, level, message, data) {
        const log = {
            id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            nodeId,
            timestamp: new Date(),
            level,
            message,
            data,
        };
        context.logs.push(log);
    }
    async executeSequentially(promises) {
        const results = [];
        for (const promise of promises) {
            results.push(await promise);
        }
        return results;
    }
    aggregateByConsensus(results) {
        // Simple consensus: return the most common result
        const resultCounts = new Map();
        const resultValues = new Map();
        for (const result of results) {
            if (result.success && result.result) {
                const key = JSON.stringify(result.result);
                resultCounts.set(key, (resultCounts.get(key) || 0) + 1);
                resultValues.set(key, result.result);
            }
        }
        let maxCount = 0;
        let consensusResult = null;
        for (const [key, count] of resultCounts) {
            if (count > maxCount) {
                maxCount = count;
                consensusResult = resultValues.get(key);
            }
        }
        return consensusResult;
    }
    aggregateByMajority(results) {
        // Return result from majority of agents
        const successResults = results.filter((r) => r.success);
        if (successResults.length > results.length / 2) {
            return successResults[0]?.result; // Return first successful result
        }
        return null;
    }
    aggregateByWeighted(results, weights) {
        if (!weights)
            return this.aggregateByConsensus(results);
        let totalWeight = 0;
        let weightedResult = null;
        for (const result of results) {
            if (result.success && result.result) {
                const weight = weights[result.agentId] || 1;
                // Simple weighted aggregation - could be more sophisticated
                if (!weightedResult || weight > totalWeight) {
                    weightedResult = result.result;
                    totalWeight = weight;
                }
            }
        }
        return weightedResult;
    }
    evaluateLoopCondition(condition, iterationResult) {
        // Simple condition evaluation - could be enhanced with expression evaluation
        if (typeof condition === "string") {
            // Check if the condition string appears in the iteration result
            return JSON.stringify(iterationResult).includes(condition);
        }
        return false;
    }
    calculateNextRun(scheduleConfig) {
        const now = new Date();
        switch (scheduleConfig.type) {
            case "cron":
                // Simple cron parsing - would need a proper cron library
                return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(); // Daily default
            case "interval":
                const interval = scheduleConfig.interval || 3600000; // 1 hour default
                return new Date(now.getTime() + interval).toISOString();
            case "fixed":
                return (scheduleConfig.nextRun ||
                    new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString());
            default:
                return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
        }
    }
    transformResponse(data, transform) {
        // Simple transformation - could be enhanced with JSONPath or similar
        if (transform.path) {
            return this.getNestedValue(data, transform.path);
        }
        if (transform.map) {
            const result = {};
            for (const [newKey, path] of Object.entries(transform.map)) {
                result[newKey] = this.getNestedValue(data, path);
            }
            return result;
        }
        return data;
    }
    extractConfidence(text) {
        // Simple confidence extraction - in real implementation, use AI to analyze
        return 0.8;
    }
    getNestedValue(obj, path) {
        return path.split(".").reduce((current, key) => current?.[key], obj);
    }
    evaluateCondition(value, operator, expected) {
        switch (operator) {
            case "equals":
                return value === expected;
            case "not_equals":
                return value !== expected;
            case "contains":
                return String(value).includes(String(expected));
            case "greater_than":
                return Number(value) > Number(expected);
            case "less_than":
                return Number(value) < Number(expected);
            case "regex_match":
                return new RegExp(expected).test(String(value));
            default:
                return false;
        }
    }
    interpolateVariables(template, variables) {
        if (typeof template === "string") {
            return template.replace(/\{\{(\w+)\}\}/g, (match, key) => variables[key] || match);
        }
        if (typeof template === "object" && template !== null) {
            const result = { ...template };
            for (const [key, value] of Object.entries(result)) {
                result[key] = this.interpolateVariables(value, variables);
            }
            return result;
        }
        return template;
    }
    calculateMemoryUsage(context) {
        // Rough estimation
        return JSON.stringify(context).length;
    }
    countApiCalls(logs) {
        return logs.filter((log) => log.message.includes("API call")).length;
    }
    // Database operations
    async storeExecutionStart(context) {
        const { error } = await supabaseClient_1.supabase.from("executions").upsert({
            id: context.executionId,
            ...context,
            status: "running",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
        if (error) {
            console.error("Supabase storeExecutionStart error:", error);
            throw new Error("Failed to store execution start.");
        }
    }
    async storeExecutionResult(result) {
        const { error } = await supabaseClient_1.supabase
            .from("executions")
            .update({
            ...result,
            updated_at: new Date().toISOString(),
        })
            .eq("id", result.executionId);
        if (error) {
            console.error("Supabase storeExecutionResult error:", error);
            throw new Error("Failed to store execution result.");
        }
    }
    async validate(workflow) {
        const errors = [];
        // Check for cycles
        if (this.hasCycles(workflow.nodes, workflow.edges)) {
            errors.push("Workflow contains cycles");
        }
        // Check for disconnected nodes
        const connectedNodes = new Set();
        workflow.edges.forEach((edge) => {
            connectedNodes.add(edge.source);
            connectedNodes.add(edge.target);
        });
        workflow.nodes.forEach((node) => {
            if (!connectedNodes.has(node.id)) {
                errors.push(`Node ${node.id} is not connected to the workflow`);
            }
        });
        // Validate node configurations
        workflow.nodes.forEach((node) => {
            const nodeErrors = this.validateNode(node);
            errors.push(...nodeErrors);
        });
        return { valid: errors.length === 0, errors };
    }
    hasCycles(nodes, edges) {
        // Simple cycle detection using DFS
        const visited = new Set();
        const recStack = new Set();
        const dfs = (nodeId) => {
            if (recStack.has(nodeId))
                return true;
            if (visited.has(nodeId))
                return false;
            visited.add(nodeId);
            recStack.add(nodeId);
            const neighbors = edges
                .filter((edge) => edge.source === nodeId)
                .map((edge) => edge.target);
            for (const neighbor of neighbors) {
                if (dfs(neighbor))
                    return true;
            }
            recStack.delete(nodeId);
            return false;
        };
        for (const node of nodes) {
            if (dfs(node.id))
                return true;
        }
        return false;
    }
    validateNode(node) {
        const errors = [];
        // Basic validation
        if (!node.id)
            errors.push(`Node missing ID`);
        if (!node.type)
            errors.push(`Node ${node.id} missing type`);
        if (!node.label)
            errors.push(`Node ${node.id} missing label`);
        // Type-specific validation
        switch (node.type) {
            case "ai-reasoning":
                if (!node.config.reasoning?.model) {
                    errors.push(`Node ${node.id} missing AI model configuration`);
                }
                break;
            case "action-api-call":
                if (!node.config.api?.url) {
                    errors.push(`Node ${node.id} missing API URL`);
                }
                break;
        }
        return errors;
    }
    async getExecutionStatus(executionId) {
        const { data, error } = await supabaseClient_1.supabase
            .from("executions")
            .select("*")
            .eq("id", executionId)
            .single();
        if (error) {
            console.error("Supabase getExecutionStatus error:", error);
            return null;
        }
        return data;
    }
    async cancelExecution(executionId) {
        const { error } = await supabaseClient_1.supabase
            .from("executions")
            .update({
            status: "cancelled",
            endTime: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
            .eq("id", executionId);
        if (error) {
            console.error("Supabase cancelExecution error:", error);
            return false;
        }
        return true;
    }
    async getExecutionHistory(workflowId, limitCount = 10) {
        const { data, error } = await supabaseClient_1.supabase
            .from("executions")
            .select("*")
            .eq("workflowId", workflowId)
            .order("startTime", { ascending: false })
            .limit(limitCount);
        if (error) {
            console.error("Supabase getExecutionHistory error:", error);
            return [];
        }
        return (data || []);
    }
    async callAI(provider, model, messages, apiKey, options = {}) {
        try {
            switch (provider.toLowerCase()) {
                case "openai":
                    return await this.callOpenAI(model, messages, apiKey, options);
                case "gemini":
                    return await this.callGemini(model, messages, apiKey, options);
                case "anthropic":
                    return await this.callAnthropic(model, messages, apiKey, options);
                case "deepseek":
                    return await this.callDeepSeek(model, messages, apiKey, options);
                default:
                    throw new Error(`Unsupported AI provider: ${provider}`);
            }
        }
        catch (error) {
            console.error(`AI call failed for provider ${provider}:`, error);
            throw error;
        }
    }
    async callOpenAI(model, messages, apiKey, options) {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages,
                temperature: options.temperature || 0.7,
                max_tokens: options.maxTokens || 1000,
                ...options,
            }),
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
        }
        return await response.json();
    }
    async callGemini(model, messages, apiKey, options) {
        // Convert messages to Gemini format
        const contents = messages.map((msg) => ({
            role: msg.role === "assistant" ? "model" : msg.role,
            parts: [{ text: msg.content }],
        }));
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                contents,
                generationConfig: {
                    temperature: options.temperature || 0.7,
                    maxOutputTokens: options.maxTokens || 1000,
                    ...options,
                },
            }),
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Gemini API error: ${error.error?.message || response.statusText}`);
        }
        return await response.json();
    }
    async callAnthropic(model, messages, apiKey, options) {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model,
                messages,
                max_tokens: options.maxTokens || 1000,
                temperature: options.temperature || 0.7,
                ...options,
            }),
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Anthropic API error: ${error.error?.message || response.statusText}`);
        }
        return await response.json();
    }
    async callDeepSeek(model, messages, apiKey, options) {
        const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages,
                temperature: options.temperature || 0.7,
                max_tokens: options.maxTokens || 1000,
                ...options,
            }),
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(`DeepSeek API error: ${error.error?.message || response.statusText}`);
        }
        return await response.json();
    }
}
exports.CloudExecutionEngine = CloudExecutionEngine;
// Placeholder implementations for dependencies
class MemorySystem {
    async store(content, metadata, scope) {
        return `mem_${Date.now()}`;
    }
    async retrieve(query, scope, limit) {
        return [];
    }
    async update(memoryId, content, metadata) {
        return true;
    }
    async delete(memoryId) {
        return true;
    }
    async searchSimilar(embedding, scope, threshold) {
        return [];
    }
}
class ToolRegistry {
    async register(tool) {
        return `tool_${Date.now()}`;
    }
    async unregister(toolId) {
        return true;
    }
    async getTool(toolId) {
        return null;
    }
    async listTools(category) {
        return [];
    }
    async executeTool(toolId, parameters) {
        return {};
    }
}
class PromptEngineering {
    async optimize(prompt, context) {
        return prompt;
    }
    async generateFromTemplate(templateId, variables) {
        return "";
    }
    async validatePrompt(prompt) {
        return { valid: true, errors: [] };
    }
    async generateSystemPrompt(type, config) {
        // Generate system prompts based on type
        switch (type) {
            case "ai-chat":
                return "You are a helpful AI assistant.";
            case "ai-reasoning":
                return "You are an AI assistant that thinks step by step.";
            default:
                return "You are an AI assistant.";
        }
    }
    async getTemplates(category) {
        return [];
    }
}
exports.PromptEngineering = PromptEngineering;
// ===========================================
// EXECUTE AGENT FUNCTION (FOR JOB PROCESSOR)
// ===========================================
async function executeAgent({ agentId, userId, input, config, apiKeys, executionId, }) {
    try {
        // Create workflow definition from agent config
        const workflow = {
            id: agentId,
            name: config.agentName || "Agent Workflow",
            description: "Generated workflow from agent configuration",
            version: "1.0.0",
            nodes: config.nodes || [],
            edges: config.edges || [],
            metadata: {
                author: userId,
                createdAt: new Date(),
                updatedAt: new Date(),
                tags: ["agent", "generated"],
                category: "ai-agent",
                permissions: ["execute"],
            },
            settings: {
                maxExecutionTime: 300000, // 5 minutes
                maxMemoryUsage: 1000000, // 1MB
                allowParallelExecution: false,
                enableDebugging: true,
                logLevel: "info",
            },
        };
        // Create execution engine
        const memorySystem = new memorySystem_1.SupabaseMemorySystem();
        const toolRegistry = new toolRegistry_1.SupabaseToolRegistry();
        const promptEngineering = new PromptEngineering();
        const engine = new CloudExecutionEngine(memorySystem, toolRegistry, promptEngineering);
        // Execute workflow
        const result = await engine.execute(workflow, {
            userId,
            variables: { ...input, apiKeys },
        });
        return result;
    }
    catch (error) {
        console.error(`Agent execution failed for ${executionId}:`, error);
        throw error;
    }
}
