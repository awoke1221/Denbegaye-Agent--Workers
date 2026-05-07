import { Express } from "express";
import { Server as SocketIOServer } from "socket.io";
import { agentRunHandler } from "./agentRun";
import { setupAdminRoutes } from "./adminRoutes";
import { setupTemplateRoutes } from "./templateRoutes";
import {
  createLangGraphRoutes,
  setupLangGraphWebSocket,
} from "./langgraphRoutes";

export const setupRoutes = (app: Express, io?: SocketIOServer) => {
  // Agent execution routes
  app.post("/api/agent-run", agentRunHandler);

  // LangGraph execution routes (if IO is available)
  if (io) {
    app.use("/api/langgraph", createLangGraphRoutes(io));
    setupLangGraphWebSocket(io);
  }

  // Administration routes
  setupAdminRoutes(app);

  // Template management routes
  setupTemplateRoutes(app);
};
