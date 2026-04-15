"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupRoutes = void 0;
const agentRun_1 = require("./agentRun");
const adminRoutes_1 = require("./adminRoutes");
const setupRoutes = (app) => {
    // Agent execution routes
    app.post("/api/agent-run", agentRun_1.agentRunHandler);
    // Administration routes
    (0, adminRoutes_1.setupAdminRoutes)(app);
};
exports.setupRoutes = setupRoutes;
