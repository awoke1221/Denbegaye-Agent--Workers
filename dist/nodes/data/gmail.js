"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.gmailNode = void 0;
const zod_1 = require("zod");
const googleapis_1 = require("googleapis");
const axios_1 = __importDefault(require("axios"));
const gmailConfigSchema = zod_1.z.object({
    authMethod: zod_1.z.enum(["manual", "google-oauth"]).default("manual"),
    accessToken: zod_1.z.string().optional(),
    refreshToken: zod_1.z.string().optional(),
    clientId: zod_1.z.string().optional(),
    clientSecret: zod_1.z.string().optional(),
    providerToken: zod_1.z.string().optional(),
    userId: zod_1.z.string().default("me"),
    defaultFrom: zod_1.z.string().optional(),
});
const gmailInputSchema = zod_1.z.object({
    action: zod_1.z.enum([
        "send",
        "reply",
        "search",
        "get",
        "copy",
        "move",
        "updateLabels",
        "markAsRead",
        "markAsUnread",
        "delete",
        "createDraft",
        "sendDraft",
        "listAttachments",
        "downloadAttachment",
        "batchSend",
        "batchDelete",
        "batchLabel",
        "createLabel",
        "deleteLabel",
        "getThread",
        "replyToThread",
        "forward",
        "createFilter",
        "apiCall",
    ]),
    to: zod_1.z.union([zod_1.z.string(), zod_1.z.array(zod_1.z.string())]).optional(),
    cc: zod_1.z.union([zod_1.z.string(), zod_1.z.array(zod_1.z.string())]).optional(),
    bcc: zod_1.z.union([zod_1.z.string(), zod_1.z.array(zod_1.z.string())]).optional(),
    subject: zod_1.z.string().optional(),
    body: zod_1.z.string().optional(),
    htmlBody: zod_1.z.string().optional(),
    templateId: zod_1.z.string().optional(),
    templateVariables: zod_1.z.record(zod_1.z.string()).optional(),
    threadId: zod_1.z.string().optional(),
    messageId: zod_1.z.union([zod_1.z.string(), zod_1.z.array(zod_1.z.string())]).optional(),
    query: zod_1.z.string().optional(),
    labelIds: zod_1.z.union([zod_1.z.array(zod_1.z.string()), zod_1.z.string()]).optional(),
    addLabelIds: zod_1.z.union([zod_1.z.array(zod_1.z.string()), zod_1.z.string()]).optional(),
    removeLabelIds: zod_1.z.union([zod_1.z.array(zod_1.z.string()), zod_1.z.string()]).optional(),
    draftId: zod_1.z.string().optional(),
    attachments: zod_1.z
        .union([
        zod_1.z.array(zod_1.z.object({
            filename: zod_1.z.string(),
            mimeType: zod_1.z.string().default("application/octet-stream"),
            content: zod_1.z.union([zod_1.z.string(), zod_1.z.instanceof(Buffer)]),
            path: zod_1.z.string().optional(),
        })),
        zod_1.z.string(),
    ])
        .optional(),
    attachmentId: zod_1.z.string().optional(),
    downloadPath: zod_1.z.string().optional(),
    batchSize: zod_1.z.number().min(1).max(100).default(10),
    labelName: zod_1.z.string().optional(),
    labelColor: zod_1.z
        .object({
        textColor: zod_1.z.string().optional(),
        backgroundColor: zod_1.z.string().optional(),
    })
        .optional(),
    filterCriteria: zod_1.z
        .object({
        from: zod_1.z.string().optional(),
        to: zod_1.z.string().optional(),
        subject: zod_1.z.string().optional(),
        query: zod_1.z.string().optional(),
    })
        .optional(),
    filterAction: zod_1.z
        .object({
        addLabelIds: zod_1.z.array(zod_1.z.string()).optional(),
        removeLabelIds: zod_1.z.array(zod_1.z.string()).optional(),
        forward: zod_1.z.string().optional(),
    })
        .optional(),
    apiUrl: zod_1.z.string().optional(),
    apiMethod: zod_1.z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(),
    apiHeaders: zod_1.z.union([zod_1.z.record(zod_1.z.string()), zod_1.z.string()]).optional(),
    apiParams: zod_1.z.union([zod_1.z.record(zod_1.z.any()), zod_1.z.string()]).optional(),
    apiBody: zod_1.z.union([zod_1.z.any(), zod_1.z.string()]).optional(),
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
function normalizeStringList(value) {
    if (!value)
        return [];
    if (Array.isArray(value))
        return value;
    return value
        .split(/[,;]/)
        .map((item) => item.trim())
        .filter(Boolean);
}
function applyTemplate(template, variables = {}) {
    let result = template;
    for (const [key, val] of Object.entries(variables)) {
        const regex = new RegExp(`{{${key}}}`, "g");
        result = result.replace(regex, String(val));
    }
    return result;
}
function normalizeRecipients(recipients) {
    if (!recipients)
        return [];
    if (Array.isArray(recipients))
        return recipients;
    return recipients
        .split(/[,;]/)
        .map((email) => email.trim())
        .filter(Boolean);
}
function normalizeStringValue(value) {
    if (Array.isArray(value)) {
        return value.length > 0 ? value[0] : undefined;
    }
    return value;
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
function normalizeAttachments(value) {
    if (!value) {
        return undefined;
    }
    if (Array.isArray(value)) {
        return value.map((item) => ({
            filename: String(item.filename),
            mimeType: String(item.mimeType || "application/octet-stream"),
            content: Buffer.isBuffer(item.content)
                ? item.content.toString("base64")
                : String(item.content),
        }));
    }
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
            return parsed.map((item) => ({
                filename: String(item.filename),
                mimeType: String(item.mimeType || "application/octet-stream"),
                content: Buffer.isBuffer(item.content)
                    ? item.content.toString("base64")
                    : String(item.content),
            }));
        }
    }
    catch {
        // ignore parse errors
    }
    return undefined;
}
async function downloadAttachment(gmail, userId, messageId, attachmentId, downloadPath) {
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
    if (downloadPath) {
        const fs = require("fs");
        const path = require("path");
        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath, { recursive: true });
        }
        // Get attachment metadata to determine filename
        const message = await gmail.users.messages.get({
            userId,
            id: messageId,
            format: "metadata",
            metadataHeaders: ["Content-Disposition"],
        });
        let filename = `attachment_${attachmentId}`;
        const contentDisposition = message.data.payload?.headers?.find((h) => h.name?.toLowerCase() === "content-disposition")?.value;
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
            if (filenameMatch) {
                filename = filenameMatch[1];
            }
        }
        const filePath = path.join(downloadPath, filename);
        fs.writeFileSync(filePath, buffer);
        return {
            filename,
            content: buffer,
            mimeType: attachment.data.mimeType || "application/octet-stream",
        };
    }
    return {
        filename: `attachment_${attachmentId}`,
        content: buffer,
        mimeType: attachment.data.mimeType || "application/octet-stream",
    };
}
function normalizeJsonObject(value) {
    if (!value) {
        return undefined;
    }
    if (typeof value !== "string") {
        return value;
    }
    try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === "object") {
            return parsed;
        }
    }
    catch {
        return { value };
    }
    return undefined;
}
function normalizeApiBody(value) {
    if (typeof value === "string") {
        try {
            return JSON.parse(value);
        }
        catch {
            return value;
        }
    }
    return value;
}
function encodeBase64Url(value) {
    return Buffer.from(value)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}
