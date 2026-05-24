"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserLimits = getUserLimits;
exports.checkRateLimit = checkRateLimit;
exports.incrementUsage = incrementUsage;
exports.getUserUsage = getUserUsage;
const supabaseClient_1 = require("./supabaseClient");
/**
 * Get the rate limits for a user based on their subscription tier
 */
async function getUserLimits(userId) {
    try {
        // Get user's subscription
        const { data: subscription, error: subError } = await supabaseClient_1.supabase
            .from("user_subscriptions")
            .select("pricing_plans!inner(limits)")
            .eq("user_id", userId)
            .eq("status", "active")
            .single();
        if (subError || !subscription) {
            // Default to free tier limits
            return {
                agents: 1,
                executions: 100,
                api_calls: 1000,
                storage_mb: 100,
            };
        }
        return (subscription.pricing_plans?.[0]?.limits || {
            agents: 1,
            executions: 100,
            api_calls: 1000,
            storage_mb: 100,
        });
    }
    catch (error) {
        console.error("Error getting user limits:", error);
        // Default to free tier limits
        return {
            agents: 1,
            executions: 100,
            api_calls: 1000,
            storage_mb: 100,
        };
    }
}
/**
 * Check if a user has exceeded their rate limit for a specific metric
 */
async function checkRateLimit(userId, metricType) {
    try {
        const limits = await getUserLimits(userId);
        const metricKeyMap = {
            agent_creations: "agents",
            executions: "executions",
            api_calls: "api_calls",
            storage_mb: "storage_mb",
        };
        const metricKey = metricKeyMap[metricType];
        const limit = limits[metricKey] ?? 0;
        // Get current usage for this month
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        const { data: usage, error } = await supabaseClient_1.supabase
            .from("usage_tracking")
            .select("count")
            .eq("user_id", userId)
            .eq("metric_type", metricType)
            .gte("period_start", startOfMonth.toISOString())
            .lte("period_end", endOfMonth.toISOString())
            .single();
        const currentCount = usage?.count || 0;
        return {
            allowed: currentCount < limit,
            current: currentCount,
            limit,
            resetTime: endOfMonth,
        };
    }
    catch (error) {
        console.error("Error checking rate limit:", error);
        // Allow by default if there's an error
        return {
            allowed: true,
            current: 0,
            limit: 1000,
            resetTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        };
    }
}
/**
 * Increment usage count for a specific metric
 */
async function incrementUsage(userId, metricType, incrementBy = 1) {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        // Try to update existing record
        const { data: existing, error: selectError } = await supabaseClient_1.supabase
            .from("usage_tracking")
            .select("id, count")
            .eq("user_id", userId)
            .eq("metric_type", metricType)
            .gte("period_start", startOfMonth.toISOString())
            .lte("period_end", endOfMonth.toISOString())
            .single();
        if (existing) {
            // Update existing record
            const { error: updateError } = await supabaseClient_1.supabase
                .from("usage_tracking")
                .update({ count: existing.count + incrementBy })
                .eq("id", existing.id);
            if (updateError)
                throw updateError;
        }
        else {
            // Create new record
            const { error: insertError } = await supabaseClient_1.supabase
                .from("usage_tracking")
                .insert({
                user_id: userId,
                metric_type: metricType,
                count: incrementBy,
                period_start: startOfMonth.toISOString(),
                period_end: endOfMonth.toISOString(),
            });
            if (insertError)
                throw insertError;
        }
    }
    catch (error) {
        console.error("Error incrementing usage:", error);
        // Don't throw error to avoid breaking user flow
    }
}
/**
 * Get usage statistics for a user
 */
async function getUserUsage(userId) {
    try {
        const limits = await getUserLimits(userId);
        // Get current usage for this month
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        const { data: usage, error } = await supabaseClient_1.supabase
            .from("usage_tracking")
            .select("metric_type, count")
            .eq("user_id", userId)
            .gte("period_start", startOfMonth.toISOString())
            .lte("period_end", endOfMonth.toISOString());
        const usageMap = {};
        usage?.forEach((u) => {
            usageMap[u.metric_type] = u.count;
        });
        const result = {};
        Object.entries(limits).forEach(([key, limit]) => {
            const metricType = key + "s"; // agents, executions, api_calls, storage_mb
            const current = usageMap[metricType] || 0;
            result[key] = {
                current,
                limit,
                percentage: limit > 0 ? Math.min((current / limit) * 100, 100) : 0,
            };
        });
        return result;
    }
    catch (error) {
        console.error("Error getting user usage:", error);
        return {};
    }
}
