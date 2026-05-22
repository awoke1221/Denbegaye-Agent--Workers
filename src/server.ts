import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import Redis from "ioredis";
import { initializeQueue } from "./index";
import { logger } from "./utils/logger";
import { emitSocketEvent } from "./utils/socket";
import { setupRoutes } from "./routes";
import { WebhookHandler } from "./nodes/triggers/webhook";
import { workflowMonitoring } from "./utils/workflowMonitoring";

// Extend global interface
declare global {
  var io: Server | undefined;
  var webhookHandler: WebhookHandler;
}

// Load environment variables
const envPath = process.env.NODE_ENV === "production" ? ".env" : ".env.local";
dotenv.config({ path: envPath });

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  },
});
const PORT = process.env.PORT || 3001;

const EXECUTION_EVENTS_CHANNEL = "agent_execution_events";
const redisSubscriber = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL)
  : null;

if (redisSubscriber) {
  redisSubscriber.on("ready", () => {
    logger.info("Redis subscriber connected for execution events");
  });
  redisSubscriber.on("error", (error) => {
    logger.error("Redis subscriber error", { error });
  });
  redisSubscriber
    .subscribe(EXECUTION_EVENTS_CHANNEL)
    .then(() => {
      logger.info(`Subscribed to Redis channel ${EXECUTION_EVENTS_CHANNEL}`);
    })
    .catch((error) => {
      logger.error("Failed to subscribe to Redis execution event channel", {
        error,
      });
    });

  redisSubscriber.on("message", (channel, message) => {
    if (channel !== EXECUTION_EVENTS_CHANNEL) return;
    try {
      const payload = JSON.parse(message);
      if (payload?.executionId) {
        emitSocketEvent(
          "execution:update",
          payload,
          `execution:${payload.executionId}`,
        );
      }
    } catch (error) {
      logger.error("Failed to parse execution event payload", {
        error,
        message,
      });
    }
  });
}

// Initialize webhook handler
const webhookHandler = new WebhookHandler(app);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Advanced health check endpoint with monitoring metrics
app.get("/health/advanced", async (req, res) => {
  try {
    const metrics = await workflowMonitoring.getHealthMetrics(1); // Last hour
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      metrics,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// Make io and webhookHandler available globally for emitting events
globalThis.io = io;
globalThis.webhookHandler = webhookHandler;

// Setup API routes
setupRoutes(app, io);

// Initialize queue worker
initializeQueue().catch((error) => {
  logger.error("Queue initialization failed", {
    error: error instanceof Error ? error.message : String(error),
  });
});

// Initialize workflow monitoring system
workflowMonitoring.startMonitoring(60000); // Check every minute

// Graceful shutdown handling
process.on("SIGINT", () => {
  logger.info("Received SIGINT, shutting down gracefully...");
  workflowMonitoring.stopMonitoring();
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM, shutting down gracefully...");
  workflowMonitoring.stopMonitoring();
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});

// Socket.IO connection handling
io.on("connection", (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  socket.on("disconnect", () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  logger.info(`Workers server running on port ${PORT}`);
  logger.info(`Advanced workflow monitoring enabled`);
  logger.info(
    `Environment: ${process.env.NODE_ENV ?? "development"}, log level: ${process.env.LOG_LEVEL ?? "info"}`,
  );
});

export default app;
