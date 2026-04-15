import { z } from "zod";
import {
  NodeDefinition,
  NodeExecutionContext,
  NodeExecutionResult,
  nodeRegistry,
} from "../index";
import express from "express";

// Webhook Trigger Node
const webhookConfigSchema = z.object({
  path: z.string().min(1).default("/webhook"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
  secret: z.string().optional(),
  validateSignature: z.boolean().default(false),
  timeout: z.number().min(1000).max(300000).default(30000), // 30 seconds
});

const webhookNode: NodeDefinition = {
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
    input: z.object({}), // No inputs for triggers
    output: z.object({
      payload: z.record(z.any()),
      headers: z.record(z.string()),
      query: z.record(z.string()),
      method: z.string(),
    }),
  },

  handler: async (
    context: NodeExecutionContext,
  ): Promise<NodeExecutionResult> => {
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      const config = webhookConfigSchema.parse(context.config);

      logs.push(
        `Webhook trigger configured for ${config.method} ${config.path}`,
      );

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
    } catch (error) {
      logs.push(
        `Error configuring webhook trigger: ${error instanceof Error ? error.message : String(error)}`,
      );

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        logs,
        executionTime: Date.now() - startTime,
      };
    }
  },
};

// Webhook handler utility
export class WebhookHandler {
  private app: express.Application;
  private endpoints = new Map<
    string,
    {
      config: z.infer<typeof webhookConfigSchema>;
      callback: (data: any) => Promise<void>;
    }
  >();

  constructor(app: express.Application) {
    this.app = app;
  }

  registerWebhook(
    path: string,
    config: z.infer<typeof webhookConfigSchema>,
    callback: (data: any) => Promise<void>,
  ): void {
    this.endpoints.set(path, { config, callback });

    // Register the actual HTTP endpoint
    const method = config.method.toLowerCase() as keyof express.Application;
    (this.app as any)[method](
      path,
      async (req: express.Request, res: express.Response) => {
        try {
          // Validate signature if enabled
          if (config.validateSignature && config.secret) {
            const signature = req.headers["x-signature"] as string;
            if (!signature) {
              return res.status(401).json({ error: "Missing signature" });
            }

            // Basic signature validation (implement proper HMAC validation)
            const expectedSignature = this.generateSignature(
              JSON.stringify(req.body),
              config.secret,
            );
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
        } catch (error) {
          console.error("Webhook execution error:", error);
          res.status(500).json({ error: "Internal server error" });
        }
      },
    );
  }

  private generateSignature(payload: string, secret: string): string {
    // Implement proper HMAC-SHA256 signature generation
    const crypto = require("crypto");
    return crypto.createHmac("sha256", secret).update(payload).digest("hex");
  }
}

export { webhookNode };
