"use strict";
/**
 * Advanced LangGraph Agent Execution Routes
 * RESTful and WebSocket endpoints for LangGraph-based agent execution
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLangGraphRoutes = createLangGraphRoutes;
exports.setupLangGraphWebSocket = setupLangGraphWebSocket;
const express_1 = require("express");
const supabaseClient_1 = require("../utils/supabaseClient");
const validation_1 = require("../utils/validation");
const logger_1 = require("../utils/logger");
const streamingExecutionEngine_1 = require("../utils/streamingExecutionEngine");
function createLangGraphRoutes(io) {
    const router = (0, express_1.Router)();
    /**
     * POST /langgraph/execute
     * Execute agent workflow with LangGraph
     */
    router.post("/execute", async (req, res) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader?.startsWith("Bearer ")) {
                return res.status(401).json({ error: "Unauthorized" });
            }
            const token = authHeader.substring(7);
            const { data: { user }, error: authError, } = await supabaseClient_1.supabase.auth.getUser(token);
            if (authError || !user) {
                return res.status(401).json({ error: "Invalid token" });
            }
            const { agentId, nodes, edges, input, apiKeys, agentName, enableStreaming = true, } = req.body;
            // Validate workflow graph
            const graphValidation = (0, validation_1.validateAgentGraph)(nodes, edges);
            if (!graphValidation.valid) {
                return res.status(400).json({
                    error: "Invalid workflow graph",
                    details: graphValidation.errors,
                });
            }
            // Generate execution ID
            const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            // Create workflow config
            const workflowConfig = {
                workflowId: agentId || `workflow_${Date.now()}`,
                executionId,
                userId: user.id,
                nodes: nodes.map((n) => ({
                    id: n.id,
                    type: n.type,
                    config: n.data?.config || n.config || {},
                    label: n.label || n.data?.label,
                    description: n.data?.description,
                })),
                edges: (0, validation_1.normalizeAgentEdges)(edges).map((e) => ({
                    source: e.source,
                    target: e.target,
                    condition: e.condition,
                })),
                apiKeys: apiKeys || {},
                variables: input || {},
                maxRetries: 2,
                enableStreaming,
            };
            logger_1.logger.debug("LangGraph execution started", {
                executionId,
                nodeCount: nodes.length,
            });
            // Execute with streaming
            const result = await (0, streamingExecutionEngine_1.executeWorkflowWithStreaming)(workflowConfig, input || {}, (event) => {
                // Broadcast to connected clients
                io.emit(`execution:${executionId}`, event);
            });
            return res.json({
                success: true,
                executionId,
                ...result,
            });
        }
        catch (error) {
            logger_1.logger.error("LangGraph execution error", {
                error: error.message,
            });
            return res.status(500).json({
                error: "Execution failed",
                details: error.message,
            });
        }
    });
    /**
     * GET /langgraph/status/:executionId
     * Get execution status
     */
    router.get("/status/:executionId", (req, res) => {
        let { executionId } = req.params;
        executionId = Array.isArray(executionId) ? executionId[0] : executionId;
        const isExecuting = streamingExecutionEngine_1.streamingExecutionEngine.isExecuting(executionId);
        return res.json({
            executionId,
            isExecuting,
            activeExecutions: streamingExecutionEngine_1.streamingExecutionEngine.getActiveExecutions(),
        });
    });
    /**
     * POST /langgraph/cancel/:executionId
     * Cancel execution
     */
    router.post("/cancel/:executionId", (req, res) => {
        let { executionId } = req.params;
        executionId = Array.isArray(executionId) ? executionId[0] : executionId;
        try {
            streamingExecutionEngine_1.streamingExecutionEngine.cancel(executionId);
            logger_1.logger.debug("Execution cancelled", { executionId });
            return res.json({
                success: true,
                message: "Execution cancelled",
            });
        }
        catch (error) {
            return res.status(500).json({
                error: "Failed to cancel execution",
            });
        }
    });
    /**
     * GET /langgraph/active-executions
     * Get all active executions
     */
    router.get("/active-executions", (req, res) => {
        const activeExecutions = streamingExecutionEngine_1.streamingExecutionEngine.getActiveExecutions();
        return res.json({
            count: activeExecutions.length,
            executions: activeExecutions,
        });
    });
    /**
     * POST /langgraph/validate
     * Validate workflow configuration
     */
    router.post("/validate", (req, res) => {
        try {
            const { nodes, edges } = req.body;
            const validation = (0, validation_1.validateAgentGraph)(nodes, edges);
            return res.json({
                valid: validation.valid,
                errors: validation.errors,
                warnings: validation.warnings,
            });
        }
        catch (error) {
            return res.status(400).json({
                error: "Validation failed",
                details: error.message,
            });
        }
    });
    return router;
}
/**
 * WebSocket handler for streaming execution
 */
function setupLangGraphWebSocket(io) {
    io.on("connection", (socket) => {
        logger_1.logger.debug("WebSocket client connected", { socketId: socket.id });
        /**
         * Subscribe to execution stream
         */
        socket.on("subscribe:execution", (executionId) => {
            logger_1.logger.debug("Client subscribed to execution", {
                socketId: socket.id,
                executionId,
            });
            socket.join(`execution:${executionId}`);
            const streamContext = (0, streamingExecutionEngine_1.createStreamingContext)(executionId);
            const unsubscribe = streamContext.subscribe((event) => {
                socket.emit("execution:update", event);
            });
            socket.on("disconnect", () => {
                unsubscribe();
                logger_1.logger.debug("Client unsubscribed", { socketId: socket.id });
            });
        });
        /**
         * Cancel execution
         */
        socket.on("cancel:execution", (executionId) => {
            logger_1.logger.debug("Execution cancellation requested", {
                socketId: socket.id,
                executionId,
            });
            streamingExecutionEngine_1.streamingExecutionEngine.cancel(executionId);
            socket.emit("execution:cancelled", { executionId });
        });
        /**
         * Get execution status
         */
        socket.on("get:execution-status", (executionId) => {
            const isExecuting = streamingExecutionEngine_1.streamingExecutionEngine.isExecuting(executionId);
            socket.emit("execution:status", {
                executionId,
                isExecuting,
            });
        });
        socket.on("disconnect", () => {
            logger_1.logger.debug("WebSocket client disconnected", { socketId: socket.id });
        });
    });
}
