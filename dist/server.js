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
const index_1 = require("./index");
const logger_1 = require("./utils/logger");
const routes_1 = require("./routes");
const webhook_1 = require("./nodes/triggers/webhook");
// Load environment variables
dotenv_1.default.config({ path: ".env.local" });
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
    },
});
const PORT = process.env.PORT || 3001;
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
// Setup API routes
(0, routes_1.setupRoutes)(app);
// Initialize queue worker
(0, index_1.initializeQueue)();
// Socket.IO connection handling
io.on("connection", (socket) => {
    logger_1.logger.info(`Client connected: ${socket.id}`);
    socket.on("disconnect", () => {
        logger_1.logger.info(`Client disconnected: ${socket.id}`);
    });
});
// Make io and webhookHandler available globally for emitting events
global.io = io;
global.webhookHandler = webhookHandler;
server.listen(PORT, () => {
    logger_1.logger.info(`Workers server running on port ${PORT}`);
});
exports.default = app;
