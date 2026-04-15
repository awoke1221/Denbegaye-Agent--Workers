"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.telegramNode = void 0;
const zod_1 = require("zod");
const axios_1 = __importDefault(require("axios"));
// Telegram Bot Node
const telegramConfigSchema = zod_1.z.object({
    botToken: zod_1.z.string().min(1),
    chatId: zod_1.z.string().min(1),
    parseMode: zod_1.z.enum(["Markdown", "HTML", "MarkdownV2"]).default("HTML"),
    disableWebPagePreview: zod_1.z.boolean().default(false),
    disableNotification: zod_1.z.boolean().default(false),
});
const telegramNode = {
    id: "telegram-bot",
    type: "social-telegram",
    name: "Telegram Bot",
    description: "Send messages and interact with Telegram bots",
    category: "social",
    icon: "📱",
    color: "#0088CC",
    configSchema: telegramConfigSchema,
    inputs: [
        {
            id: "message",
            label: "Message",
            type: "string",
            required: true,
            description: "The message to send",
        },
        {
            id: "chatId",
            label: "Chat ID",
            type: "string",
            required: false,
            description: "Target chat ID (overrides config if provided)",
        },
        {
            id: "replyToMessageId",
            label: "Reply To",
            type: "string",
            required: false,
            description: "Message ID to reply to",
        },
        {
            id: "attachments",
            label: "Attachments",
            type: "array",
            required: false,
            description: "Files or media to send",
        },
    ],
    outputs: [
        {
            id: "messageId",
            label: "Message ID",
            type: "string",
            description: "The sent message ID",
        },
        {
            id: "response",
            label: "API Response",
            type: "object",
            description: "Telegram API response",
        },
    ],
    validation: {
        input: zod_1.z.object({
            message: zod_1.z.string().min(1),
            chatId: zod_1.z.string().optional(),
            replyToMessageId: zod_1.z.string().optional(),
            attachments: zod_1.z
                .array(zod_1.z.object({
                type: zod_1.z.enum(["photo", "document", "audio", "video", "animation"]),
                file: zod_1.z.string(), // File path or URL
                caption: zod_1.z.string().optional(),
            }))
                .optional(),
        }),
        output: zod_1.z.object({
            messageId: zod_1.z.number(),
            response: zod_1.z.object({
                ok: zod_1.z.boolean(),
                result: zod_1.z.any(),
            }),
        }),
    },
    handler: async (context) => {
        const startTime = Date.now();
        const logs = [];
        try {
            const config = telegramConfigSchema.parse(context.config);
            const input = context.validation.input.parse(context.input);
            const botToken = config.botToken;
            const chatId = input.chatId || config.chatId;
            if (!botToken) {
                throw new Error("Telegram bot token not provided");
            }
            if (!chatId) {
                throw new Error("Chat ID not provided");
            }
            const baseUrl = `https://api.telegram.org/bot${botToken}`;
            logs.push(`Sending message to Telegram chat ${chatId}`);
            let response;
            // Handle attachments
            if (input.attachments && input.attachments.length > 0) {
                // For simplicity, handle only the first attachment
                const attachment = input.attachments[0];
                const formData = new FormData();
                formData.append("chat_id", chatId);
                formData.append("caption", input.message);
                if (config.parseMode !== "Markdown") {
                    formData.append("parse_mode", config.parseMode);
                }
                if (config.disableWebPagePreview) {
                    formData.append("disable_web_page_preview", "true");
                }
                if (config.disableNotification) {
                    formData.append("disable_notification", "true");
                }
                if (input.replyToMessageId) {
                    formData.append("reply_to_message_id", input.replyToMessageId);
                }
                // In a real implementation, you'd handle file uploads properly
                // For now, assume URLs or file paths
                if (attachment.file.startsWith("http")) {
                    // Handle URL
                    const method = attachment.type === "photo" ? "sendPhoto" : "sendDocument";
                    response = await axios_1.default.post(`${baseUrl}/${method}`, {
                        chat_id: chatId,
                        [attachment.type === "photo" ? "photo" : "document"]: attachment.file,
                        caption: input.message,
                        parse_mode: config.parseMode,
                        disable_web_page_preview: config.disableWebPagePreview,
                        disable_notification: config.disableNotification,
                        reply_to_message_id: input.replyToMessageId,
                    });
                }
                else {
                    throw new Error("File upload from local path not implemented");
                }
            }
            else {
                // Send text message
                response = await axios_1.default.post(`${baseUrl}/sendMessage`, {
                    chat_id: chatId,
                    text: input.message,
                    parse_mode: config.parseMode,
                    disable_web_page_preview: config.disableWebPagePreview,
                    disable_notification: config.disableNotification,
                    reply_to_message_id: input.replyToMessageId,
                });
            }
            logs.push("Message sent successfully");
            return {
                success: true,
                output: {
                    messageId: response.data.result.message_id,
                    response: response.data,
                },
                logs,
                executionTime: Date.now() - startTime,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logs.push(`Telegram message failed: ${errorMessage}`);
            return {
                success: false,
                error: errorMessage,
                logs,
                executionTime: Date.now() - startTime,
            };
        }
    },
};
exports.telegramNode = telegramNode;
