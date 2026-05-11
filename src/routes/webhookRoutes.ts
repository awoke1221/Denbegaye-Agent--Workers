import { Express, Request, Response, NextFunction } from "express";
import { supabase } from "../utils/supabaseClient";
import { logger } from "../utils/logger";
import crypto from "crypto";

interface AuthRequest extends Request {
  user?: any;
}

// Middleware to verify JWT token
const verifyToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
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

  req.user = user;
  next();
};

export const setupWebhookRoutes = (app: Express) => {
  // GET /api/webhooks - List all webhooks
  app.get(
    "/api/webhooks",
    verifyToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user?.id;
        const { is_active, limit = 50, offset = 0 } = req.query;

        let query = supabase
          .from("webhookTriggers")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .range(
            Number(offset) || 0,
            (Number(offset) || 0) + (Number(limit) || 50) - 1,
          );

        if (is_active !== undefined) {
          query = query.eq("is_active", is_active === "true");
        }

        const { data, error, count } = await query;

        if (error) {
          logger.error("Failed to fetch webhooks", { error });
          return res.status(500).json({ error: error.message });
        }

        res.json({
          webhooks: data || [],
          total: count || 0,
          limit: Number(limit),
          offset: Number(offset),
        });
      } catch (error) {
        logger.error("Error fetching webhooks", { error });
        res.status(500).json({ error: "Failed to fetch webhooks" });
      }
    },
  );

  // POST /api/webhooks - Create webhook
  app.post(
    "/api/webhooks",
    verifyToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user?.id;
        const { name, url, event_type, agent_id, headers, is_active } =
          req.body;

        if (!name || !url || !event_type) {
          return res.status(400).json({ error: "Missing required fields" });
        }

        // Validate URL
        try {
          new URL(url);
        } catch {
          return res.status(400).json({ error: "Invalid URL" });
        }

        const secret = crypto.randomBytes(32).toString("hex");

        const { data, error } = await supabase
          .from("webhookTriggers")
          .insert({
            user_id: userId,
            name,
            url,
            event_type,
            agent_id,
            headers: headers || {},
            secret,
            is_active: is_active !== false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) {
          logger.error("Failed to create webhook", { error });
          return res.status(500).json({ error: error.message });
        }

        res.status(201).json(data);
      } catch (error) {
        logger.error("Error creating webhook", { error });
        res.status(500).json({ error: "Failed to create webhook" });
      }
    },
  );

  // GET /api/webhooks/:id - Get webhook details
  app.get(
    "/api/webhooks/:id",
    verifyToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user?.id;
        const { id } = req.params;

        const { data, error } = await supabase
          .from("webhookTriggers")
          .select("*")
          .eq("id", id)
          .eq("user_id", userId)
          .single();

        if (error || !data) {
          return res.status(404).json({ error: "Webhook not found" });
        }

        res.json(data);
      } catch (error) {
        logger.error("Error fetching webhook", { error });
        res.status(500).json({ error: "Failed to fetch webhook" });
      }
    },
  );

  // PUT /api/webhooks/:id - Update webhook
  app.put(
    "/api/webhooks/:id",
    verifyToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user?.id;
        const { id } = req.params;
        const { name, url, event_type, agent_id, headers, is_active } =
          req.body;

        if (url) {
          try {
            new URL(url);
          } catch {
            return res.status(400).json({ error: "Invalid URL" });
          }
        }

        const { data, error } = await supabase
          .from("webhookTriggers")
          .update({
            name,
            url,
            event_type,
            agent_id,
            headers: headers || {},
            is_active,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("user_id", userId)
          .select()
          .single();

        if (error) {
          logger.error("Failed to update webhook", { error });
          return res.status(500).json({ error: error.message });
        }

        res.json(data);
      } catch (error) {
        logger.error("Error updating webhook", { error });
        res.status(500).json({ error: "Failed to update webhook" });
      }
    },
  );

  // DELETE /api/webhooks/:id - Delete webhook
  app.delete(
    "/api/webhooks/:id",
    verifyToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user?.id;
        const { id } = req.params;

        const { error } = await supabase
          .from("webhookTriggers")
          .delete()
          .eq("id", id)
          .eq("user_id", userId);

        if (error) {
          logger.error("Failed to delete webhook", { error });
          return res.status(500).json({ error: error.message });
        }

        res.json({ message: "Webhook deleted successfully" });
      } catch (error) {
        logger.error("Error deleting webhook", { error });
        res.status(500).json({ error: "Failed to delete webhook" });
      }
    },
  );

  // POST /api/webhooks/:id/test - Test webhook
  app.post(
    "/api/webhooks/:id/test",
    verifyToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user?.id;
        const { id } = req.params;

        const { data: webhook, error: getError } = await supabase
          .from("webhookTriggers")
          .select("*")
          .eq("id", id)
          .eq("user_id", userId)
          .single();

        if (getError || !webhook) {
          return res.status(404).json({ error: "Webhook not found" });
        }

        // Send test payload
        const testPayload = {
          event: "test",
          timestamp: new Date().toISOString(),
          data: { test: true },
        };

        try {
          const response = await fetch(webhook.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...webhook.headers,
            },
            body: JSON.stringify(testPayload),
          });

          res.json({
            success: response.ok,
            status: response.status,
            message: response.ok
              ? "Webhook test successful"
              : "Webhook test failed",
          });
        } catch (fetchError) {
          res.json({
            success: false,
            error:
              fetchError instanceof Error
                ? fetchError.message
                : "Failed to reach webhook",
          });
        }
      } catch (error) {
        logger.error("Error testing webhook", { error });
        res.status(500).json({ error: "Failed to test webhook" });
      }
    },
  );

  // GET /api/webhooks/:id/events - Get webhook events
  app.get(
    "/api/webhooks/:id/events",
    verifyToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user?.id;
        const { id } = req.params;
        const { limit = 50, offset = 0 } = req.query;

        // Verify webhook belongs to user
        const { data: webhook, error: getError } = await supabase
          .from("webhookTriggers")
          .select("id")
          .eq("id", id)
          .eq("user_id", userId)
          .single();

        if (getError || !webhook) {
          return res.status(404).json({ error: "Webhook not found" });
        }

        const { data: events, error } = await supabase
          .from("webhookEvents")
          .select("*")
          .eq("webhook_id", id)
          .order("created_at", { ascending: false })
          .range(
            Number(offset) || 0,
            (Number(offset) || 0) + (Number(limit) || 50) - 1,
          );

        if (error) {
          logger.error("Failed to fetch webhook events", { error });
          return res.status(500).json({ error: error.message });
        }

        res.json({ events: events || [] });
      } catch (error) {
        logger.error("Error fetching webhook events", { error });
        res.status(500).json({ error: "Failed to fetch webhook events" });
      }
    },
  );
};
