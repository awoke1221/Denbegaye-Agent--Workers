"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupExecutionRoutes = void 0;
const supabaseClient_1 = require("../utils/supabaseClient");
const logger_1 = require("../utils/logger");
// Middleware to verify JWT token
const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    const token = authHeader.substring(7);
    const { data: { user }, error, } = await supabaseClient_1.supabase.auth.getUser(token);
    if (error || !user) {
        return res.status(401).json({ error: "Invalid token" });
    }
    req.user = user;
    next();
};
const setupExecutionRoutes = (app) => {
    // GET /api/executions - List executions for user
    app.get("/api/executions", verifyToken, async (req, res) => {
        try {
            const userId = req.user?.id;
            const { agent_id, status, limit = 50, offset = 0 } = req.query;
            let query = supabaseClient_1.supabase
                .from("agent_executions")
                .select("*")
                .eq("user_id", userId)
                .order("created_at", { ascending: false })
                .range(Number(offset) || 0, (Number(offset) || 0) + (Number(limit) || 50) - 1);
            if (agent_id) {
                query = query.eq("agent_id", agent_id);
            }
            if (status) {
                const statuses = String(status).split(",");
                query = query.in("status", statuses);
            }
            const { data, error, count } = await query;
            if (error) {
                logger_1.logger.error("Failed to fetch executions", { error });
                return res.status(500).json({ error: error.message });
            }
            res.json({
                executions: data || [],
                total: count || 0,
                limit: Number(limit),
                offset: Number(offset),
            });
        }
        catch (error) {
            logger_1.logger.error("Error fetching executions", { error });
            res.status(500).json({ error: "Failed to fetch executions" });
        }
    });
    // GET /api/executions/:id - Get execution details
    app.get("/api/executions/:id", verifyToken, async (req, res) => {
        try {
            const userId = req.user?.id;
            const { id } = req.params;
            const { data, error } = await supabaseClient_1.supabase
                .from("agent_executions")
                .select("*")
                .eq("id", id)
                .eq("user_id", userId)
                .single();
            if (error || !data) {
                return res.status(404).json({ error: "Execution not found" });
            }
            res.json(data);
        }
        catch (error) {
            logger_1.logger.error("Error fetching execution", { error });
            res.status(500).json({ error: "Failed to fetch execution" });
        }
    });
    // GET /api/executions/:id/logs - Get execution logs
    app.get("/api/executions/:id/logs", verifyToken, async (req, res) => {
        try {
            const userId = req.user?.id;
            const { id } = req.params;
            // Verify execution belongs to user
            const { data: execution, error: execError } = await supabaseClient_1.supabase
                .from("agent_executions")
                .select("id")
                .eq("id", id)
                .eq("user_id", userId)
                .single();
            if (execError || !execution) {
                return res.status(404).json({ error: "Execution not found" });
            }
            // Get execution logs
            const { data: logs, error } = await supabaseClient_1.supabase
                .from("execution_logs")
                .select("*")
                .eq("execution_id", id)
                .order("created_at", { ascending: true });
            if (error) {
                logger_1.logger.error("Failed to fetch execution logs", { error });
                return res.status(500).json({ error: error.message });
            }
            res.json({ logs: logs || [] });
        }
        catch (error) {
            logger_1.logger.error("Error fetching execution logs", { error });
            res.status(500).json({ error: "Failed to fetch execution logs" });
        }
    });
    // POST /api/executions/:id/cancel - Cancel execution
    app.post("/api/executions/:id/cancel", verifyToken, async (req, res) => {
        try {
            const userId = req.user?.id;
            const { id } = req.params;
            const { data, error } = await supabaseClient_1.supabase
                .from("agent_executions")
                .update({
                status: "cancelled",
                updated_at: new Date().toISOString(),
            })
                .eq("id", id)
                .eq("user_id", userId)
                .select()
                .single();
            if (error) {
                logger_1.logger.error("Failed to cancel execution", { error });
                return res.status(500).json({ error: error.message });
            }
            res.json({ message: "Execution cancelled", execution: data });
        }
        catch (error) {
            logger_1.logger.error("Error cancelling execution", { error });
            res.status(500).json({ error: "Failed to cancel execution" });
        }
    });
    // DELETE /api/executions/:id - Delete execution record
    app.delete("/api/executions/:id", verifyToken, async (req, res) => {
        try {
            const userId = req.user?.id;
            const { id } = req.params;
            const { error } = await supabaseClient_1.supabase
                .from("agent_executions")
                .delete()
                .eq("id", id)
                .eq("user_id", userId);
            if (error) {
                logger_1.logger.error("Failed to delete execution", { error });
                return res.status(500).json({ error: error.message });
            }
            res.json({ message: "Execution deleted successfully" });
        }
        catch (error) {
            logger_1.logger.error("Error deleting execution", { error });
            res.status(500).json({ error: "Failed to delete execution" });
        }
    });
};
exports.setupExecutionRoutes = setupExecutionRoutes;
