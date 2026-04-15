import { z } from "zod";
import {
  NodeDefinition,
  NodeExecutionContext,
  NodeExecutionResult,
  NodePort,
  nodeRegistry,
} from "../index";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Google Gemini Node
const geminiConfigSchema = z.object({
  model: z.enum(["gemini-pro", "gemini-pro-vision"]).default("gemini-pro"),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(1).max(8192).default(2048),
  systemPrompt: z.string().optional(),
  apiKey: z.string().optional(), // Will use from apiKeys if not provided
});

const geminiNode: NodeDefinition = {
  id: "google-gemini",
  type: "ai-google-gemini",
  name: "Google Gemini",
  description: "Advanced AI reasoning using Google Gemini models",
  category: "ai",
  icon: "🤖",
  color: "#4285F4",

  configSchema: geminiConfigSchema,

  inputs: [
    {
      id: "prompt",
      label: "Prompt",
      type: "string",
      required: true,
      description: "The input prompt for the AI model",
    },
    {
      id: "context",
      label: "Context",
      type: "object",
      required: false,
      description: "Additional context data",
    },
  ],

  outputs: [
    {
      id: "response",
      label: "Response",
      type: "string",
      description: "The generated response from Gemini",
    },
    {
      id: "usage",
      label: "Usage Stats",
      type: "object",
      description: "Token usage and metadata",
    },
  ],

  validation: {
    input: z.object({
      prompt: z.string().min(1),
      context: z.record(z.any()).optional(),
    }),
    output: z.object({
      response: z.string(),
      usage: z.object({
        promptTokenCount: z.number(),
        candidatesTokenCount: z.number(),
        totalTokenCount: z.number(),
      }),
    }),
  },

  handler: async (
    context: NodeExecutionContext,
  ): Promise<NodeExecutionResult> => {
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      const config = geminiConfigSchema.parse(context.config);
      const input = context.validation.input.parse(context.input);

      const apiKey = config.apiKey || context.apiKeys.gemini;
      if (!apiKey) {
        throw new Error("Google Gemini API key not provided");
      }

      logs.push("Initializing Google Gemini AI client");

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: config.model,
        generationConfig: {
          temperature: config.temperature,
          maxOutputTokens: config.maxTokens,
        },
        systemInstruction: config.systemPrompt,
      });

      logs.push(`Generating content with model: ${config.model}`);

      // Build the prompt with context
      let prompt = input.prompt;
      if (input.context) {
        prompt = `Context: ${JSON.stringify(input.context)}\n\n${prompt}`;
      }

      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      logs.push("Content generation completed successfully");

      const usage = {
        promptTokenCount: response.usageMetadata?.promptTokenCount || 0,
        candidatesTokenCount: response.usageMetadata?.candidatesTokenCount || 0,
        totalTokenCount: response.usageMetadata?.totalTokenCount || 0,
      };

      return {
        success: true,
        output: {
          response: text,
          usage,
        },
        logs,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      logs.push(
        `Error in Gemini node: ${error instanceof Error ? error.message : String(error)}`,
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

export { geminiNode };
