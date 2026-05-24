"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalRateLimit = globalRateLimit;
const redisConnection_1 = require("./redisConnection");
const logger_1 = require("./logger");
const WINDOW_SEC = Number(process.env.RATE_LIMIT_WINDOW_SECONDS || "60");
const IP_LIMIT = Number(process.env.RATE_LIMIT_IP_PER_MIN || "60");
const SKIP_PATHS = ["/health", "/metrics", "/health/advanced", "/favicon.ico"];
let redisClient = null;
try {
    redisClient = (0, redisConnection_1.createRedisConnection)();
    (0, redisConnection_1.attachRedisEventHandlers)(redisClient, "GlobalRateLimit");
}
catch (error) {
    logger_1.logger.warn("Global rate limiter: Redis not available, falling back to permissive mode", { error });
    redisClient = null;
}
async function globalRateLimit(req, res, next) {
    try {
        // Skip OPTIONS and known safe endpoints
        if (req.method === "OPTIONS")
            return next();
        const path = req.path || req.url || "";
        for (const p of SKIP_PATHS) {
            if (path === p || path.startsWith(p))
                return next();
        }
        // If Redis is not available, allow request but log occasionally
        if (!redisClient) {
            if (Math.random() < 0.001)
                logger_1.logger.warn("Global rate limiter: Redis missing, allowing request");
            return next();
        }
        const ip = (req.ip ||
            req.headers["x-forwarded-for"] ||
            req.socket.remoteAddress ||
            "unknown");
        const windowId = Math.floor(Date.now() / 1000 / WINDOW_SEC);
        const key = `rate:ip:${ip}:${windowId}`;
        const current = await redisClient.incr(key);
        if (current === 1) {
            await redisClient.expire(key, WINDOW_SEC + 1);
        }
        if (current > IP_LIMIT) {
            const ttl = await redisClient.ttl(key);
            res.setHeader("Retry-After", String(ttl || WINDOW_SEC));
            return res
                .status(429)
                .json({
                error: "Rate limit exceeded",
                limit: IP_LIMIT,
                windowSec: WINDOW_SEC,
            });
        }
        return next();
    }
    catch (error) {
        logger_1.logger.error("Global rate limiter error", { error });
        return next();
    }
}
exports.default = globalRateLimit;
