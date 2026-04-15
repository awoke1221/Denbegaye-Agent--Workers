import { z } from "zod";
import {
  NodeDefinition,
  NodeExecutionContext,
  NodeExecutionResult,
  nodeRegistry,
} from "../index";
import nodemailer from "nodemailer";

// Email Trigger Node
const emailTriggerConfigSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  host: z.string().default("imap.gmail.com"),
  port: z.number().default(993),
  tls: z.boolean().default(true),
  checkInterval: z.number().min(1000).max(3600000).default(30000), // 30 seconds
  markAsRead: z.boolean().default(true),
  deleteAfterProcessing: z.boolean().default(false),
});

const emailTriggerNode: NodeDefinition = {
  id: "email-trigger",
  type: "trigger-email",
  name: "Email Trigger",
  description: "Triggers workflow execution when new emails are received",
  category: "trigger",
  icon: "📧",
  color: "#EA4335",

  configSchema: emailTriggerConfigSchema,

  inputs: [], // Trigger nodes don't have inputs

  outputs: [
    {
      id: "email",
      label: "Email Data",
      type: "object",
      description: "The received email data",
    },
    {
      id: "subject",
      label: "Subject",
      type: "string",
      description: "Email subject line",
    },
    {
      id: "body",
      label: "Body",
      type: "string",
      description: "Email body content",
    },
    {
      id: "sender",
      label: "Sender",
      type: "string",
      description: "Email sender address",
    },
    {
      id: "attachments",
      label: "Attachments",
      type: "array",
      description: "Email attachments",
    },
  ],

  validation: {
    input: z.object({}), // No inputs for triggers
    output: z.object({
      email: z.object({
        id: z.string(),
        subject: z.string(),
        body: z.string(),
        sender: z.string(),
        recipients: z.array(z.string()),
        timestamp: z.string(),
      }),
      subject: z.string(),
      body: z.string(),
      sender: z.string(),
      attachments: z.array(
        z.object({
          filename: z.string(),
          contentType: z.string(),
          size: z.number(),
        }),
      ),
    }),
  },

  handler: async (
    context: NodeExecutionContext,
  ): Promise<NodeExecutionResult> => {
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      const config = emailTriggerConfigSchema.parse(context.config);

      logs.push(`Email trigger configured for ${config.email}`);

      // This is a trigger node - it sets up email monitoring
      // The actual execution happens when new emails are received

      return {
        success: true,
        output: {
          message: `Email monitoring configured for ${config.email}`,
          config,
        },
        logs,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      logs.push(
        `Error configuring email trigger: ${error instanceof Error ? error.message : String(error)}`,
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

// Email Monitor utility
export class EmailMonitor {
  private imap: any;
  private isMonitoring = false;
  private callbacks = new Map<string, (email: any) => Promise<void>>();

  constructor() {
    // We'll use a proper IMAP library in production
    // For now, this is a placeholder
  }

  async startMonitoring(
    config: z.infer<typeof emailTriggerConfigSchema>,
    callback: (email: any) => Promise<void>,
  ): Promise<void> {
    if (this.isMonitoring) {
      throw new Error("Email monitoring already active");
    }

    try {
      // In a real implementation, you'd use a library like 'imap-simple'
      // to connect to the IMAP server and monitor for new emails

      this.isMonitoring = true;
      const monitorId = `monitor_${Date.now()}`;

      this.callbacks.set(monitorId, callback);

      // Placeholder for actual IMAP connection logic
      console.log(`Starting email monitoring for ${config.email}`);

      // Set up periodic checking (in production, use IMAP IDLE)
      const interval = setInterval(async () => {
        try {
          // Check for new emails
          const newEmails = await this.checkForNewEmails(config);

          for (const email of newEmails) {
            await callback(email);

            // Mark as read if configured
            if (config.markAsRead) {
              await this.markAsRead(email.id, config);
            }

            // Delete if configured
            if (config.deleteAfterProcessing) {
              await this.deleteEmail(email.id, config);
            }
          }
        } catch (error) {
          console.error("Error checking emails:", error);
        }
      }, config.checkInterval);

      // Store interval for cleanup
      (this as any).interval = interval;
    } catch (error) {
      this.isMonitoring = false;
      throw error;
    }
  }

  stopMonitoring(): void {
    this.isMonitoring = false;
    if ((this as any).interval) {
      clearInterval((this as any).interval);
    }
    this.callbacks.clear();
  }

  private async checkForNewEmails(
    config: z.infer<typeof emailTriggerConfigSchema>,
  ): Promise<any[]> {
    // Placeholder - implement actual IMAP fetching
    return [];
  }

  private async markAsRead(
    emailId: string,
    config: z.infer<typeof emailTriggerConfigSchema>,
  ): Promise<void> {
    // Placeholder - implement actual IMAP operations
  }

  private async deleteEmail(
    emailId: string,
    config: z.infer<typeof emailTriggerConfigSchema>,
  ): Promise<void> {
    // Placeholder - implement actual IMAP operations
  }
}

export { emailTriggerNode as emailNode };
