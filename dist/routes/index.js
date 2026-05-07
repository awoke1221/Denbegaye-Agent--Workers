"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupRoutes = void 0;
const agentRun_1 = require("./agentRun");
const adminRoutes_1 = require("./adminRoutes");
const templateRoutes_1 = require("./templateRoutes");
const langgraphRoutes_1 = require("./langgraphRoutes");
const setupRoutes = (app, io) => {
    // Agent execution routes
    app.post("/api/agent-run", agentRun_1.agentRunHandler);
    // LangGraph execution routes (if IO is available)
    if (io) {
        app.use("/api/langgraph", (0, langgraphRoutes_1.createLangGraphRoutes)(io));
        (0, langgraphRoutes_1.setupLangGraphWebSocket)(io);
    }
    // Administration routes
    (0, adminRoutes_1.setupAdminRoutes)(app);
    // Template management routes
    (0, templateRoutes_1.setupTemplateRoutes)(app);
};
exports.setupRoutes = setupRoutes;
