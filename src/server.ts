import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "http";
import { Server } from "socket.io";
import Redis from "ioredis";
import { initializeQueue } from "./index";
import { logger } from "./utils/logger";
import { emitSocketEvent } from "./utils/socket";
import { setupRoutes } from "./routes";
import { WebhookHandler } from "./nodes/triggers/webhook";
import { workflowMonitoring } from "./utils/workflowMonitoring";
import { globalRateLimit } from "./utils/globalRateLimit";
import { perUserRateLimit } from "./utils/perUserRateLimit";
import {
  SERVICE_ROLE,
  INSTANCE_ID,
  REDIS_URL,
  FRONTEND_URL,
  PORT,
  NODE_ENV,
} from "./config";
import "./telemetry";

// Extend global interface
declare global {
  var io: Server | undefined;
  var webhookHandler: WebhookHandler;
}

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  },
});

const socketAdapterReady = async () => {
  if (!REDIS_URL) {
    logger.info(
      "Socket.IO Redis adapter disabled because REDIS_URL is not configured",
    );
    return;
  }

  try {
    const pubClient = createClient({ url: REDIS_URL });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    logger.info(
      "Socket.IO Redis adapter enabled for multi-instance event synchronization",
      {
        instanceId: INSTANCE_ID,
      },
    );
  } catch (error) {
    logger.warn("Failed to initialize Socket.IO Redis adapter", { error });
  }
};
void socketAdapterReady();

const EXECUTION_EVENTS_CHANNEL = "agent_execution_events";
const redisSubscriber = REDIS_URL ? new Redis(REDIS_URL) : null;

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
// Global IP-based rate limiter (Redis-backed). Skips health/metrics endpoints.
app.use(globalRateLimit);
// Per-user rate limiter (daily/monthly quotas). Extracts user ID from JWT.
app.use(perUserRateLimit);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    role: SERVICE_ROLE,
    instanceId: INSTANCE_ID,
  });
});

// Prometheus metrics endpoint (exposes prom-client registry)
import { metricsRegistry, metricsContentType } from "./telemetry";
app.get("/metrics", async (req, res) => {
  try {
    const metrics = await metricsRegistry.metrics();
    res.set("Content-Type", metricsContentType);
    res.send(metrics);
  } catch (error) {
    res.status(500).send("Failed to collect metrics");
  }
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
  logger.info(`Service role: ${SERVICE_ROLE}, instance: ${INSTANCE_ID}`);
  logger.info(`Advanced workflow monitoring enabled`);
  logger.info(
    `Environment: ${NODE_ENV}, log level: ${process.env.LOG_LEVEL ?? "info"}`,
  );
});

export default app;
