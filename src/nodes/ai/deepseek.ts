import { z } from "zod";
import {
  NodeDefinition,
  NodeExecutionContext,
  NodeExecutionResult,
  nodeRegistry,
} from "../index";
import OpenAI from "openai";

// DeepSeek Node
const deepseekConfigSchema = z.object({
  model: z.enum(["deepseek-chat", "deepseek-coder"]).default("deepseek-chat"),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(1).max(4096).default(2048),
  systemPrompt: z.string().optional(),
  apiKey: z.string().optional(), // Will use from apiKeys if not provided
});

const deepseekNode: NodeDefinition = {
  id: "deepseek-ai",
  type: "ai-deepseek",
  name: "DeepSeek AI",
  description: "Advanced AI reasoning using DeepSeek models",
  category: "ai",
  icon: "🧠",
  color: "#00A67E",

  configSchema: deepseekConfigSchema,

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
    {
      id: "messages",
      label: "Message History",
      type: "array",
      required: false,
      description: "Previous messages for conversation context",
    },
  ],

  outputs: [
    {
      id: "response",
      label: "Response",
      type: "string",
      description: "The generated response from DeepSeek",
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
      messages: z
        .array(
          z.object({
            role: z.enum(["user", "assistant", "system"]),
            content: z.string(),
          }),
        )
        .optional(),
    }),
    output: z.object({
      response: z.string(),
      usage: z.object({
        prompt_tokens: z.number(),
        completion_tokens: z.number(),
        total_tokens: z.number(),
      }),
    }),
  },

  handler: async (
    context: NodeExecutionContext,
  ): Promise<NodeExecutionResult> => {
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      const config = deepseekConfigSchema.parse(context.config);
      const input = context.validation.input.parse(context.input);

      const apiKey = config.apiKey || context.apiKeys.deepseek;
      if (!apiKey) {
        throw new Error("DeepSeek API key not provided");
      }

      logs.push("Initializing DeepSeek AI client");

      const client = new OpenAI({
        apiKey,
        baseURL: "https://api.deepseek.com/v1",
      });

      // Build messages array
      const messages: Array<{
        role: "user" | "assistant" | "system";
        content: string;
      }> = [];

      // Add system prompt if provided
      if (config.systemPrompt) {
        messages.push({ role: "system", content: config.systemPrompt });
      }

      // Add previous messages if provided
      if (input.messages) {
        messages.push(...input.messages);
      }

      // Add current prompt
      let prompt = input.prompt;
      if (input.context) {
        prompt = `Context: ${JSON.stringify(input.context)}\n\n${prompt}`;
      }
      messages.push({ role: "user", content: prompt });

      logs.push(`Generating content with model: ${config.model}`);

      const completion = await client.chat.completions.create({
        model: config.model,
        messages,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
      });

      const response = completion.choices[0]?.message?.content || "";
      const usage = completion.usage;

      logs.push("Content generation completed successfully");

      return {
        success: true,
        output: {
          response,
          usage: {
            prompt_tokens: usage?.prompt_tokens || 0,
            completion_tokens: usage?.completion_tokens || 0,
            total_tokens: usage?.total_tokens || 0,
          },
        },
        logs,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      logs.push(
        `Error in DeepSeek node: ${error instanceof Error ? error.message : String(error)}`,
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

export { deepseekNode };
