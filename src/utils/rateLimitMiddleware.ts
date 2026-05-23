import { Request, Response, NextFunction } from "express";
import { supabase } from "./supabaseClient";
import { checkRateLimit, incrementUsage } from "./rateLimiting";
import { logger } from "./logger";

export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.substring(7);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const rateLimit = await checkRateLimit(user.id, "api_calls");

    if (!rateLimit.allowed) {
      return res.status(429).json({
        error: "Rate limit exceeded",
        current: rateLimit.current,
        limit: rateLimit.limit,
        resetTime: rateLimit.resetTime,
      });
    }

    await incrementUsage(user.id, "api_calls", 1);
    (req as any).user = user;
    next();
  } catch (error) {
    logger.error("Rate limit middleware error", {
      error: error instanceof Error ? error.message : String(error),
    });
    next();
  }
}
