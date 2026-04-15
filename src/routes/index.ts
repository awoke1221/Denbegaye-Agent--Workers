import { Express } from "express";
import { agentRunHandler } from "./agentRun";
import { setupAdminRoutes } from "./adminRoutes";

export const setupRoutes = (app: Express) => {
  // Agent execution routes
  app.post("/api/agent-run", agentRunHandler);

  // Administration routes
  setupAdminRoutes(app);
};
