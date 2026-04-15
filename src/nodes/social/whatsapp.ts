import { z } from "zod";
import {
  NodeDefinition,
  NodeExecutionContext,
  NodeExecutionResult,
  nodeRegistry,
} from "../index";
import axios from "axios";

// WhatsApp Business Node
const whatsappConfigSchema = z.object({
  accessToken: z.string().min(1),
  phoneNumberId: z.string().min(1),
  apiVersion: z.string().default("v18.0"),
  timeout: z.number().min(1000).max(300000).default(30000),
});

const whatsappNode: NodeDefinition = {
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
    input: z.object({
      to: z.string().regex(/^\+\d{10,15}$/, "Invalid phone number format"),
      message: z.string().min(1),
      type: z
        .enum(["text", "image", "document", "audio", "video"])
        .default("text"),
      media: z.string().url().optional(),
    }),
    output: z.object({
      messageId: z.string(),
      response: z.object({
        messaging_product: z.string(),
        contacts: z.array(z.any()),
        messages: z.array(z.any()),
      }),
    }),
  },

  handler: async (
    context: NodeExecutionContext,
  ): Promise<NodeExecutionResult> => {
    const startTime = Date.now();
    const logs: string[] = [];

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

      let messageBody: any = {
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

      const response = await axios.post(baseUrl, messageBody, {
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
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
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

export { whatsappNode };
