import { Express } from "express";
import { Server as SocketIOServer } from "socket.io";
import { agentRunHandler } from "./agentRun";
import { setupAdminRoutes } from "./adminRoutes";
import { setupBlogAdminRoutes } from "./blogAdminRoutes";
import { setupTemplateRoutes } from "./templateRoutes";
import { setupBlogRoutes } from "./blogRoutes";
import {
  createLangGraphRoutes,
  setupLangGraphWebSocket,
} from "./langgraphRoutes";

export const setupRoutes = (app: Express, io?: SocketIOServer) => {
  // Agent execution routes
  app.post("/api/agent-run", agentRunHandler);

  // Blog content routes
  setupBlogRoutes(app);

  // LangGraph execution routes (if IO is available)
  if (io) {
    app.use("/api/langgraph", createLangGraphRoutes(io));
    setupLangGraphWebSocket(io);
  }

  // Administration routes
  setupAdminRoutes(app);
  setupBlogAdminRoutes(app);

  // Template management routes
  setupTemplateRoutes(app);
};
