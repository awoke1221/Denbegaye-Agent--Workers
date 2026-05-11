"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupAgentRoutes = void 0;
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
const setupAgentRoutes = (app) => {
    // GET /api/agents - List all user agents
    app.get("/api/agents", verifyToken, async (req, res) => {
        try {
            const userId = req.user?.id;
            const { search, status, limit = 50, offset = 0 } = req.query;
            let query = supabaseClient_1.supabase
                .from("user_agents")
                .select("*")
                .eq("user_id", userId)
                .order("updated_at", { ascending: false })
                .range(Number(offset) || 0, (Number(offset) || 0) + (Number(limit) || 50) - 1);
            if (search) {
                query = query.ilike("name", `%${search}%`);
            }
            if (status) {
                query = query.eq("status", status);
            }
            const { data, error, count } = await query;
            if (error) {
                logger_1.logger.error("Failed to fetch agents", { error });
                return res.status(500).json({ error: error.message });
            }
            res.json({
                agents: data || [],
                total: count || 0,
                limit: Number(limit),
                offset: Number(offset),
            });
        }
        catch (error) {
            logger_1.logger.error("Error fetching agents", { error });
            res.status(500).json({ error: "Failed to fetch agents" });
        }
    });
    // POST /api/agents - Create new agent
    app.post("/api/agents", verifyToken, async (req, res) => {
        try {
            const userId = req.user?.id;
            const { name, description, config, nodes, edges, template_id } = req.body;
            if (!name || !config) {
                return res.status(400).json({ error: "Missing required fields" });
            }
            const { data, error } = await supabaseClient_1.supabase
                .from("user_agents")
                .insert({
                user_id: userId,
                name,
                description,
                config,
                nodes,
                edges,
                template_id,
                status: "draft",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
                .select()
                .single();
            if (error) {
                logger_1.logger.error("Failed to create agent", { error });
                return res.status(500).json({ error: error.message });
            }
            res.status(201).json(data);
        }
        catch (error) {
            logger_1.logger.error("Error creating agent", { error });
            res.status(500).json({ error: "Failed to create agent" });
        }
    });
    // GET /api/agents/:id - Get specific agent
    app.get("/api/agents/:id", verifyToken, async (req, res) => {
        try {
            const userId = req.user?.id;
            const { id } = req.params;
            const { data, error } = await supabaseClient_1.supabase
                .from("user_agents")
                .select("*")
                .eq("id", id)
                .eq("user_id", userId)
                .single();
            if (error || !data) {
                return res.status(404).json({ error: "Agent not found" });
            }
            res.json(data);
        }
        catch (error) {
            logger_1.logger.error("Error fetching agent", { error });
            res.status(500).json({ error: "Failed to fetch agent" });
        }
    });
    // PUT /api/agents/:id - Update agent
    app.put("/api/agents/:id", verifyToken, async (req, res) => {
        try {
            const userId = req.user?.id;
            const { id } = req.params;
            const { name, description, config, nodes, edges, status } = req.body;
            const { data, error } = await supabaseClient_1.supabase
                .from("user_agents")
                .update({
                name,
                description,
                config,
                nodes,
                edges,
                status,
                updated_at: new Date().toISOString(),
            })
                .eq("id", id)
                .eq("user_id", userId)
                .select()
                .single();
            if (error) {
                logger_1.logger.error("Failed to update agent", { error });
                return res.status(500).json({ error: error.message });
            }
            res.json(data);
        }
        catch (error) {
            logger_1.logger.error("Error updating agent", { error });
            res.status(500).json({ error: "Failed to update agent" });
        }
    });
    // DELETE /api/agents/:id - Delete agent
    app.delete("/api/agents/:id", verifyToken, async (req, res) => {
        try {
            const userId = req.user?.id;
            const { id } = req.params;
            const { error } = await supabaseClient_1.supabase
                .from("user_agents")
                .delete()
                .eq("id", id)
                .eq("user_id", userId);
            if (error) {
                logger_1.logger.error("Failed to delete agent", { error });
                return res.status(500).json({ error: error.message });
            }
            res.json({ message: "Agent deleted successfully" });
        }
        catch (error) {
            logger_1.logger.error("Error deleting agent", { error });
            res.status(500).json({ error: "Failed to delete agent" });
        }
    });
};
exports.setupAgentRoutes = setupAgentRoutes;
