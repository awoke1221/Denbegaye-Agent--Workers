/**
 * Advanced LangGraph Agent Execution Routes
 * RESTful and WebSocket endpoints for LangGraph-based agent execution
 */

import { Router, Request, Response } from "express";
import { Server as SocketIOServer } from "socket.io";
import { supabase } from "../utils/supabaseClient";
import {
  validateAgentGraph,
  normalizeAgentEdges,
  AgentEdgeInput,
} from "../utils/validation";
import { AgentEdge, AgentNode } from "../jobs/types";
import { logger } from "../utils/logger";
import { checkRateLimit, incrementUsage } from "../utils/rateLimiting";
import {
  executeWorkflowWithStreaming,
  streamingExecutionEngine,
  createStreamingContext,
} from "../utils/streamingExecutionEngine";
import { createWorkflowBuilder } from "../utils/langgraphWorkflowBuilder";
import { StreamEvent } from "../utils/langgraphState";
import { getBufferedSocketEvents } from "../utils/socket";

export function createLangGraphRoutes(io: SocketIOServer): Router {
  const router = Router();

  /**
   * POST /langgraph/execute
   * Execute agent workflow with LangGraph
   */
  router.post("/execute", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const token = authHeader.substring(7);
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(token);

      if (authError || !user) {
        return res.status(401).json({ error: "Invalid token" });
      }

      const rateCheck = await checkRateLimit(user.id, "api_calls");
      if (!rateCheck.allowed) {
        return res.status(429).json({
          error: "Rate limit exceeded",
          current: rateCheck.current,
          limit: rateCheck.limit,
          resetTime: rateCheck.resetTime,
        });
      }

      await incrementUsage(user.id, "api_calls", 1);

      const {
        agentId,
        nodes,
        edges,
        input,
        apiKeys,
        agentName,
        enableStreaming = true,
      } = req.body;

      // Validate workflow graph
      const graphValidation = validateAgentGraph(
        nodes as AgentNode[],
        edges as Array<AgentEdge | AgentEdgeInput>,
      );

      if (!graphValidation.valid) {
        return res.status(400).json({
          error: "Invalid workflow graph",
          details: graphValidation.errors,
        });
      }

      // Generate execution ID
      const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create workflow config
      const workflowConfig = {
        workflowId: agentId || `workflow_${Date.now()}`,
        executionId,
        userId: user.id,
        nodes: nodes.map((n: any) => ({
          id: n.id,
          type: n.type,
          config: n.data?.config || n.config || {},
          label: n.label || n.data?.label,
          description: n.data?.description,
        })),
        edges: normalizeAgentEdges(edges).map((e: any) => ({
          source: e.source,
          target: e.target,
          condition: e.condition,
        })),
        apiKeys: apiKeys || {},
        variables: input || {},
        maxRetries: 2,
        enableStreaming,
      };

      logger.debug("LangGraph execution started", {
        executionId,
        nodeCount: nodes.length,
      });

      // Execute with streaming
      const result = await executeWorkflowWithStreaming(
        workflowConfig,
        input || {},
        (event) => {
          // Broadcast to connected clients
          io.emit(`execution:${executionId}`, event);
        },
      );

      return res.json({
        success: true,
        executionId,
        ...result,
      });
    } catch (error) {
      logger.error("LangGraph execution error", {
        error: (error as Error).message,
      });

      return res.status(500).json({
        error: "Execution failed",
        details: (error as Error).message,
      });
    }
  });

  /**
   * GET /langgraph/status/:executionId
   * Get execution status
   */
  router.get("/status/:executionId", (req: Request, res: Response) => {
    let { executionId } = req.params;
    executionId = Array.isArray(executionId) ? executionId[0] : executionId;
    const isExecuting = streamingExecutionEngine.isExecuting(executionId);

    return res.json({
      executionId,
      isExecuting,
      activeExecutions: streamingExecutionEngine.getActiveExecutions(),
    });
  });

  /**
   * POST /langgraph/cancel/:executionId
   * Cancel execution
   */
  router.post("/cancel/:executionId", (req: Request, res: Response) => {
    let { executionId } = req.params;
    executionId = Array.isArray(executionId) ? executionId[0] : executionId;

    try {
      streamingExecutionEngine.cancel(executionId);
      logger.debug("Execution cancelled", { executionId });

      return res.json({
        success: true,
        message: "Execution cancelled",
      });
    } catch (error) {
      return res.status(500).json({
        error: "Failed to cancel execution",
      });
    }
  });

  /**
   * GET /langgraph/active-executions
   * Get all active executions
   */
  router.get("/active-executions", (req: Request, res: Response) => {
    const activeExecutions = streamingExecutionEngine.getActiveExecutions();

    return res.json({
      count: activeExecutions.length,
      executions: activeExecutions,
    });
  });

  /**
   * POST /langgraph/validate
   * Validate workflow configuration
   */
  router.post("/validate", (req: Request, res: Response) => {
    try {
      const { nodes, edges } = req.body;

      const validation = validateAgentGraph(
        nodes as AgentNode[],
        edges as Array<AgentEdge | AgentEdgeInput>,
      );

      return res.json({
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
      });
    } catch (error) {
      return res.status(400).json({
        error: "Validation failed",
        details: (error as Error).message,
      });
    }
  });

  return router;
}

