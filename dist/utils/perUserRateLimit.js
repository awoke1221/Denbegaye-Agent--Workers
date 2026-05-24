"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkUserRateLimit = checkUserRateLimit;
exports.perUserRateLimit = perUserRateLimit;
const redisConnection_1 = require("./redisConnection");
const supabaseClient_1 = require("./supabaseClient");
const logger_1 = require("./logger");
const DAILY_WINDOW_SEC = 86400; // 24 hours
const MONTHLY_WINDOW_SEC = 30 * 86400; // ~30 days
const DEFAULT_DAILY_LIMIT = Number(process.env.USER_RATE_LIMIT_DAILY || "1000");
const DEFAULT_MONTHLY_LIMIT = Number(process.env.USER_RATE_LIMIT_MONTHLY || "10000");
let redisClient = null;
try {
    redisClient = (0, redisConnection_1.createRedisConnection)();
    (0, redisConnection_1.attachRedisEventHandlers)(redisClient, "PerUserRateLimit");
}
catch (error) {
    logger_1.logger.warn("Per-user rate limiter: Redis not available, falling back to permissive mode", { error });
    redisClient = null;
}
/**
 * Extract user ID from JWT token in Authorization header
 */
function extractUserIdFromRequest(req) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
            return null;
        }
        const token = authHeader.substring(7);
        // Decode JWT without verification (verification happens in auth middleware)
        const parts = token.split(".");
        if (parts.length !== 3)
            return null;
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
        return payload.sub || null;
    }
    catch (error) {
        logger_1.logger.debug("Failed to extract user ID from token", { error });
        return null;
    }
}
/**
 * Check per-user daily and monthly rate limits
 */
async function checkUserRateLimit(userId) {
    if (!redisClient) {
        return {
            allowed: true,
            dailyCurrent: 0,
            dailyLimit: DEFAULT_DAILY_LIMIT,
            monthlyCurrent: 0,
            monthlyLimit: DEFAULT_MONTHLY_LIMIT,
            dailyResetIn: DAILY_WINDOW_SEC,
            monthlyResetIn: MONTHLY_WINDOW_SEC,
        };
    }
    try {
        const now = Math.floor(Date.now() / 1000);
        const dayStart = Math.floor(now / DAILY_WINDOW_SEC);
        const monthStart = Math.floor(now / MONTHLY_WINDOW_SEC);
        const dailyKey = `rate:user:daily:${userId}:${dayStart}`;
        const monthlyKey = `rate:user:monthly:${userId}:${monthStart}`;
        // Get user-specific limits from subscription (if available)
        let dailyLimit = DEFAULT_DAILY_LIMIT;
        let monthlyLimit = DEFAULT_MONTHLY_LIMIT;
        try {
            const { data: subscription } = await supabaseClient_1.supabase
                .from("user_subscriptions")
                .select("pricing_plans!inner(limits)")
                .eq("user_id", userId)
                .eq("status", "active")
                .single();
            if (subscription?.pricing_plans?.[0]?.limits) {
                const limits = subscription.pricing_plans[0].limits;
                dailyLimit = limits.api_calls_daily || DEFAULT_DAILY_LIMIT;
                monthlyLimit = limits.api_calls_monthly || DEFAULT_MONTHLY_LIMIT;
            }
        }
        catch (err) {
            // Default limits apply
        }
        // Increment and get current counts
        const [dailyCurrent, monthlyCurrent] = await Promise.all([
            redisClient.incr(dailyKey),
            redisClient.incr(monthlyKey),
        ]);
        // Set expiration on first increment
        if (dailyCurrent === 1) {
            await redisClient.expire(dailyKey, DAILY_WINDOW_SEC + 1);
        }
        if (monthlyCurrent === 1) {
            await redisClient.expire(monthlyKey, MONTHLY_WINDOW_SEC + 1);
        }
        // Get TTL for response headers
        const [dailyTtl, monthlyTtl] = await Promise.all([
            redisClient.ttl(dailyKey),
            redisClient.ttl(monthlyKey),
        ]);
        const allowed = dailyCurrent <= dailyLimit && monthlyCurrent <= monthlyLimit;
        return {
            allowed,
            dailyCurrent,
            dailyLimit,
            monthlyCurrent,
            monthlyLimit,
            dailyResetIn: dailyTtl > 0 ? dailyTtl : DAILY_WINDOW_SEC,
            monthlyResetIn: monthlyTtl > 0 ? monthlyTtl : MONTHLY_WINDOW_SEC,
        };
    }
    catch (error) {
        logger_1.logger.error("Error checking user rate limit", { error });
        // On error, allow request but log
        return {
            allowed: true,
            dailyCurrent: 0,
            dailyLimit: DEFAULT_DAILY_LIMIT,
            monthlyCurrent: 0,
            monthlyLimit: DEFAULT_MONTHLY_LIMIT,
            dailyResetIn: DAILY_WINDOW_SEC,
            monthlyResetIn: MONTHLY_WINDOW_SEC,
        };
    }
}
/**
 * Express middleware to enforce per-user rate limits
 */
async function perUserRateLimit(req, res, next) {
    try {
        const userId = extractUserIdFromRequest(req);
        if (!userId) {
            // No user ID means unauthenticated; allow through
            return next();
        }
        const status = await checkUserRateLimit(userId);
        // Set rate limit headers for client awareness
        res.setHeader("X-RateLimit-Daily-Limit", String(status.dailyLimit));
        res.setHeader("X-RateLimit-Daily-Current", String(status.dailyCurrent));
        res.setHeader("X-RateLimit-Daily-Reset", String(Math.floor(Date.now() / 1000) + status.dailyResetIn));
        res.setHeader("X-RateLimit-Monthly-Limit", String(status.monthlyLimit));
        res.setHeader("X-RateLimit-Monthly-Current", String(status.monthlyCurrent));
        res.setHeader("X-RateLimit-Monthly-Reset", String(Math.floor(Date.now() / 1000) + status.monthlyResetIn));
        if (!status.allowed) {
            const resetDaily = Math.floor(Date.now() / 1000) + status.dailyResetIn;
            const resetMonthly = Math.floor(Date.now() / 1000) + status.monthlyResetIn;
            return res.status(429).json({
                error: "User rate limit exceeded",
                daily: {
                    current: status.dailyCurrent,
                    limit: status.dailyLimit,
                    resetAt: new Date(resetDaily * 1000).toISOString(),
                },
                monthly: {
                    current: status.monthlyCurrent,
                    limit: status.monthlyLimit,
                    resetAt: new Date(resetMonthly * 1000).toISOString(),
                },
            });
        }
        return next();
    }
    catch (error) {
        logger_1.logger.error("Per-user rate limit middleware error", { error });
        return next();
    }
}
exports.default = perUserRateLimit;