function buildRawMessage(options) {
    const headers = [
        `From: ${options.from}`,
        `To: ${options.to}`,
        `Subject: ${options.subject}`,
        `MIME-Version: 1.0`,
    ];
    if (options.cc)
        headers.push(`Cc: ${options.cc}`);
    if (options.bcc)
        headers.push(`Bcc: ${options.bcc}`);
    if (options.threadId)
        headers.push(`Thread-Id: ${options.threadId}`);
    if (options.inReplyTo)
        headers.push(`In-Reply-To: ${options.inReplyTo}`);
    if (options.references)
        headers.push(`References: ${options.references}`);
    const hasAttachments = Array.isArray(options.attachments) && options.attachments.length > 0;
    if (hasAttachments) {
        const boundary = `----=_Part_${Date.now()}`;
        headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
        const bodyParts = [];
        const contentHeaders = [
            `Content-Type: multipart/alternative; boundary="${boundary}_alt"`,
        ];
        const textBody = options.body || "";
        const htmlBody = options.htmlBody || options.body || "";
        bodyParts.push(`--${boundary}`);
        bodyParts.push(`Content-Type: multipart/alternative; boundary="${boundary}_alt"`);
        bodyParts.push("");
        bodyParts.push(`--${boundary}_alt`);
        bodyParts.push("Content-Type: text/plain; charset=utf-8");
        bodyParts.push("Content-Transfer-Encoding: 7bit");
        bodyParts.push("");
        bodyParts.push(textBody);
        bodyParts.push(`--${boundary}_alt`);
        bodyParts.push("Content-Type: text/html; charset=utf-8");
        bodyParts.push("Content-Transfer-Encoding: 7bit");
        bodyParts.push("");
        bodyParts.push(htmlBody);
        bodyParts.push(`--${boundary}_alt--`);
        options.attachments?.forEach((attachment) => {
            bodyParts.push(`--${boundary}`);
            bodyParts.push(`Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`);
            bodyParts.push(`Content-Transfer-Encoding: base64`);
            bodyParts.push(`Content-Disposition: attachment; filename="${attachment.filename}"`);
            bodyParts.push("");
            bodyParts.push(encodeBase64Url(attachment.content));
        });
        bodyParts.push(`--${boundary}--`);
        return encodeBase64Url(`${headers.join("\r\n")}\r\n\r\n${bodyParts.join("\r\n")}`);
    }
    const textBody = options.body || "";
    const htmlBody = options.htmlBody || options.body || "";
    if (htmlBody && htmlBody !== textBody) {
        headers.push(`Content-Type: multipart/alternative; boundary="ALT-${Date.now()}"`);
        const boundary = `ALT-${Date.now()}`;
        const bodyParts = [];
        bodyParts.push(`--${boundary}`);
        bodyParts.push("Content-Type: text/plain; charset=utf-8");
        bodyParts.push("Content-Transfer-Encoding: 7bit");
        bodyParts.push("");
        bodyParts.push(textBody);
        bodyParts.push(`--${boundary}`);
        bodyParts.push("Content-Type: text/html; charset=utf-8");
        bodyParts.push("Content-Transfer-Encoding: 7bit");
        bodyParts.push("");
        bodyParts.push(htmlBody);
        bodyParts.push(`--${boundary}--`);
        return encodeBase64Url(`${headers.join("\r\n")}\r\n\r\n${bodyParts.join("\r\n")}`);
    }
    headers.push("Content-Type: text/plain; charset=utf-8");
    headers.push("Content-Transfer-Encoding: 7bit");
    return encodeBase64Url(`${headers.join("\r\n")}\r\n\r\n${textBody}`);
}
function parseHeaderValue(headers = [], key) {
    return (headers.find((header) => header.name?.toLowerCase() === key.toLowerCase())
        ?.value ?? undefined);
}
function extractAttachments(message) {
    const parts = message.payload?.parts || [];
    const attachments = [];
    function collect(partsList) {
        for (const part of partsList) {
            if (part.filename && part.body?.attachmentId) {
                attachments.push({
                    filename: part.filename,
                    mimeType: part.mimeType,
                    size: part.body.size,
                    attachmentId: part.body.attachmentId,
                    partId: part.partId,
                });
            }
            if (Array.isArray(part.parts)) {
                collect(part.parts);
            }
        }
    }
    collect(parts);
    return attachments;
}
const gmailNode = {
    id: "gmail",
    type: "data-gmail",
    name: "Google Gmail",
    description: "Manage Gmail messages with send, reply, search, draft, labels, attachments, and API calls",
    category: "data",
    icon: "✉️",
    color: "#EA4335",
    configSchema: gmailConfigSchema,
    inputs: [
        {
            id: "action",
            label: "Action",
            type: "string",
            required: true,
            description: "Action to perform: send, reply, search, get, copy, move, updateLabels, markAsRead, markAsUnread, delete, createDraft, sendDraft, listAttachments, apiCall",
        },
        {
            id: "to",
            label: "To",
            type: "string",
            description: "Recipient email address",
        },
        {
            id: "cc",
            label: "Cc",
            type: "string",
            description: "CC email addresses separated by commas",
        },
        {
            id: "bcc",
            label: "Bcc",
            type: "string",
            description: "BCC email addresses separated by commas",
        },
        {
            id: "subject",
            label: "Subject",
            type: "string",
            description: "Email subject",
        },
        {
            id: "body",
            label: "Body",
            type: "string",
            description: "Plain text body",
        },
        {
            id: "htmlBody",
            label: "HTML Body",
            type: "string",
            description: "HTML body content",
        },
        {
            id: "threadId",
            label: "Thread ID",
            type: "string",
            description: "Thread ID for replies and thread-based operations",
        },
        {
            id: "messageId",
            label: "Message ID",
            type: "string",
            description: "Message ID for get, modify, delete, and attachments operations",
        },
        {
            id: "query",
            label: "Search Query",
            type: "string",
            description: "Gmail query string for searching messages",
        },
        {
            id: "labelIds",
            label: "Label IDs",
            type: "array",
            description: "Label IDs to apply when copying a message",
        },
        {
            id: "addLabelIds",
            label: "Add Label IDs",
            type: "array",
            description: "Label IDs to add to a message",
        },
        {
            id: "removeLabelIds",
            label: "Remove Label IDs",
            type: "array",
            description: "Label IDs to remove from a message",
        },
        {
            id: "draftId",
            label: "Draft ID",
            type: "string",
            description: "Draft ID to send",
        },
        {
            id: "attachments",
            label: "Attachments",
            type: "array",
            description: "Attachments for send/createDraft actions",
        },
        {
            id: "apiUrl",
            label: "API URL",
            type: "string",
            description: "Full Gmail API URL for custom API calls",
        },
        {
            id: "apiMethod",
            label: "API Method",
            type: "string",
            description: "HTTP method for custom API calls",
        },
        {
            id: "apiHeaders",
            label: "API Headers",
            type: "object",
            description: "Optional headers for custom API calls",
        },
        {
            id: "apiParams",
            label: "API Params",
            type: "object",
            description: "Query parameters for custom API calls",
        },
        {
            id: "apiBody",
            label: "API Body",
            type: "object",
            description: "Request body for custom API calls",
        },
    ],
    outputs: [
        {
            id: "message",
            label: "Message",
            type: "object",
            description: "Single Gmail message result",
        },
        {
            id: "messages",
            label: "Messages",
            type: "array",
            description: "List of Gmail messages",
        },
        {
            id: "draft",
            label: "Draft",
            type: "object",
            description: "Created draft data",
        },
        {
            id: "attachments",
            label: "Attachments",
            type: "array",
            description: "Attachment metadata for a message",
        },
        {
            id: "response",
            label: "Response",
            type: "object",
            description: "Gmail API response payload",
        },
        {
            id: "apiResponse",
            label: "API Response",
            type: "object",
            description: "Response from a custom Gmail API call",
        },
    ],
    validation: {
        input: gmailInputSchema,
        output: zod_1.z.object({
            message: zod_1.z.any().optional(),
            messages: zod_1.z.array(zod_1.z.any()).optional(),
            draft: zod_1.z.any().optional(),
            attachments: zod_1.z.array(zod_1.z.any()).optional(),
            response: zod_1.z.any().optional(),
            apiResponse: zod_1.z.any().optional(),
        }),
    },
    handler: async (context) => {
        const startTime = Date.now();
        const logs = [];
        try {
            const config = gmailConfigSchema.parse(context.config);
            const rawInput = gmailInputSchema.parse(context.input);
            const labelIds = normalizeStringList(rawInput.labelIds);
            const addLabelIds = normalizeStringList(rawInput.addLabelIds);
            const removeLabelIds = normalizeStringList(rawInput.removeLabelIds);
            const attachmentList = normalizeAttachments(rawInput.attachments);
            const apiHeaders = normalizeJsonObject(rawInput.apiHeaders);
            const apiParams = normalizeJsonObject(rawInput.apiParams);
            const apiBody = normalizeApiBody(rawInput.apiBody);
            const input = {
                ...rawInput,
                labelIds,
                addLabelIds,
                removeLabelIds,
                attachments: attachmentList,
                apiHeaders,
                apiParams,
                apiBody,
            };
            const normalizedTo = normalizeRecipients(input.to).join(", ");
            const normalizedCc = normalizeRecipients(input.cc).join(", ");
            const normalizedBcc = normalizeRecipients(input.bcc).join(", ");
            const normalizedMessageId = normalizeStringValue(input.messageId);
            const normalizedThreadId = normalizeStringValue(input.threadId);
            const normalizedDraftId = normalizeStringValue(input.draftId);
            const normalizedAttachmentId = normalizeStringValue(input.attachmentId);
            const oauth2Client = createOAuth2Client(config);
            const gmail = googleapis_1.google.gmail({ version: "v1", auth: oauth2Client });
            const gmailMessages = gmail.users.messages;
            const userId = config.userId || "me";
            let response = null;
            let message = null;
            let messages = [];
            let draft = null;
            let attachments = [];
            let apiResponse = null;
            logs.push(`Executing Gmail action: ${input.action}`);
            const fromAddress = config.defaultFrom || "me";
            switch (input.action) {
                case "send": {
                    if (!normalizedTo) {
                        throw new Error("Recipient address is required for send action");
                    }
                    if (!input.body && !input.htmlBody) {
                        throw new Error("Body or HTML body is required for send action");
                    }
                    const raw = buildRawMessage({
                        from: fromAddress,
                        to: normalizedTo,
                        cc: normalizedCc || undefined,
                        bcc: normalizedBcc || undefined,
                        subject: input.subject || "",
                        body: input.body,
                        htmlBody: input.htmlBody,
                        threadId: normalizedThreadId,
                        attachments: attachmentList,
                    });
                    response = await gmail.users.messages.send({
                        userId,
                        requestBody: {
                            raw,
                            threadId: normalizedThreadId,
                        },
                    });
                    message = response.data;
                    break;
                }
                case "reply": {
                    if (!normalizedMessageId) {
                        throw new Error("Message ID is required for reply action");
                    }
                    const original = await gmail.users.messages.get({
                        userId,
                        id: normalizedMessageId,
                        format: "metadata",
                        metadataHeaders: [
                            "Message-ID",
                            "Subject",
                            "From",
                            "To",
                            "References",
                        ],
                    });
                    const originalHeaders = original.data.payload?.headers || [];
                    const originalSubject = parseHeaderValue(originalHeaders, "Subject") || "";
                    const originalFrom = parseHeaderValue(originalHeaders, "From") || "";
                    const originalMessageId = parseHeaderValue(originalHeaders, "Message-ID");
                    const references = parseHeaderValue(originalHeaders, "References");
                    const replySubject = originalSubject.startsWith("Re:")
                        ? originalSubject
                        : `Re: ${originalSubject}`;
                    const raw = buildRawMessage({
                        from: fromAddress,
                        to: normalizedTo || originalFrom,
                        subject: replySubject,
                        body: input.body,
                        htmlBody: input.htmlBody,
                        threadId: original.data.threadId || undefined,
                        inReplyTo: originalMessageId,
                        references: references || originalMessageId,
                        attachments: attachmentList,
                    });
                    response = await gmail.users.messages.send({
                        userId,
                        requestBody: {
                            raw,
                            threadId: original.data.threadId,
                        },
                    });
                    message = response.data;
                    break;
                }
                case "search": {
                    const query = input.query || "";
                    response = await gmail.users.messages.list({
                        userId,
                        q: query,
                        maxResults: 100,
                    });
                    messages = response.data.messages || [];
                    break;
                }
                case "get": {
                    if (!normalizedMessageId) {
                        throw new Error("Message ID is required for get action");
                    }
                    response = await gmail.users.messages.get({
                        userId,
                        id: normalizedMessageId,
                        format: "full",
                    });
                    message = response.data;
                    break;
                }
                case "copy": {
                    if (!normalizedMessageId) {
                        throw new Error("Message ID is required for copy action");
                    }
                    response = await gmailMessages.copy({
                        userId,
                        id: normalizedMessageId,
                        requestBody: {
                            addLabelIds: labelIds || [],
                        },
                    });
                    message = response.data;
                    break;
                }
                case "move": {
                    if (!normalizedMessageId) {
                        throw new Error("Message ID is required for move action");
                    }
                    response = await gmail.users.messages.modify({
                        userId,
                        id: normalizedMessageId,
                        requestBody: {
                            addLabelIds: addLabelIds || [],
                            removeLabelIds: removeLabelIds || [],
                        },
                    });
                    message = response.data;
                    break;
                }
                case "updateLabels": {
                    if (!normalizedMessageId) {
                        throw new Error("Message ID is required for updateLabels action");
                    }
                    response = await gmail.users.messages.modify({
                        userId,
                        id: normalizedMessageId,
                        requestBody: {
                            addLabelIds: addLabelIds || [],
                            removeLabelIds: removeLabelIds || [],
                        },
                    });
                    message = response.data;
                    break;
                }
                case "markAsRead": {
                    if (!normalizedMessageId) {
                        throw new Error("Message ID is required for markAsRead action");
                    }
                    response = await gmail.users.messages.modify({
                        userId,
                        id: normalizedMessageId,
                        requestBody: {
                            removeLabelIds: ["UNREAD"],
                        },
                    });
                    message = response.data;
                    break;
                }
                case "markAsUnread": {
                    if (!normalizedMessageId) {
                        throw new Error("Message ID is required for markAsUnread action");
                    }
                    response = await gmail.users.messages.modify({
                        userId,
                        id: normalizedMessageId,
                        requestBody: {
                            addLabelIds: ["UNREAD"],
                        },
                    });
                    message = response.data;
                    break;
                }
                case "delete": {
                    if (!normalizedMessageId) {
                        throw new Error("Message ID is required for delete action");
                    }
                    response = await gmail.users.messages.delete({
                        userId,
                        id: normalizedMessageId,
                    });
                    message = { deleted: true };
                    break;
                }
                case "createDraft": {
                    if (!normalizedTo) {
                        throw new Error("Recipient address is required for createDraft action");
                    }
                    if (!input.body && !input.htmlBody) {
                        throw new Error("Body or HTML body is required for createDraft action");
                    }
                    const raw = buildRawMessage({
                        from: fromAddress,
                        to: normalizedTo,
                        cc: normalizedCc || undefined,
                        bcc: normalizedBcc || undefined,
                        subject: input.subject || "",
                        body: input.body,
                        htmlBody: input.htmlBody,
                        attachments: attachmentList,
                    });
                    response = await gmail.users.drafts.create({
                        userId,
                        requestBody: {
                            message: {
                                raw,
                            },
                        },
                    });
                    draft = response.data;
                    break;
                }
                case "sendDraft": {
                    if (!normalizedDraftId) {
                        throw new Error("Draft ID is required for sendDraft action");
                    }
                    response = await gmail.users.drafts.send({
                        userId,
                        requestBody: {
                            draftId: normalizedDraftId,
                        },
                    });
                    message = response.data;
                    break;
                }
                case "listAttachments": {
                    if (!normalizedMessageId) {
                        throw new Error("Message ID is required for listAttachments action");
                    }
                    const full = await gmail.users.messages.get({
                        userId,
                        id: normalizedMessageId,
                        format: "full",
                    });
                    attachments = extractAttachments(full.data);
                    message = full.data;
                    break;
                }
                case "downloadAttachment": {
                    if (!normalizedMessageId || !normalizedAttachmentId) {
                        throw new Error("Message ID and attachment ID are required for downloadAttachment action");
                    }
                    const attachmentData = await downloadAttachment(gmailMessages, userId, normalizedMessageId, normalizedAttachmentId, input.downloadPath);
                    attachments = [attachmentData];
                    break;
                }
                case "batchSend": {
                    const recipients = normalizeRecipients(input.to);
                    if (recipients.length === 0) {
                        throw new Error("Recipients are required for batchSend action");
                    }
                    const batchSize = input.batchSize || 10;
                    messages = [];
                    for (let i = 0; i < recipients.length; i += batchSize) {
                        const batch = recipients.slice(i, i + batchSize);
                        const batchPromises = batch.map(async (recipient) => {
                            const raw = buildRawMessage({
                                from: fromAddress,
                                to: recipient,
                                subject: input.subject || "",
                                body: input.body,
                                htmlBody: input.htmlBody,
                                attachments: attachmentList,
                            });
                            return gmail.users.messages.send({
                                userId,
                                requestBody: { raw },
                            });
                        });
                        const batchResults = await Promise.allSettled(batchPromises);
                        batchResults.forEach((result, index) => {
                            if (result.status === "fulfilled") {
                                messages.push(result.value.data);
                            }
                            else {
                                logs.push(`Failed to send to ${batch[index]}: ${result.reason}`);
                            }
                        });
                    }
                    break;
                }
                case "batchDelete": {
                    const messageIds = Array.isArray(input.messageId)
                        ? input.messageId
                        : [input.messageId].filter(Boolean);
                    if (messageIds.length === 0) {
                        throw new Error("Message IDs are required for batchDelete action");
                    }
                    const batchPromises = messageIds.map((messageId) => gmail.users.messages.delete({ userId, id: messageId }));
                    await Promise.allSettled(batchPromises);
                    message = { deleted: messageIds.length, ids: messageIds };
                    break;
                }
                case "batchLabel": {
                    const messageIds = Array.isArray(input.messageId)
                        ? input.messageId
                        : [input.messageId].filter(Boolean);
                    if (messageIds.length === 0) {
                        throw new Error("Message IDs are required for batchLabel action");
                    }
                    const batchPromises = messageIds.map((messageId) => gmail.users.messages.modify({
                        userId,
                        id: messageId,
                        requestBody: {
                            addLabelIds: addLabelIds || [],
                            removeLabelIds: removeLabelIds || [],
                        },
                    }));
                    const results = await Promise.allSettled(batchPromises);
                    messages = results.map((result, index) => result.status === "fulfilled"
                        ? result.value.data
                        : { error: result.reason, id: messageIds[index] });
                    break;
                }
                case "createLabel": {
                    if (!input.labelName) {
                        throw new Error("Label name is required for createLabel action");
                    }
                    response = await gmail.users.labels.create({
                        userId,
                        requestBody: {
                            name: input.labelName,
                            color: input.labelColor,
                        },
                    });
                    message = response.data;
                    break;
                }
                case "deleteLabel": {
                    if (!input.labelIds) {
                        throw new Error("Label ID is required for deleteLabel action");
                    }
                    const labelId = Array.isArray(input.labelIds)
                        ? input.labelIds[0]
                        : input.labelIds;
                    response = await gmail.users.labels.delete({
                        userId,
                        id: labelId,
                    });
                    message = { deleted: true, labelId };
                    break;
                }
                case "getThread": {
                    if (!normalizedThreadId) {
                        throw new Error("Thread ID is required for getThread action");
                    }
                    response = await gmail.users.threads.get({
                        userId,
                        id: normalizedThreadId,
                        format: "full",
                    });
                    message = response.data;
                    break;
                }
                case "replyToThread": {
                    if (!normalizedThreadId || !normalizedMessageId) {
                        throw new Error("Thread ID and message ID are required for replyToThread action");
                    }
                    const thread = await gmail.users.threads.get({
                        userId,
                        id: normalizedThreadId,
                        format: "metadata",
                    });
                    const lastMessage = thread.data.messages?.[thread.data.messages.length - 1];
                    if (!lastMessage) {
                        throw new Error("No messages found in thread");
                    }
                    const originalHeaders = lastMessage.payload?.headers || [];
                    const originalSubject = parseHeaderValue(originalHeaders, "Subject") || "";
                    const originalFrom = parseHeaderValue(originalHeaders, "From") || "";
                    const replySubject = originalSubject.startsWith("Re:")
                        ? originalSubject
                        : `Re: ${originalSubject}`;
                    const raw = buildRawMessage({
                        from: fromAddress,
                        to: normalizedTo || originalFrom,
                        subject: replySubject,
                        body: input.body,
                        htmlBody: input.htmlBody,
                        threadId: normalizedThreadId,
                        inReplyTo: normalizedMessageId,
                        references: normalizedMessageId,
                        attachments: attachmentList,
                    });
                    response = await gmail.users.messages.send({
                        userId,
                        requestBody: {
                            raw,
                            threadId: normalizedThreadId,
                        },
                    });
                    message = response.data;
                    break;
                }
                case "forward": {
                    if (!normalizedMessageId) {
                        throw new Error("Message ID is required for forward action");
                    }
                    if (!normalizedTo) {
                        throw new Error("Recipient address is required for forward action");
                    }
                    const original = await gmail.users.messages.get({
                        userId,
                        id: normalizedMessageId,
                        format: "full",
                    });
                    const originalHeaders = original.data.payload?.headers || [];
                    const originalSubject = parseHeaderValue(originalHeaders, "Subject") || "";
                    const originalFrom = parseHeaderValue(originalHeaders, "From") || "";
                    const forwardSubject = originalSubject.startsWith("Fwd:")
                        ? originalSubject
                        : `Fwd: ${originalSubject}`;
                    const originalBody = extractTextBody(original.data.payload);
                    const forwardBody = `---------- Forwarded message ---------\nFrom: ${originalFrom}\n\n${originalBody}`;
                    const raw = buildRawMessage({
                        from: fromAddress,
                        to: normalizedTo,
                        subject: forwardSubject,
                        body: input.body ? `${input.body}\n\n${forwardBody}` : forwardBody,
                        htmlBody: input.htmlBody,
                        attachments: attachmentList,
                    });
                    response = await gmail.users.messages.send({
                        userId,
                        requestBody: { raw },
                    });
                    message = response.data;
                    break;
                }
                case "createFilter": {
                    if (!input.filterCriteria || !input.filterAction) {
                        throw new Error("Filter criteria and action are required for createFilter action");
                    }
                    response = await gmail.users.settings.filters.create({
                        userId,
                        requestBody: {
                            criteria: input.filterCriteria,
                            action: input.filterAction,
                        },
                    });
                    message = response.data;
                    break;
                }
                case "apiCall": {
                    if (!input.apiUrl) {
                        throw new Error("API URL is required for apiCall action");
                    }
                    const token = await oauth2Client.getAccessToken();
                    const bearerToken = token?.token;
                    if (!bearerToken) {
                        throw new Error("Unable to resolve an access token for API call");
                    }
                    const requestConfig = {
                        url: input.apiUrl,
                        method: input.apiMethod || "GET",
                        headers: {
                            Authorization: `Bearer ${bearerToken}`,
                            ...(apiHeaders || {}),
                        },
                        params: apiParams,
                        data: apiBody,
                    };
                    const axiosResponse = await (0, axios_1.default)(requestConfig);
                    apiResponse = axiosResponse.data;
                    response = axiosResponse;
                    break;
                }
                default:
                    throw new Error(`Unsupported Gmail action: ${input.action}`);
            }
            logs.push(`Gmail action ${input.action} completed successfully`);
            return {
                success: true,
                output: {
                    message,
                    messages,
                    draft,
                    attachments,
                    response: response?.data ?? response,
                    apiResponse,
                },
                logs,
                executionTime: Date.now() - startTime,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                success: false,
                error: errorMessage,
                logs: [`Gmail node failed: ${errorMessage}`],
                executionTime: Date.now() - startTime,
            };
        }
    },
};
exports.gmailNode = gmailNode;