/**
 * WebSocket handler for streaming execution
 */
export function setupLangGraphWebSocket(io: SocketIOServer): void {
  io.on("connection", (socket) => {
    logger.debug("WebSocket client connected", { socketId: socket.id });

    const activeSocketSubscriptions = new Map<string, () => void>();

    const cleanupSubscription = (executionId: string) => {
      const unsubscribe = activeSocketSubscriptions.get(executionId);
      if (unsubscribe) {
        unsubscribe();
        activeSocketSubscriptions.delete(executionId);
        socket.leave(`execution:${executionId}`);
        logger.debug("Client unsubscribed from execution", {
          socketId: socket.id,
          executionId,
        });
      }
    };

    const cleanupAllSubscriptions = () => {
      for (const executionId of activeSocketSubscriptions.keys()) {
        cleanupSubscription(executionId);
      }
    };

    /**
     * Subscribe to execution stream
     */
    socket.on("subscribe:execution", (executionId: string) => {
      logger.debug("Client subscribed to execution", {
        socketId: socket.id,
        executionId,
      });

      cleanupSubscription(executionId);
      const room = `execution:${executionId}`;
      socket.join(room);

      const bufferedEvents = getBufferedSocketEvents(room);
      if (bufferedEvents.length > 0) {
        console.log(
          "[buffer] replaying",
          bufferedEvents.length,
          "events for",
          executionId,
        );
        logger.debug(
          `[buffer] replaying ${bufferedEvents.length} events for ${executionId}`,
        );
        bufferedEvents.forEach(({ event, data }) => socket.emit(event, data));
      }

      const streamContext = createStreamingContext(executionId);
      const unsubscribe = streamContext.subscribe((event: StreamEvent) => {
        socket.emit("execution:update", event);
      });

      activeSocketSubscriptions.set(executionId, unsubscribe);
    });

    socket.on("unsubscribe:execution", (executionId: string) => {
      cleanupSubscription(executionId);
    });

    /**
     * Cancel execution
     */
    socket.on("cancel:execution", (executionId: string) => {
      logger.debug("Execution cancellation requested", {
        socketId: socket.id,
        executionId,
      });

      streamingExecutionEngine.cancel(executionId);
      socket.emit("execution:cancelled", { executionId });
    });

    /**
     * Get execution status
     */
    socket.on("get:execution-status", (executionId: string) => {
      const isExecuting = streamingExecutionEngine.isExecuting(executionId);

      socket.emit("execution:status", {
        executionId,
        isExecuting,
      });
    });

    socket.on("disconnect", () => {
      cleanupAllSubscriptions();
      logger.debug("WebSocket client disconnected", { socketId: socket.id });
    });
  });
}
