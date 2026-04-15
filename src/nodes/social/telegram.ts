import { z } from "zod";
import {
  NodeDefinition,
  NodeExecutionContext,
  NodeExecutionResult,
  nodeRegistry,
} from "../index";
import axios from "axios";

// Telegram Bot Node
const telegramConfigSchema = z.object({
  botToken: z.string().min(1),
  chatId: z.string().min(1),
  parseMode: z.enum(["Markdown", "HTML", "MarkdownV2"]).default("HTML"),
  disableWebPagePreview: z.boolean().default(false),
  disableNotification: z.boolean().default(false),
});

const telegramNode: NodeDefinition = {
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
    input: z.object({
      message: z.string().min(1),
      chatId: z.string().optional(),
      replyToMessageId: z.string().optional(),
      attachments: z
        .array(
          z.object({
            type: z.enum(["photo", "document", "audio", "video", "animation"]),
            file: z.string(), // File path or URL
            caption: z.string().optional(),
          }),
        )
        .optional(),
    }),
    output: z.object({
      messageId: z.number(),
      response: z.object({
        ok: z.boolean(),
        result: z.any(),
      }),
    }),
  },

  handler: async (
    context: NodeExecutionContext,
  ): Promise<NodeExecutionResult> => {
    const startTime = Date.now();
    const logs: string[] = [];

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
          const method =
            attachment.type === "photo" ? "sendPhoto" : "sendDocument";
          response = await axios.post(`${baseUrl}/${method}`, {
            chat_id: chatId,
            [attachment.type === "photo" ? "photo" : "document"]:
              attachment.file,
            caption: input.message,
            parse_mode: config.parseMode,
            disable_web_page_preview: config.disableWebPagePreview,
            disable_notification: config.disableNotification,
            reply_to_message_id: input.replyToMessageId,
          });
        } else {
          throw new Error("File upload from local path not implemented");
        }
      } else {
        // Send text message
        response = await axios.post(`${baseUrl}/sendMessage`, {
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
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
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

export { telegramNode };
