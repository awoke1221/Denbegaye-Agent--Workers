"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookNode = exports.WebhookHandler = void 0;
const zod_1 = require("zod");
// Webhook Trigger Node
const webhookConfigSchema = zod_1.z.object({
    path: zod_1.z.string().min(1).default("/webhook"),
    method: zod_1.z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
    secret: zod_1.z.string().optional(),
    validateSignature: zod_1.z.boolean().default(false),
    timeout: zod_1.z.number().min(1000).max(300000).default(30000), // 30 seconds
});
const webhookNode = {
    id: "webhook-trigger",
    type: "trigger-webhook",
    name: "Webhook Trigger",
    description: "Triggers workflow execution via HTTP webhook calls",
    category: "trigger",
    icon: "🔗",
    color: "#FF6B6B",
    configSchema: webhookConfigSchema,
    inputs: [], // Trigger nodes don't have inputs
    outputs: [
        {
            id: "payload",
            label: "Request Payload",
            type: "object",
            description: "The webhook request payload",
        },
        {
            id: "headers",
            label: "Request Headers",
            type: "object",
            description: "HTTP request headers",
        },
        {
            id: "query",
            label: "Query Parameters",
            type: "object",
            description: "URL query parameters",
        },
        {
            id: "method",
            label: "HTTP Method",
            type: "string",
            description: "The HTTP method used",
        },
    ],
    validation: {
        input: zod_1.z.object({}), // No inputs for triggers
        output: zod_1.z.object({
            payload: zod_1.z.record(zod_1.z.any()),
            headers: zod_1.z.record(zod_1.z.string()),
            query: zod_1.z.record(zod_1.z.string()),
            method: zod_1.z.string(),
        }),
    },
    handler: async (context) => {
        const startTime = Date.now();
        const logs = [];
        try {
            const config = webhookConfigSchema.parse(context.config);
            logs.push(`Webhook trigger configured for ${config.method} ${config.path}`);
            // This is a trigger node - it doesn't execute immediately
            // Instead, it sets up an endpoint that can be called later
            // The actual execution happens when the webhook is called
            return {
                success: true,
                output: {
                    message: `Webhook endpoint configured: ${config.method} ${config.path}`,
                    config,
                },
                logs,
                executionTime: Date.now() - startTime,
            };
        }
        catch (error) {
            logs.push(`Error configuring webhook trigger: ${error instanceof Error ? error.message : String(error)}`);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                logs,
                executionTime: Date.now() - startTime,
            };
        }
    },
};
exports.webhookNode = webhookNode;
// Webhook handler utility
class WebhookHandler {
    constructor(app) {
        this.endpoints = new Map();
        this.app = app;
    }
    registerWebhook(path, config, callback) {
        this.endpoints.set(path, { config, callback });
        // Register the actual HTTP endpoint
        const method = config.method.toLowerCase();
        this.app[method](path, async (req, res) => {
            try {
                // Validate signature if enabled
                if (config.validateSignature && config.secret) {
                    const signature = req.headers["x-signature"];
                    if (!signature) {
                        return res.status(401).json({ error: "Missing signature" });
                    }
                    // Basic signature validation (implement proper HMAC validation)
                    const expectedSignature = this.generateSignature(JSON.stringify(req.body), config.secret);
                    if (signature !== expectedSignature) {
                        return res.status(401).json({ error: "Invalid signature" });
                    }
                }
                const webhookData = {
                    payload: req.body,
                    headers: req.headers,
                    query: req.query,
                    method: req.method,
                    timestamp: new Date().toISOString(),
                };
                // Execute the workflow
                await callback(webhookData);
                res.status(200).json({ status: "success" });
            }
            catch (error) {
                console.error("Webhook execution error:", error);
                res.status(500).json({ error: "Internal server error" });
            }
        });
    }
    generateSignature(payload, secret) {
        // Implement proper HMAC-SHA256 signature generation
        const crypto = require("crypto");
        return crypto.createHmac("sha256", secret).update(payload).digest("hex");
    }
}
exports.WebhookHandler = WebhookHandler;
