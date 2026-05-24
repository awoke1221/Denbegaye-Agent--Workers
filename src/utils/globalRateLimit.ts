import { Request, Response, NextFunction } from "express";
import {
  createRedisConnection,
  attachRedisEventHandlers,
} from "./redisConnection";
import { logger } from "./logger";

const WINDOW_SEC = Number(process.env.RATE_LIMIT_WINDOW_SECONDS || "60");
const IP_LIMIT = Number(process.env.RATE_LIMIT_IP_PER_MIN || "60");
const SKIP_PATHS = ["/health", "/metrics", "/health/advanced", "/favicon.ico"];

let redisClient: any = null;
try {
  redisClient = createRedisConnection();
  attachRedisEventHandlers(redisClient, "GlobalRateLimit");
} catch (error) {
  logger.warn(
    "Global rate limiter: Redis not available, falling back to permissive mode",
    { error },
  );
  redisClient = null;
}

export async function globalRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    // Skip OPTIONS and known safe endpoints
    if (req.method === "OPTIONS") return next();
    const path = req.path || req.url || "";
    for (const p of SKIP_PATHS) {
      if (path === p || path.startsWith(p)) return next();
    }

    // If Redis is not available, allow request but log occasionally
    if (!redisClient) {
      if (Math.random() < 0.001)
        logger.warn("Global rate limiter: Redis missing, allowing request");
      return next();
    }

    const ip = (req.ip ||
      req.headers["x-forwarded-for"] ||
      req.socket.remoteAddress ||
      "unknown") as string;
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
  } catch (error) {
    logger.error("Global rate limiter error", { error });
    return next();
  }
}

export default globalRateLimit;
