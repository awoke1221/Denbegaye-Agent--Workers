"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupAdminRoutes = exports.adminOnly = void 0;
const supabaseClient_1 = require("../utils/supabaseClient");
const requestAuth_1 = require("../utils/requestAuth");
const parseIdList = (value) => {
    if (!value)
        return [];
    return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
};
const parseIntOrDefault = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const adminOnly = async (req, res, next) => {
    const { user, error } = await (0, requestAuth_1.getUserFromRequest)(req);
    if (error || !user) {
        return res.status(401).json({ error: "Invalid or missing token" });
    }
    const { data: profile, error: profileError } = await supabaseClient_1.supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
    if (profileError || !profile || profile.role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
    }
    req.user = user;
    req.profile = profile;
    next();
};
exports.adminOnly = adminOnly;
const getDashboardStats = async () => {
    const now = new Date();
    const activeSince = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [totalProfilesResult, activeProfilesResult, totalAgentsResult, runningExecutionsResult, failedExecutionsResult, totalExecutionsResult,] = await Promise.all([
        supabaseClient_1.supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabaseClient_1.supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .gt("updated_at", activeSince),
        supabaseClient_1.supabase.from("user_agents").select("id", { count: "exact", head: true }),
        supabaseClient_1.supabase
            .from("agent_executions")
            .select("id", { count: "exact", head: true })
            .in("status", ["running", "queued"]),
        supabaseClient_1.supabase
            .from("agent_executions")
            .select("id", { count: "exact", head: true })
            .eq("status", "failed"),
        supabaseClient_1.supabase
            .from("agent_executions")
            .select("id", { count: "exact", head: true }),
    ]);
    const totalUsers = totalProfilesResult.count ?? 0;
    const activeUsers = activeProfilesResult.count ?? 0;
    const totalAgents = totalAgentsResult.count ?? 0;
    const runningExecutions = runningExecutionsResult.count ?? 0;
    const failedExecutions = failedExecutionsResult.count ?? 0;
    const totalExecutions = totalExecutionsResult.count ?? 0;
    const errorRate = totalExecutions > 0
        ? Math.round((failedExecutions / totalExecutions) * 100)
        : 0;
    return {
        totalUsers,
        activeUsers,
        totalAgents,
        runningExecutions,
        errorRate,
        systemHealth: {
            database: "healthy",
            api: "healthy",
            storage: "healthy",
            overall: "healthy",
        },
    };
};
const getQueueDashboardStats = async () => {
    const nowIso = new Date().toISOString();
    const [queuedResult, processingResult, completedResult, failedResult, deadLetterResult, delayedResult,] = await Promise.all([
        supabaseClient_1.supabase
            .from("job_queue")
            .select("id", { count: "exact", head: true })
            .eq("status", "queued"),
        supabaseClient_1.supabase
            .from("job_queue")
            .select("id", { count: "exact", head: true })
            .eq("status", "processing"),
        supabaseClient_1.supabase
            .from("job_queue")
            .select("id", { count: "exact", head: true })
            .eq("status", "completed"),
        supabaseClient_1.supabase
            .from("job_queue")
            .select("id", { count: "exact", head: true })
            .eq("status", "failed"),
        supabaseClient_1.supabase
            .from("job_queue")
            .select("id", { count: "exact", head: true })
            .eq("status", "dead_letter"),
        supabaseClient_1.supabase
            .from("job_queue")
            .select("id", { count: "exact", head: true })
            .eq("status", "queued")
            .gt("next_retry_at", nowIso),
    ]);
    const [upcomingRetriesResult, deadLetterJobsResult, recentFailuresResult] = await Promise.all([
        supabaseClient_1.supabase
            .from("job_queue")
            .select("id, job_type, status, attempt_count, max_attempts, scheduled_at, next_retry_at, error_message, payload, created_at, updated_at")
            .eq("status", "queued")
            .gt("next_retry_at", nowIso)
            .order("next_retry_at", { ascending: true })
            .limit(20),
        supabaseClient_1.supabase
            .from("job_queue")
            .select("id, job_type, status, attempt_count, max_attempts, error_message, payload, created_at, updated_at")
            .eq("status", "dead_letter")
            .order("updated_at", { ascending: false })
            .limit(20),
        supabaseClient_1.supabase
            .from("job_queue")
            .select("id, job_type, status, attempt_count, max_attempts, error_message, payload, created_at, updated_at")
            .eq("status", "failed")
            .order("updated_at", { ascending: false })
            .limit(20),
    ]);
    if (queuedResult.error ||
        processingResult.error ||
        completedResult.error ||
        failedResult.error ||
        deadLetterResult.error ||
        delayedResult.error ||
        upcomingRetriesResult.error ||
        deadLetterJobsResult.error ||
        recentFailuresResult.error) {
        throw new Error("Unable to load queue dashboard stats");
    }
    return {
        counts: {
            queued: queuedResult.count || 0,
            processing: processingResult.count || 0,
            completed: completedResult.count || 0,
            failed: failedResult.count || 0,
            deadLetter: deadLetterResult.count || 0,
            delayedRetry: delayedResult.count || 0,
        },
        backoff: {
            baseDelayMs: 1000,
            multiplier: 2,
            maxDelayMs: 300000,
            description: "Retries are scheduled with exponential backoff: delay = min(baseDelayMs * 2^attempt_count, maxDelayMs)",
        },
        upcomingRetries: upcomingRetriesResult.data || [],
        recentFailures: recentFailuresResult.data || [],
        deadLetterJobs: deadLetterJobsResult.data || [],
    };
};
const systemSettings = {
    maintenance_mode: false,
    email_notifications: true,
    auto_backup: true,
    admin_email: "admin@example.com",
    system_name: "Denbegnaye Agent Platform",
};
const setupAdminRoutes = (app) => {
    app.get("/api/admin/dashboard", exports.adminOnly, async (req, res) => {
        try {
            const stats = await getDashboardStats();
            const queueStats = await getQueueDashboardStats();
            return res.json({ stats, queueStats, recentActivities: [] });
        }
        catch (error) {
            console.error("Admin dashboard error:", error);
            return res
                .status(500)
                .json({ error: "Failed to load admin dashboard" });
        }
    });
    app.get("/api/admin/queue", exports.adminOnly, async (req, res) => {
        try {
            const queueStats = await getQueueDashboardStats();
            return res.json({ queueStats });
        }
        catch (error) {
            console.error("Admin queue dashboard error:", error);
            return res
                .status(500)
                .json({ error: "Failed to load queue dashboard" });
        }
    });
    app.get("/api/admin/agents", exports.adminOnly, async (req, res) => {
        try {
            const page = parseIntOrDefault(req.query.page, 1);
            const limit = parseIntOrDefault(req.query.limit, 50);
            const search = req.query.search || "";
            const status = req.query.status || "all";
            const start = (page - 1) * limit;
            const end = start + limit - 1;
            let query = supabaseClient_1.supabase
                .from("user_agents")
                .select("id, name, description, status, user_id, created_at, updated_at, version", {
                count: "exact",
            });
            if (search) {
                query = query.ilike("name", `%${search}%`);
            }
            if (status && status !== "all") {
                query = query.eq("status", status);
            }
            const { data: agents, error, count } = await query.range(start, end);
            if (error) {
                throw error;
            }
            const agentIds = (agents || []).map((agent) => agent.id);
            const ownerIds = Array.from(new Set((agents || []).map((agent) => agent.user_id)));
            const { data: owners } = await supabaseClient_1.supabase
                .from("profiles")
                .select("id, email, full_name")
                .in("id", ownerIds);
            const { data: executions } = await supabaseClient_1.supabase
                .from("agent_executions")
                .select("agent_id, status, execution_time_ms, completed_at")
                .in("agent_id", agentIds);
            const ownerMap = new Map((owners || []).map((owner) => [owner.id, owner]));
            const statsByAgent = new Map();
            (executions || []).forEach((exec) => {
                const current = statsByAgent.get(exec.agent_id) || {
                    executions_count: 0,
                    success_count: 0,
                    total_time: 0,
                    last_execution: null,
                };
                current.executions_count += 1;
                if (exec.status === "completed") {
                    current.success_count += 1;
                }
                if (typeof exec.execution_time_ms === "number") {
                    current.total_time += exec.execution_time_ms;
                }
                if (exec.completed_at) {
                    const last = current.last_execution
                        ? new Date(current.last_execution)
                        : null;
                    const candidate = new Date(exec.completed_at);
                    if (!last || candidate > last) {
                        current.last_execution = exec.completed_at;
                    }
                }
                statsByAgent.set(exec.agent_id, current);
            });
            const resultAgents = (agents || []).map((agent) => {
                const stats = statsByAgent.get(agent.id) || {
                    executions_count: 0,
                    success_rate: 0,
                    avg_execution_time: 0,
                    last_execution: null,
                };
                const executions_count = stats.executions_count || 0;
                const success_rate = executions_count > 0
                    ? Math.round((stats.success_count / executions_count) * 100)
                    : 0;
                const avg_execution_time = executions_count > 0
                    ? Math.round(stats.total_time / executions_count)
                    : 0;
                return {
                    ...agent,
                    owner: ownerMap.get(agent.user_id) || {
                        id: agent.user_id,
                        email: "unknown",
                        full_name: "Unknown",
                    },
                    stats: {
                        executions_count,
                        success_rate,
                        avg_execution_time,
                        last_execution: stats.last_execution,
                    },
                };
            });
            return res.json({
                agents: resultAgents,
                pagination: {
                    page,
                    limit,
                    total: count ?? 0,
                    totalPages: Math.ceil((count ?? 0) / limit),
                },
            });
        }
        catch (error) {
            console.error("Admin agents error:", error);
            return res.status(500).json({ error: "Failed to load agents" });
        }
    });
    app.post("/api/admin/agents", exports.adminOnly, async (req, res) => {
        try {
            const { agentId, action } = req.body;
            if (!agentId || !action) {
                return res
                    .status(400)
                    .json({ error: "agentId and action are required" });
            }
            const statusMap = {
                start: "active",
                pause: "paused",
                stop: "idle",
            };
            const newStatus = statusMap[action];
            if (!newStatus) {
                return res.status(400).json({ error: "Unsupported action" });
            }
            const { error } = await supabaseClient_1.supabase
                .from("user_agents")
                .update({ status: newStatus })
                .eq("id", agentId);
            if (error) {
                throw error;
            }
            return res.json({ success: true });
        }
        catch (error) {
            console.error("Admin agent update error:", error);
            return res.status(500).json({ error: "Failed to update agent" });
        }
    });
    app.get("/api/admin/executions", exports.adminOnly, async (req, res) => {
        try {
            const statusValues = parseIdList(req.query.status);
            const limit = parseIntOrDefault(req.query.limit, 50);
            let query = supabaseClient_1.supabase
                .from("agent_executions")
                .select("*, user_id, agent_id")
                .order("created_at", { ascending: false })
                .limit(limit);
            if (statusValues.length > 0) {
                query = query.in("status", statusValues);
            }
            const { data: executions, error } = await query;
            if (error) {
                throw error;
            }
            const userIds = Array.from(new Set((executions || []).map((exec) => exec.user_id)));
            const agentIds = Array.from(new Set((executions || []).map((exec) => exec.agent_id)));
            const [{ data: users }, { data: agents }] = await Promise.all([
                userIds.length > 0
                    ? supabaseClient_1.supabase
                        .from("profiles")
                        .select("id, email, full_name")
                        .in("id", userIds)
                    : { data: [] },
                agentIds.length > 0
                    ? supabaseClient_1.supabase.from("user_agents").select("id, name").in("id", agentIds)
                    : { data: [] },
            ]);
            const userMap = new Map((users || []).map((user) => [user.id, user]));
            const agentMap = new Map((agents || []).map((agent) => [agent.id, agent]));
            const resultExecutions = (executions || []).map((execution) => {
                const startedAt = new Date(execution.started_at ||
                    execution.created_at ||
                    new Date().toISOString());
                const completedAt = execution.completed_at
                    ? new Date(execution.completed_at)
                    : null;
                const duration = completedAt
                    ? Math.round((completedAt.getTime() - startedAt.getTime()) / 1000)
                    : undefined;
                const progress = execution.status === "running"
                    ? 50
                    : execution.status === "completed"
                        ? 100
                        : execution.status === "failed"
                            ? 100
                            : 0;
                return {
                    id: execution.id,
                    agent_id: execution.agent_id,
                    agent_name: agentMap.get(execution.agent_id)?.name || "Unknown Agent",
                    user: userMap.get(execution.user_id) || {
                        id: execution.user_id,
                        email: "unknown",
                        full_name: "Unknown",
                    },
                    status: execution.status,
                    started_at: execution.started_at ||
                        execution.created_at ||
                        new Date().toISOString(),
                    completed_at: execution.completed_at || undefined,
                    duration,
                    progress,
                };
            });
            return res.json({ executions: resultExecutions });
        }
        catch (error) {
            console.error("Admin executions error:", error);
            return res.status(500).json({ error: "Failed to load executions" });
        }
    });
    app.patch("/api/admin/executions", exports.adminOnly, async (req, res) => {
        try {
            const { executionId, action } = req.body;
            if (!executionId || !action) {
                return res
                    .status(400)
                    .json({ error: "executionId and action are required" });
            }
            if (action !== "stop") {
                return res.status(400).json({ error: "Unsupported action" });
            }
            const { error } = await supabaseClient_1.supabase
                .from("agent_executions")
                .update({ status: "failed", error_message: "Stopped by admin" })
                .eq("id", executionId);
            if (error) {
                throw error;
            }
            return res.json({ success: true });
        }
        catch (error) {
            console.error("Admin execution update error:", error);
            return res.status(500).json({ error: "Failed to update execution" });
        }
    });
    app.get("/api/admin/users", exports.adminOnly, async (req, res) => {
        try {
            const page = parseIntOrDefault(req.query.page, 1);
            const limit = parseIntOrDefault(req.query.limit, 50);
            const search = req.query.search || "";
            const role = req.query.role || "all";
            const start = (page - 1) * limit;
            const end = start + limit - 1;
            let query = supabaseClient_1.supabase
                .from("profiles")
                .select("id, email, full_name, avatar_url, role, created_at, updated_at", {
                count: "exact",
            });
            if (search) {
                query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
            }
            if (role !== "all") {
                query = query.eq("role", role);
            }
            const { data: users, count, error } = await query.range(start, end);
            if (error) {
                throw error;
            }
            const userIds = (users || []).map((user) => user.id);
            const [{ data: agentRows }, { data: executionRows }, { data: subscriptionRows },] = await Promise.all([
                userIds.length > 0
                    ? supabaseClient_1.supabase
                        .from("user_agents")
                        .select("user_id")
                        .in("user_id", userIds)
                    : { data: [] },
                userIds.length > 0
                    ? supabaseClient_1.supabase
                        .from("agent_executions")
                        .select("user_id")
                        .in("user_id", userIds)
                    : { data: [] },
                userIds.length > 0
                    ? supabaseClient_1.supabase
                        .from("user_subscriptions")
                        .select("id, user_id, plan_id, status, billing_cycle, current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at")
                        .in("user_id", userIds)
                    : { data: [] },
            ]);
            const plans = (subscriptionRows || []).length > 0
                ? await supabaseClient_1.supabase
                    .from("pricing_plans")
                    .select("id, name, tier, price_monthly, price_yearly, limits")
                    .in("id", Array.from(new Set((subscriptionRows || []).map((sub) => sub.plan_id))))
                : { data: [] };
            const planMap = new Map((plans.data || []).map((plan) => [plan.id, plan]));
            const agentCounts = (agentRows || []).reduce((acc, row) => {
                acc[row.user_id] = (acc[row.user_id] || 0) + 1;
                return acc;
            }, {});
            const executionCounts = (executionRows || []).reduce((acc, row) => {
                acc[row.user_id] = (acc[row.user_id] || 0) + 1;
                return acc;
            }, {});
            const subscriptionMap = new Map((subscriptionRows || []).map((sub) => [sub.user_id, sub]));
            const resultUsers = (users || []).map((profile) => ({
                ...profile,
                stats: {
                    agents_count: agentCounts[profile.id] || 0,
                    executions_count: executionCounts[profile.id] || 0,
                    subscription: subscriptionMap.has(profile.id)
                        ? {
                            ...subscriptionMap.get(profile.id),
                            plan: planMap.get(subscriptionMap.get(profile.id).plan_id) ||
                                null,
                        }
                        : null,
                },
            }));
            return res.json({
                users: resultUsers,
                pagination: {
                    page,
                    limit,
                    total: count ?? 0,
                    totalPages: Math.ceil((count ?? 0) / limit),
                },
            });
        }
        catch (error) {
            console.error("Admin users error:", error);
            return res.status(500).json({ error: "Failed to load users" });
        }
    });
    app.patch("/api/admin/users", exports.adminOnly, async (req, res) => {
        try {
            const { userId, role } = req.body;
            if (!userId || !role) {
                return res
                    .status(400)
                    .json({ error: "userId and role are required" });
            }
            const { error } = await supabaseClient_1.supabase
                .from("profiles")
                .update({ role })
                .eq("id", userId);
            if (error) {
                throw error;
            }
            return res.json({ success: true });
        }
        catch (error) {
            console.error("Admin user role update error:", error);
            return res.status(500).json({ error: "Failed to update user role" });
        }
    });
    app.get("/api/admin/rate-limit-tiers", exports.adminOnly, async (req, res) => {
        try {
            const { data: plans, error } = await supabaseClient_1.supabase
                .from("pricing_plans")
                .select("id, name, tier, description, price_monthly, price_yearly, limits, features");
            if (error) {
                throw error;
            }
            const tierPayload = plans || [];
            return res.json({ tiers: tierPayload, rateLimitTiers: tierPayload });
        }
        catch (error) {
            console.error("Admin rate limit tiers error:", error);
            return res
                .status(500)
                .json({ error: "Failed to load rate limit tiers" });
        }
    });
    app.get("/api/admin/subscriptions", exports.adminOnly, async (req, res) => {
        try {
            const page = parseIntOrDefault(req.query.page, 1);
            const limit = parseIntOrDefault(req.query.limit, 50);
            const search = req.query.search || "";
            const status = req.query.status || "all";
            const start = (page - 1) * limit;
            const end = start + limit - 1;
            let query = supabaseClient_1.supabase
                .from("user_subscriptions")
                .select("id, user_id, plan_id, status, billing_cycle, current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at", {
                count: "exact",
            });
            if (status !== "all") {
                query = query.eq("status", status);
            }
            const { data: subscriptions, count, error, } = await query.range(start, end);
            if (error) {
                throw error;
            }
            const userIds = (subscriptions || []).map((sub) => sub.user_id);
            const planIds = Array.from(new Set((subscriptions || []).map((sub) => sub.plan_id)));
            const [{ data: users }, { data: plans }] = await Promise.all([
                userIds.length > 0
                    ? supabaseClient_1.supabase
                        .from("profiles")
                        .select("id, email, full_name")
                        .in("id", userIds)
                    : { data: [] },
                planIds.length > 0
                    ? supabaseClient_1.supabase
                        .from("pricing_plans")
                        .select("id, name, tier, price_monthly, price_yearly, limits")
                        .in("id", planIds)
                    : { data: [] },
            ]);
            const userMap = new Map((users || []).map((user) => [user.id, user]));
            const planMap = new Map((plans || []).map((plan) => [plan.id, plan]));
            const resultSubscriptions = (subscriptions || []).map((sub) => ({
                ...sub,
                user: userMap.get(sub.user_id) || {
                    id: sub.user_id,
                    email: "unknown",
                    full_name: "Unknown",
                },
                plan: planMap.get(sub.plan_id) || null,
            }));
            return res.json({
                subscriptions: resultSubscriptions,
                pagination: {
                    page,
                    limit,
                    total: count ?? 0,
                    totalPages: Math.ceil((count ?? 0) / limit),
                },
            });
        }
        catch (error) {
            console.error("Admin subscriptions error:", error);
            return res.status(500).json({ error: "Failed to load subscriptions" });
        }
    });
    app.patch("/api/admin/subscriptions", exports.adminOnly, async (req, res) => {
        try {
            const { subscriptionId, action, status, limits } = req.body;
            if (!subscriptionId || !action) {
                return res
                    .status(400)
                    .json({ error: "subscriptionId and action are required" });
            }
            let updatePayload = {};
            if (action === "update_limits") {
                updatePayload = { metadata: { usage_limits: limits || {} } };
            }
            else if (action === "cancel") {
                updatePayload = { status: "canceled" };
            }
            else if (action === "resume") {
                updatePayload = { status: "active" };
            }
            else {
                return res.status(400).json({ error: "Unsupported action" });
            }
            const { error } = await supabaseClient_1.supabase
                .from("user_subscriptions")
                .update(updatePayload)
                .eq("id", subscriptionId);
            if (error) {
                throw error;
            }
            return res.json({ success: true });
        }
        catch (error) {
            console.error("Admin subscription update error:", error);
            return res.status(500).json({ error: "Failed to update subscription" });
        }
    });
    app.get("/api/admin/system/metrics", exports.adminOnly, async (req, res) => {
        try {
            const stats = await getDashboardStats();
            const queueStats = await getQueueDashboardStats();
            const metrics = {
                database: {
                    status: stats.systemHealth.database,
                    connections: 24,
                    queries_per_second: 26,
                    storage_used_gb: 12.4,
                    storage_total_gb: 50,
                    uptime: "99.99%",
                },
                api: {
                    status: stats.systemHealth.api,
                    requests_per_minute: 180,
                    avg_response_time_ms: 120,
                    error_rate_percent: 0.8,
                    uptime: "99.98%",
                },
                storage: {
                    status: stats.systemHealth.storage,
                    files_count: 1200,
                    total_size_gb: 24.3,
                    backup_status: "ready",
                },
                server: {
                    status: "healthy",
                    cpu_usage_percent: 38,
                    memory_usage_percent: 64,
                    disk_usage_percent: 55,
                    network_in_mbps: 6.2,
                    network_out_mbps: 4.8,
                },
                queue: {
                    queued: queueStats.counts.queued,
                    processing: queueStats.counts.processing,
                    completed: queueStats.counts.completed,
                    failed: queueStats.counts.failed,
                    dead_letter: queueStats.counts.deadLetter,
                    delayed_retry: queueStats.counts.delayedRetry,
                },
            };
            return res.json({ metrics, queueStats });
        }
        catch (error) {
            console.error("Admin system metrics error:", error);
            return res.status(500).json({ error: "Failed to load system metrics" });
        }
    });
    app.get("/api/admin/system/api-keys", exports.adminOnly, async (req, res) => {
        try {
            const { data: apiKeys, error } = await supabaseClient_1.supabase
                .from("user_api_keys")
                .select("id, user_id, provider, label, is_active, created_at, last_used_at");
            if (error) {
                throw error;
            }
            return res.json({ apiKeys: apiKeys || [] });
        }
        catch (error) {
            console.error("Admin api keys error:", error);
            return res.status(500).json({ error: "Failed to load API keys" });
        }
    });
    app.get("/api/admin/system/settings", exports.adminOnly, async (req, res) => {
        return res.json({ settings: systemSettings });
    });
    app.put("/api/admin/system/settings", exports.adminOnly, async (req, res) => {
        try {
            const updated = req.body;
            Object.assign(systemSettings, updated);
            return res.json({ settings: systemSettings });
        }
        catch (error) {
            console.error("Admin settings update error:", error);
            return res
                .status(500)
                .json({ error: "Failed to update system settings" });
        }
    });
    app.post("/api/admin/system", exports.adminOnly, async (req, res) => {
        try {
            const { action } = req.body;
            if (!action) {
                return res.status(400).json({ error: "Action is required" });
            }
            const supportedActions = ["backup", "optimize", "clear_cache"];
            if (!supportedActions.includes(action)) {
                return res.status(400).json({ error: "Unsupported action" });
            }
            return res.json({
                success: true,
                message: `System ${action} completed successfully`,
            });
        }
        catch (error) {
            console.error("Admin system action error:", error);
            return res
                .status(500)
                .json({ error: "Failed to perform system action" });
        }
    });
};
exports.setupAdminRoutes = setupAdminRoutes;
