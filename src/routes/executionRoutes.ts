import { Express, Request, Response, NextFunction } from "express";
import { supabase } from "../utils/supabaseClient";
import { logger } from "../utils/logger";
import { emitSocketEvent } from "../utils/socket";

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

export const setupExecutionRoutes = (app: Express) => {
  // GET /api/executions - List executions for user
  app.get(
    "/api/executions",
    verifyToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user?.id;
        const { agent_id, status, limit = 50, offset = 0 } = req.query;

        let query = supabase
          .from("agent_executions")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .range(
            Number(offset) || 0,
            (Number(offset) || 0) + (Number(limit) || 50) - 1,
          );

        if (agent_id) {
          query = query.eq("agent_id", agent_id);
        }

        if (status) {
          const statuses = String(status).split(",");
          query = query.in("status", statuses);
        }

        const { data, error, count } = await query;

        if (error) {
          logger.error("Failed to fetch executions", { error });
          return res.status(500).json({ error: error.message });
        }

        res.json({
          executions: data || [],
          total: count || 0,
          limit: Number(limit),
          offset: Number(offset),
        });
      } catch (error) {
        logger.error("Error fetching executions", { error });
        res.status(500).json({ error: "Failed to fetch executions" });
      }
    },
  );

  // GET /api/executions/:id - Get execution details
  app.get(
    "/api/executions/:id",
    verifyToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user?.id;
        const { id } = req.params;

        const { data, error } = await supabase
          .from("agent_executions")
          .select("*")
          .eq("id", id)
          .eq("user_id", userId)
          .single();

        if (error || !data) {
          return res.status(404).json({ error: "Execution not found" });
        }

        res.json(data);
      } catch (error) {
        logger.error("Error fetching execution", { error });
        res.status(500).json({ error: "Failed to fetch execution" });
      }
    },
  );

  // GET /api/executions/:id/logs - Get execution logs
  app.get(
    "/api/executions/:id/logs",
    verifyToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user?.id;
        const { id } = req.params;

        // Verify execution belongs to user
        const { data: execution, error: execError } = await supabase
          .from("agent_executions")
          .select("id")
          .eq("id", id)
          .eq("user_id", userId)
          .single();

        if (execError || !execution) {
          return res.status(404).json({ error: "Execution not found" });
        }

        // Get execution logs
        const { data: logs, error } = await supabase
          .from("execution_logs")
          .select("*")
          .eq("execution_id", id)
          .order("created_at", { ascending: true });

        if (error) {
          logger.error("Failed to fetch execution logs", { error });
          return res.status(500).json({ error: error.message });
        }

        res.json({ logs: logs || [] });
      } catch (error) {
        logger.error("Error fetching execution logs", { error });
        res.status(500).json({ error: "Failed to fetch execution logs" });
      }
    },
  );

  // POST /api/executions/:id/cancel - Cancel execution
  app.post(
    "/api/executions/:id/cancel",
    verifyToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user?.id;
        const { id } = req.params;

        const { data, error } = await supabase
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
          logger.error("Failed to cancel execution", { error });
          return res.status(500).json({ error: error.message });
        }

        res.json({ message: "Execution cancelled", execution: data });
      } catch (error) {
        logger.error("Error cancelling execution", { error });
        res.status(500).json({ error: "Failed to cancel execution" });
      }
    },
  );

  // DELETE /api/executions/:id - Delete execution record
  app.delete(
    "/api/executions/:id",
    verifyToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user?.id;
        const { id } = req.params;

        const { error } = await supabase
          .from("agent_executions")
          .delete()
          .eq("id", id)
          .eq("user_id", userId);

        if (error) {
          logger.error("Failed to delete execution", { error });
          return res.status(500).json({ error: error.message });
        }

        res.json({ message: "Execution deleted successfully" });
      } catch (error) {
        logger.error("Error deleting execution", { error });
        res.status(500).json({ error: "Failed to delete execution" });
      }
    },
  );

  // POST /api/executions/:id/approve - Approve human pause
  app.post(
    "/api/executions/:id/approve",
    verifyToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const userId = req.user?.id;
        const { id } = req.params;
        const { response, userId: respondingUserId } = req.body;

        // Validate response
        if (
          !response ||
          typeof response !== "string" ||
          response.trim() === ""
        ) {
          return res.status(400).json({ error: "response is required" });
        }

        // Fetch execution
        const { data: execution, error: fetchError } = await supabase
          .from("agent_executions")
          .select("user_id, status, metadata")
          .eq("id", id)
          .single();

        if (fetchError || !execution) {
          return res.status(404).json({ error: "Execution not found" });
        }

        // Check authorization
        if (execution.user_id !== userId) {
          return res
            .status(403)
            .json({ error: "not authorized to approve this execution" });
        }

        // Check status
        if (execution.status !== "awaiting_approval") {
          return res.status(409).json({
            error: `this execution is not currently awaiting approval - current status: ${execution.status}`,
          });
        }

        // Update execution with approval
        const currentMetadata = execution.metadata || {};
        const updatedMetadata = {
          ...currentMetadata,
          humanResponse: response,
          respondedBy: respondingUserId,
          respondedAt: new Date().toISOString(),
          approvedAt: new Date().toISOString(),
        };

        const { error: updateError } = await supabase
          .from("agent_executions")
          .update({
            status: "running",
            metadata: updatedMetadata,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);

        if (updateError) {
          logger.error("Failed to update execution with approval", {
            error: updateError,
          });
          return res
            .status(500)
            .json({
              error: `Failed to approve execution: ${updateError.message}`,
            });
        }

        // Emit socket event
        try {
          emitSocketEvent("execution-approved", {
            executionId: id,
            response,
            respondedBy: respondingUserId,
          });
        } catch (socketError) {
          logger.error("Failed to emit execution-approved socket event", {
            error: socketError,
          });
          // Continue even if socket emit fails
        }

        res.json({
          success: true,
          response,
          executionId: id,
        });
      } catch (error) {
        logger.error("Error approving execution", { error });
        res.status(500).json({ error: "Failed to approve execution" });
      }
    },
  );
};
