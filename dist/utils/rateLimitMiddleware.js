"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimitMiddleware = rateLimitMiddleware;
const supabaseClient_1 = require("./supabaseClient");
const rateLimiting_1 = require("./rateLimiting");
const logger_1 = require("./logger");
async function rateLimitMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const token = authHeader.substring(7);
        const { data: { user }, error, } = await supabaseClient_1.supabase.auth.getUser(token);
        if (error || !user) {
            return res.status(401).json({ error: "Invalid token" });
        }
        const rateLimit = await (0, rateLimiting_1.checkRateLimit)(user.id, "api_calls");
        if (!rateLimit.allowed) {
            return res.status(429).json({
                error: "Rate limit exceeded",
                current: rateLimit.current,
                limit: rateLimit.limit,
                resetTime: rateLimit.resetTime,
            });
        }
        await (0, rateLimiting_1.incrementUsage)(user.id, "api_calls", 1);
        req.user = user;
        next();
    }
    catch (error) {
        logger_1.logger.error("Rate limit middleware error", {
            error: error instanceof Error ? error.message : String(error),
        });
        next();
    }
}
