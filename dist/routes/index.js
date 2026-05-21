"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupRoutes = void 0;
const agentRun_1 = require("./agentRun");
const adminRoutes_1 = require("./adminRoutes");
const blogAdminRoutes_1 = require("./blogAdminRoutes");
const templateRoutes_1 = require("./templateRoutes");
const blogRoutes_1 = require("./blogRoutes");
const langgraphRoutes_1 = require("./langgraphRoutes");
const setupRoutes = (app, io) => {
    // Agent execution routes
    app.post("/api/agent-run", agentRun_1.agentRunHandler);
    // Blog content routes
    (0, blogRoutes_1.setupBlogRoutes)(app);
    // LangGraph execution routes (if IO is available)
    if (io) {
        app.use("/api/langgraph", (0, langgraphRoutes_1.createLangGraphRoutes)(io));
        (0, langgraphRoutes_1.setupLangGraphWebSocket)(io);
    }
    // Administration routes
    (0, adminRoutes_1.setupAdminRoutes)(app);
    (0, blogAdminRoutes_1.setupBlogAdminRoutes)(app);
    // Template management routes
    (0, templateRoutes_1.setupTemplateRoutes)(app);
};
exports.setupRoutes = setupRoutes;
