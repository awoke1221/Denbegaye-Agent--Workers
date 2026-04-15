"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.whatsappNode = void 0;
const zod_1 = require("zod");
const axios_1 = __importDefault(require("axios"));
// WhatsApp Business Node
const whatsappConfigSchema = zod_1.z.object({
    accessToken: zod_1.z.string().min(1),
    phoneNumberId: zod_1.z.string().min(1),
    apiVersion: zod_1.z.string().default("v18.0"),
    timeout: zod_1.z.number().min(1000).max(300000).default(30000),
});
const whatsappNode = {
    id: "whatsapp-business",
    type: "social-whatsapp",
    name: "WhatsApp Business",
    description: "Send messages via WhatsApp Business API",
    category: "social",
    icon: "💬",
    color: "#25D366",
    configSchema: whatsappConfigSchema,
    inputs: [
        {
            id: "to",
            label: "Recipient",
            type: "string",
            required: true,
            description: "Recipient phone number with country code",
        },
        {
            id: "message",
            label: "Message",
            type: "string",
            required: true,
            description: "The message to send",
        },
        {
            id: "type",
            label: "Message Type",
            type: "string",
            required: false,
            description: "Message type (text, image, document, etc.)",
        },
        {
            id: "media",
            label: "Media URL",
            type: "string",
            required: false,
            description: "Media file URL for media messages",
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
            description: "WhatsApp API response",
        },
    ],
    validation: {
        input: zod_1.z.object({
            to: zod_1.z.string().regex(/^\+\d{10,15}$/, "Invalid phone number format"),
            message: zod_1.z.string().min(1),
            type: zod_1.z
                .enum(["text", "image", "document", "audio", "video"])
                .default("text"),
            media: zod_1.z.string().url().optional(),
        }),
        output: zod_1.z.object({
            messageId: zod_1.z.string(),
            response: zod_1.z.object({
                messaging_product: zod_1.z.string(),
                contacts: zod_1.z.array(zod_1.z.any()),
                messages: zod_1.z.array(zod_1.z.any()),
            }),
        }),
    },
    handler: async (context) => {
        const startTime = Date.now();
        const logs = [];
        try {
            const config = whatsappConfigSchema.parse(context.config);
            const input = context.validation.input.parse(context.input);
            const { accessToken, phoneNumberId, apiVersion } = config;
            const baseUrl = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
            logs.push(`Sending WhatsApp message to ${input.to}`);
            const headers = {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            };
            let messageBody = {
                messaging_product: "whatsapp",
                to: input.to.replace("+", ""), // Remove + from phone number
            };
            // Handle different message types
            switch (input.type) {
                case "text":
                    messageBody.type = "text";
                    messageBody.text = { body: input.message };
                    break;
                case "image":
                    if (!input.media) {
                        throw new Error("Media URL required for image messages");
                    }
                    messageBody.type = "image";
                    messageBody.image = {
                        link: input.media,
                        caption: input.message,
                    };
                    break;
                case "document":
                    if (!input.media) {
                        throw new Error("Media URL required for document messages");
                    }
                    messageBody.type = "document";
                    messageBody.document = {
                        link: input.media,
                        caption: input.message,
                    };
                    break;
                default:
                    throw new Error(`Message type ${input.type} not implemented`);
            }
            const response = await axios_1.default.post(baseUrl, messageBody, {
                headers,
                timeout: config.timeout,
            });
            logs.push("WhatsApp message sent successfully");
            return {
                success: true,
                output: {
                    messageId: response.data.messages?.[0]?.id || "",
                    response: response.data,
                },
                logs,
                executionTime: Date.now() - startTime,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logs.push(`WhatsApp message failed: ${errorMessage}`);
            return {
                success: false,
                error: errorMessage,
                logs,
                executionTime: Date.now() - startTime,
            };
        }
    },
};
exports.whatsappNode = whatsappNode;
