"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const ioredis_1 = __importDefault(require("ioredis"));
const index_1 = require("./index");
const logger_1 = require("./utils/logger");
const socket_1 = require("./utils/socket");
const routes_1 = require("./routes");
const webhook_1 = require("./nodes/triggers/webhook");
const workflowMonitoring_1 = require("./utils/workflowMonitoring");
// Load environment variables
dotenv_1.default.config({ path: ".env.local" });
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    },
});
const PORT = process.env.PORT || 3001;
const EXECUTION_EVENTS_CHANNEL = "agent_execution_events";
const redisSubscriber = process.env.REDIS_URL
    ? new ioredis_1.default(process.env.REDIS_URL)
    : null;
if (redisSubscriber) {
    redisSubscriber.on("ready", () => {
        logger_1.logger.info("Redis subscriber connected for execution events");
    });
    redisSubscriber.on("error", (error) => {
        logger_1.logger.error("Redis subscriber error", { error });
    });
    redisSubscriber
        .subscribe(EXECUTION_EVENTS_CHANNEL)
        .then(() => {
        logger_1.logger.info(`Subscribed to Redis channel ${EXECUTION_EVENTS_CHANNEL}`);
    })
        .catch((error) => {
        logger_1.logger.error("Failed to subscribe to Redis execution event channel", {
            error,
        });
    });
    redisSubscriber.on("message", (channel, message) => {
        if (channel !== EXECUTION_EVENTS_CHANNEL)
            return;
        try {
            const payload = JSON.parse(message);
            if (payload?.executionId) {
                (0, socket_1.emitSocketEvent)("execution:update", payload, `execution:${payload.executionId}`);
            }
        }
        catch (error) {
            logger_1.logger.error("Failed to parse execution event payload", {
                error,
                message,
            });
        }
    });
}
// Initialize webhook handler
const webhookHandler = new webhook_1.WebhookHandler(app);
// Middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: "10mb" }));
app.use(express_1.default.urlencoded({ extended: true }));
// Health check endpoint
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
// Advanced health check endpoint with monitoring metrics
app.get("/health/advanced", async (req, res) => {
    try {
        const metrics = await workflowMonitoring_1.workflowMonitoring.getHealthMetrics(1); // Last hour
        res.json({
            status: "ok",
            timestamp: new Date().toISOString(),
            metrics,
        });
    }
    catch (error) {
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
(0, routes_1.setupRoutes)(app, io);
// Initialize queue worker
(0, index_1.initializeQueue)().catch((error) => {
    logger_1.logger.error("Queue initialization failed", {
        error: error instanceof Error ? error.message : String(error),
    });
});
// Initialize workflow monitoring system
workflowMonitoring_1.workflowMonitoring.startMonitoring(60000); // Check every minute
// Graceful shutdown handling
process.on("SIGINT", () => {
    logger_1.logger.info("Received SIGINT, shutting down gracefully...");
    workflowMonitoring_1.workflowMonitoring.stopMonitoring();
    server.close(() => {
        logger_1.logger.info("Server closed");
        process.exit(0);
    });
});
process.on("SIGTERM", () => {
    logger_1.logger.info("Received SIGTERM, shutting down gracefully...");
    workflowMonitoring_1.workflowMonitoring.stopMonitoring();
    server.close(() => {
        logger_1.logger.info("Server closed");
        process.exit(0);
    });
});
// Socket.IO connection handling
io.on("connection", (socket) => {
    logger_1.logger.info(`Client connected: ${socket.id}`);
    socket.on("disconnect", () => {
        logger_1.logger.info(`Client disconnected: ${socket.id}`);
    });
});
server.listen(PORT, () => {
    logger_1.logger.info(`Workers server running on port ${PORT}`);
    logger_1.logger.info(`Advanced workflow monitoring enabled`);
});
exports.default = app;
