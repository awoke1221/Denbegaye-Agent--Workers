"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gmailTriggerNode = void 0;
const zod_1 = require("zod");
const googleapis_1 = require("googleapis");
const gmailTriggerConfigSchema = zod_1.z.object({
    authMethod: zod_1.z.enum(["manual", "google-oauth"]).default("manual"),
    accessToken: zod_1.z.string().optional(),
    refreshToken: zod_1.z.string().optional(),
    clientId: zod_1.z.string().optional(),
    clientSecret: zod_1.z.string().optional(),
    providerToken: zod_1.z.string().optional(),
    userId: zod_1.z.string().default("me"),
    query: zod_1.z.string().default(""),
    maxResults: zod_1.z.number().min(1).max(500).default(50),
    checkInterval: zod_1.z.number().min(1000).default(30000), // 30 seconds minimum
    includeBody: zod_1.z.boolean().default(true),
    markAsRead: zod_1.z.boolean().default(true),
    triggerType: zod_1.z.enum(["polling", "webhook"]).default("polling"),
    webhookUrl: zod_1.z.string().optional(),
    searchFilters: zod_1.z
        .object({
        from: zod_1.z.string().optional(),
        to: zod_1.z.string().optional(),
        subject: zod_1.z.string().optional(),
        hasAttachment: zod_1.z.boolean().optional(),
        labelIds: zod_1.z.array(zod_1.z.string()).optional(),
        excludeLabelIds: zod_1.z.array(zod_1.z.string()).optional(),
        dateAfter: zod_1.z.string().optional(), // ISO date
        dateBefore: zod_1.z.string().optional(), // ISO date
        sizeLarger: zod_1.z.number().optional(), // bytes
        sizeSmaller: zod_1.z.number().optional(), // bytes
    })
        .optional(),
    downloadAttachments: zod_1.z.boolean().default(false),
    attachmentPath: zod_1.z.string().optional(),
    retryOnError: zod_1.z.boolean().default(true),
    maxRetries: zod_1.z.number().min(0).max(10).default(3),
});
function createOAuth2Client(config) {
    if (config.authMethod === "google-oauth") {
        if (!config.providerToken) {
            throw new Error("Provider token required for Google OAuth authentication");
        }
        const oauth2Client = new googleapis_1.google.auth.OAuth2();
        oauth2Client.setCredentials({
            access_token: config.providerToken,
        });
        return oauth2Client;
    }
    if (!config.accessToken || !config.clientId || !config.clientSecret) {
        throw new Error("Access token, client ID, and client secret required for manual authentication");
    }
    const oauth2Client = new googleapis_1.google.auth.OAuth2(config.clientId, config.clientSecret);
    oauth2Client.setCredentials({
        access_token: config.accessToken,
        refresh_token: config.refreshToken,
    });
    return oauth2Client;
}
function parseHeaderValue(headers = [], key) {
    return (headers.find((header) => header.name?.toLowerCase() === key.toLowerCase())
        ?.value ?? undefined);
}
function extractTextBody(payload) {
    if (!payload)
        return "";
    if (payload.mimeType === "text/plain" && payload.body?.data) {
        return Buffer.from(payload.body.data, "base64").toString("utf-8");
    }
    if (payload.mimeType === "text/html" && payload.body?.data) {
        return Buffer.from(payload.body.data, "base64").toString("utf-8");
    }
    if (Array.isArray(payload.parts)) {
        for (const part of payload.parts) {
            const value = extractTextBody(part);
            if (value)
                return value;
        }
    }
    return "";
}
function extractAttachments(message) {
    const parts = message.payload?.parts || [];
    const attachments = [];
    function walkParts(partsList) {
        for (const part of partsList) {
            if (part.filename && part.body && part.body.attachmentId) {
                attachments.push({
                    filename: part.filename,
                    mimeType: part.mimeType,
                    attachmentId: part.body.attachmentId,
                });
            }
            if (Array.isArray(part.parts)) {
                walkParts(part.parts);
            }
        }
    }
    walkParts(parts);
    return attachments;
}
function buildAdvancedQuery(config) {
    const filters = config.searchFilters;
    if (!filters)
        return config.query;
    const queryParts = [];
    if (config.query) {
        queryParts.push(config.query);
    }
    if (filters.from) {
        queryParts.push(`from:${filters.from}`);
    }
    if (filters.to) {
        queryParts.push(`to:${filters.to}`);
    }
    if (filters.subject) {
        queryParts.push(`subject:(${filters.subject})`);
    }
    if (filters.hasAttachment) {
        queryParts.push("has:attachment");
    }
    if (filters.labelIds && filters.labelIds.length > 0) {
        filters.labelIds.forEach((labelId) => {
            queryParts.push(`label:${labelId}`);
        });
    }
    if (filters.excludeLabelIds && filters.excludeLabelIds.length > 0) {
        filters.excludeLabelIds.forEach((labelId) => {
            queryParts.push(`-label:${labelId}`);
        });
    }
    if (filters.dateAfter) {
        const date = new Date(filters.dateAfter);
        queryParts.push(`after:${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`);
    }
    if (filters.dateBefore) {
        const date = new Date(filters.dateBefore);
        queryParts.push(`before:${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`);
    }
    if (filters.sizeLarger) {
        queryParts.push(`larger:${filters.sizeLarger}`);
    }
    if (filters.sizeSmaller) {
        queryParts.push(`smaller:${filters.sizeSmaller}`);
    }
    return queryParts.join(" ");
}
async function downloadAttachment(gmail, userId, messageId, attachmentId, filename, attachmentPath) {
    const attachment = await gmail.users.messages.attachments.get({
        userId,
        messageId,
        id: attachmentId,
    });
    const data = attachment.data.data;
    if (!data) {
        throw new Error(`No data found for attachment ${attachmentId}`);
    }
    const buffer = Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    let filePath = filename;
    if (attachmentPath) {
        const fs = require("fs");
        const path = require("path");
        if (!fs.existsSync(attachmentPath)) {
            fs.mkdirSync(attachmentPath, { recursive: true });
        }
        filePath = path.join(attachmentPath, filename);
        fs.writeFileSync(filePath, buffer);
    }
    return filePath;
}
const gmailTriggerNode = {
    id: "gmail-trigger",
    type: "trigger-gmail",
    name: "Gmail Trigger",
    description: "Trigger workflow execution when new Gmail messages match a query",
    category: "trigger",
    icon: "📨",
    color: "#D14836",
    configSchema: gmailTriggerConfigSchema,
    inputs: [],
    outputs: [
        {
            id: "message",
            label: "Message",
            type: "object",
            description: "Full Gmail message data",
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
            id: "recipients",
            label: "Recipients",
            type: "array",
            description: "Email recipient addresses",
        },
        {
            id: "threadId",
            label: "Thread ID",
            type: "string",
            description: "Gmail thread ID",
        },
        {
            id: "labels",
            label: "Labels",
            type: "array",
            description: "Message label IDs",
        },
        {
            id: "attachments",
            label: "Attachments",
            type: "array",
            description: "Attachment metadata",
        },
    ],
    validation: {
        input: zod_1.z.object({}),
        output: zod_1.z.object({
            message: zod_1.z.any(),
            subject: zod_1.z.string(),
            body: zod_1.z.string(),
            sender: zod_1.z.string(),
            recipients: zod_1.z.array(zod_1.z.string()),
            threadId: zod_1.z.string(),
            labels: zod_1.z.array(zod_1.z.string()),
            attachments: zod_1.z.array(zod_1.z.any()),
        }),
    },
    handler: async (context) => {
        const startTime = Date.now();
        const logs = [];
        try {
            const config = gmailTriggerConfigSchema.parse(context.config);
            const oauth2Client = createOAuth2Client(config);
            const gmail = googleapis_1.google.gmail({ version: "v1", auth: oauth2Client });
            const userId = config.userId || "me";
            logs.push(`Gmail trigger configured with ${config.triggerType} mode`);
            const advancedQuery = buildAdvancedQuery(config);
            logs.push(`Using query: ${advancedQuery}`);
            const createParsedMessage = async (messageId) => {
                const full = await gmail.users.messages.get({
                    userId,
                    id: messageId,
                    format: "full",
                });
                const headers = full.data.payload?.headers || [];
                const subject = parseHeaderValue(headers, "Subject") || "";
                const sender = parseHeaderValue(headers, "From") || "";
                const recipients = [
                    parseHeaderValue(headers, "To") || "",
                    parseHeaderValue(headers, "Cc") || "",
                    parseHeaderValue(headers, "Bcc") || "",
                ]
                    .filter(Boolean)
                    .join(", ")
                    .split(/,\s*/)
                    .filter(Boolean);
                const body = config.includeBody
                    ? extractTextBody(full.data.payload)
                    : "";
                const attachments = extractAttachments(full.data);
                // Download attachments if configured
                if (config.downloadAttachments && attachments.length > 0) {
                    for (const attachment of attachments) {
                        try {
                            const filePath = await downloadAttachment(gmail, userId, messageId, attachment.attachmentId, attachment.filename, config.attachmentPath);
                            attachment.localPath = filePath;
                            logs.push(`Downloaded attachment: ${attachment.filename}`);
                        }
                        catch (error) {
                            logs.push(`Failed to download attachment ${attachment.filename}: ${error}`);
                        }
                    }
                }
                return {
                    message: full.data,
                    subject,
                    body,
                    sender,
                    recipients,
                    threadId: full.data.threadId || "",
                    labels: full.data.labelIds || [],
                    attachments,
                    messageId,
                    timestamp: new Date(parseInt(full.data.internalDate || "0")).toISOString(),
                };
            };
            if (config.triggerType === "webhook") {
                // Webhook-based trigger setup
                if (!config.webhookUrl) {
                    throw new Error("Webhook URL is required for webhook trigger type");
                }
                // Set up Gmail push notifications (requires domain verification in production)
                const watchResponse = await gmail.users.watch({
                    userId,
                    requestBody: {
                        topicName: `projects/${config.webhookUrl.split("/")[3]}/topics/gmail-trigger`,
                        labelIds: config.searchFilters?.labelIds || ["INBOX"],
                        labelFilterAction: "include",
                    },
                });
                logs.push(`Gmail webhook configured with history ID: ${watchResponse.data.historyId}`);
                return {
                    success: true,
                    output: {
                        message: {
                            status: "webhook_configured",
                            query: advancedQuery,
                            webhookUrl: config.webhookUrl,
                            historyId: watchResponse.data.historyId,
                        },
                        subject: "",
                        body: "",
                        sender: "",
                        recipients: [],
                        threadId: "",
                        labels: [],
                        attachments: [],
                    },
                    logs,
                    executionTime: Date.now() - startTime,
                };
            }
            else {
                // Polling-based trigger
                const monitor = new GmailTriggerMonitor(gmail, userId, advancedQuery, config.maxResults, config.checkInterval, config.markAsRead, config.retryOnError, config.maxRetries, logs);
                await monitor.startMonitoring(async (messageData) => {
                    logs.push(`New Gmail event detected: ${messageData.subject}`);
                });
                return {
                    success: true,
                    output: {
                        message: {
                            status: "monitoring",
                            query: advancedQuery,
                            interval: config.checkInterval,
                        },
                        subject: "",
                        body: "",
                        sender: "",
                        recipients: [],
                        threadId: "",
                        labels: [],
                        attachments: [],
                    },
                    logs,
                    executionTime: Date.now() - startTime,
                };
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logs.push(`Gmail trigger failed: ${errorMessage}`);
            return {
                success: false,
                error: errorMessage,
                logs,
                executionTime: Date.now() - startTime,
            };
        }
    },
};
exports.gmailTriggerNode = gmailTriggerNode;
class GmailTriggerMonitor {
    constructor(gmail, userId, query, maxResults, checkInterval, markAsRead, retryOnError, maxRetries, logs) {
        this.knownMessageIds = new Set();
        this.intervalId = null;
        this.retryCount = 0;
        this.gmail = gmail;
        this.userId = userId;
        this.query = query;
        this.maxResults = maxResults;
        this.checkInterval = checkInterval;
        this.markAsRead = markAsRead;
        this.retryOnError = retryOnError;
        this.maxRetries = maxRetries;
        this.logs = logs;
    }
    async startMonitoring(callback) {
        if (this.intervalId) {
            throw new Error("Gmail monitoring already active");
        }
        const poll = async () => {
            try {
                const listResponse = await this.gmail.users.messages.list({
                    userId: this.userId,
                    q: this.query,
                    maxResults: this.maxResults,
                });
                const messages = listResponse.data.messages || [];
                this.retryCount = 0; // Reset retry count on successful poll
                for (const item of messages) {
                    if (!item.id || this.knownMessageIds.has(item.id)) {
                        continue;
                    }
                    this.knownMessageIds.add(item.id);
                    try {
                        const messageData = await this.gmail.users.messages.get({
                            userId: this.userId,
                            id: item.id,
                            format: "full",
                        });
                        await callback(messageData.data);
                        if (this.markAsRead) {
                            await this.gmail.users.messages.modify({
                                userId: this.userId,
                                id: item.id,
                                requestBody: {
                                    removeLabelIds: ["UNREAD"],
                                },
                            });
                        }
                    }
                    catch (messageError) {
                        this.logs.push(`Error processing message ${item.id}: ${messageError}`);
                        // Continue processing other messages
                    }
                }
            }
            catch (error) {
                this.logs.push(`Gmail polling error: ${error}`);
                if (this.retryOnError && this.retryCount < this.maxRetries) {
                    this.retryCount++;
                    this.logs.push(`Retrying in ${this.checkInterval * 2}ms (attempt ${this.retryCount}/${this.maxRetries})`);
                    setTimeout(() => {
                        poll();
                    }, this.checkInterval * 2); // Exponential backoff
                    return;
                }
            }
        };
        await poll();
        this.intervalId = setInterval(poll, this.checkInterval);
    }
    stopMonitoring() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.knownMessageIds.clear();
    }
}
