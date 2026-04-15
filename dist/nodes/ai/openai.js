"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openaiNode = void 0;
const zod_1 = require("zod");
const openai_1 = __importDefault(require("openai"));
// OpenAI Node
const openaiConfigSchema = zod_1.z.object({
    model: zod_1.z
        .enum(["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"])
        .default("gpt-4o-mini"),
    temperature: zod_1.z.number().min(0).max(2).default(0.7),
    maxTokens: zod_1.z.number().min(1).max(4096).default(2048),
    systemPrompt: zod_1.z.string().optional(),
    apiKey: zod_1.z.string().optional(), // Will use from apiKeys if not provided
});
const openaiNode = {
    id: "openai-gpt",
    type: "ai-openai",
    name: "OpenAI GPT",
    description: "Advanced AI reasoning using OpenAI GPT models",
    category: "ai",
    icon: "🧪",
    color: "#412991",
    configSchema: openaiConfigSchema,
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
            description: "The generated response from OpenAI",
        },
        {
            id: "usage",
            label: "Usage Stats",
            type: "object",
            description: "Token usage and metadata",
        },
    ],
    validation: {
        input: zod_1.z.object({
            prompt: zod_1.z.string().min(1),
            context: zod_1.z.record(zod_1.z.any()).optional(),
            messages: zod_1.z
                .array(zod_1.z.object({
                role: zod_1.z.enum(["user", "assistant", "system"]),
                content: zod_1.z.string(),
            }))
                .optional(),
        }),
        output: zod_1.z.object({
            response: zod_1.z.string(),
            usage: zod_1.z.object({
                prompt_tokens: zod_1.z.number(),
                completion_tokens: zod_1.z.number(),
                total_tokens: zod_1.z.number(),
            }),
        }),
    },
    handler: async (context) => {
        const startTime = Date.now();
        const logs = [];
        try {
            const config = openaiConfigSchema.parse(context.config);
            const input = context.validation.input.parse(context.input);
            const apiKey = config.apiKey || context.apiKeys.openai;
            if (!apiKey) {
                throw new Error("OpenAI API key not provided");
            }
            logs.push("Initializing OpenAI client");
            const client = new openai_1.default({ apiKey });
            // Build messages array
            const messages = [];
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
        }
        catch (error) {
            logs.push(`Error in OpenAI node: ${error instanceof Error ? error.message : String(error)}`);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                logs,
                executionTime: Date.now() - startTime,
            };
        }
    },
};
exports.openaiNode = openaiNode;
