"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailNode = exports.EmailMonitor = void 0;
const zod_1 = require("zod");
// Email Trigger Node
const emailTriggerConfigSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
    host: zod_1.z.string().default("imap.gmail.com"),
    port: zod_1.z.number().default(993),
    tls: zod_1.z.boolean().default(true),
    checkInterval: zod_1.z.number().min(1000).max(3600000).default(30000), // 30 seconds
    markAsRead: zod_1.z.boolean().default(true),
    deleteAfterProcessing: zod_1.z.boolean().default(false),
});
const emailTriggerNode = {
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
        input: zod_1.z.object({}), // No inputs for triggers
        output: zod_1.z.object({
            email: zod_1.z.object({
                id: zod_1.z.string(),
                subject: zod_1.z.string(),
                body: zod_1.z.string(),
                sender: zod_1.z.string(),
                recipients: zod_1.z.array(zod_1.z.string()),
                timestamp: zod_1.z.string(),
            }),
            subject: zod_1.z.string(),
            body: zod_1.z.string(),
            sender: zod_1.z.string(),
            attachments: zod_1.z.array(zod_1.z.object({
                filename: zod_1.z.string(),
                contentType: zod_1.z.string(),
                size: zod_1.z.number(),
            })),
        }),
    },
    handler: async (context) => {
        const startTime = Date.now();
        const logs = [];
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
        }
        catch (error) {
            logs.push(`Error configuring email trigger: ${error instanceof Error ? error.message : String(error)}`);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                logs,
                executionTime: Date.now() - startTime,
            };
        }
    },
};
exports.emailNode = emailTriggerNode;
// Email Monitor utility
class EmailMonitor {
    constructor() {
        this.isMonitoring = false;
        this.callbacks = new Map();
        // We'll use a proper IMAP library in production
        // For now, this is a placeholder
    }
    async startMonitoring(config, callback) {
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
                }
                catch (error) {
                    console.error("Error checking emails:", error);
                }
            }, config.checkInterval);
            // Store interval for cleanup
            this.interval = interval;
        }
        catch (error) {
            this.isMonitoring = false;
            throw error;
        }
    }
    stopMonitoring() {
        this.isMonitoring = false;
        if (this.interval) {
            clearInterval(this.interval);
        }
        this.callbacks.clear();
    }
    async checkForNewEmails(config) {
        // Placeholder - implement actual IMAP fetching
        return [];
    }
    async markAsRead(emailId, config) {
        // Placeholder - implement actual IMAP operations
    }
    async deleteEmail(emailId, config) {
        // Placeholder - implement actual IMAP operations
    }
}
exports.EmailMonitor = EmailMonitor;
