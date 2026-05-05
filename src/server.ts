import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import { initializeQueue } from "./index";
import { logger } from "./utils/logger";
import { setupRoutes } from "./routes";
import { WebhookHandler } from "./nodes/triggers/webhook";

// Extend global interface
declare global {
  var io: Server | undefined;
  var webhookHandler: WebhookHandler;
}

// Load environment variables
dotenv.config({ path: ".env.local" });

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  },
});
const PORT = process.env.PORT || 3001;

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

// Setup API routes
setupRoutes(app);

// Initialize queue worker
initializeQueue();

// Socket.IO connection handling
io.on("connection", (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  socket.on("disconnect", () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Make io and webhookHandler available globally for emitting events
global.io = io;
global.webhookHandler = webhookHandler;

server.listen(PORT, () => {
  logger.info(`Workers server running on port ${PORT}`);
});

export default app;
