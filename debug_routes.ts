import express from "express";
import { setupRoutes } from "./src/routes/index.ts";
const app = express();
setupRoutes(app);
const routes = app._router.stack.filter((layer: any) => layer.route).map((layer: any) => ({ path: layer.route.path, methods: layer.route.methods }));
console.log(JSON.stringify(routes, null, 2));
