import { z } from "zod";
import {
  NodeDefinition,
  NodeExecutionContext,
  NodeExecutionResult,
  NodePort,
  nodeRegistry,
} from "../index";
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  GenerativeModel,
  GenerationConfig,
  SafetySetting,
  Content,
  Part,
  SchemaType,
} from "@google/generative-ai";

// Action types for Gemini node
const GeminiAction = z.enum([
  "generateText",
  "sendChatMessage",
  "analyzeImage",
  "generateJson",
  "countTokens",
  "createEmbedding",
  "summarizeContent",
  "classifyText",
  "extractStructuredData",
  "translateText",
  "textToSpeech",
  "generateImage",
  "generateVideo",
  "analyzeVideo",
  "analyzeAudio",
  "codeGeneration",
  "codeExecution",
  "functionCalling",
  "groundingWithGoogleSearch",
]);

// Safety settings schema
const SafetySettingsSchema = z.object({
  harassment: z
    .enum(["block_none", "block_few", "block_some", "block_most"])
    .default("block_some"),
  hateSpeech: z
    .enum(["block_none", "block_few", "block_some", "block_most"])
    .default("block_some"),
  sexuallyExplicit: z
    .enum(["block_none", "block_few", "block_some", "block_most"])
    .default("block_some"),
  dangerousContent: z
    .enum(["block_none", "block_few", "block_some", "block_most"])
    .default("block_some"),
});

// Retry configuration
const RetryConfigSchema = z.object({
  maxRetries: z.number().min(0).max(10).default(3),
  backoffMs: z.number().min(100).max(10000).default(1000),
});

// Gemini configuration schema
const geminiConfigSchema = z.object({
  action: GeminiAction,
  model: z
    .enum([
      "gemini-1.5-pro",
      "gemini-1.5-flash",
      "gemini-1.5-pro-002",
      "gemini-1.5-flash-002",
      "gemini-2.0-flash-exp",
      "gemini-pro",
      "gemini-pro-vision",
      "imagen-3.0-generate-001",
      "veo-2.0-generate-001",
    ])
    .default("gemini-1.5-flash"),
  temperature: z.number().min(0).max(2).default(0.7),
  topP: z.number().min(0).max(1).optional(),
  topK: z.number().min(1).max(100).optional(),
  maxTokens: z.number().min(1).max(8192).default(2048),
  stopSequences: z.array(z.string()).optional(),
  candidateCount: z.number().min(1).max(8).default(1),
  safetySettings: SafetySettingsSchema.optional(),
  systemPrompt: z.string().optional(),
  apiKey: z.string().optional(),
  retry: RetryConfigSchema.optional(),
  timeout: z.number().min(1000).max(300000).default(30000), // 30 seconds
  logging: z
    .object({
      level: z.enum(["debug", "info", "warn", "error"]).default("info"),
      metadata: z.record(z.any()).optional(),
    })
    .optional(),
});

// Input schemas for different actions
const generateTextInputSchema = z.object({
  prompt: z.string().min(1),
  context: z.record(z.any()).optional(),
});

const sendChatMessageInputSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "model"]),
        content: z.string(),
      }),
    )
    .min(1),
  context: z.record(z.any()).optional(),
});

const analyzeImageInputSchema = z.object({
  prompt: z.string().min(1),
  image: z.union([
    z.string(), // base64
    z.object({ url: z.string() }), // URL
  ]),
  context: z.record(z.any()).optional(),
});

const generateJsonInputSchema = z.object({
  prompt: z.string().min(1),
  schema: z.record(z.any()), // JSON schema for structured output
  context: z.record(z.any()).optional(),
});

const countTokensInputSchema = z.object({
  text: z.string().min(1),
  model: z.string().optional(), // Override model for counting
});

const createEmbeddingInputSchema = z.object({
  text: z.string().min(1),
});

const summarizeContentInputSchema = z.object({
  content: z.string().min(1),
  maxLength: z.number().optional(),
  context: z.record(z.any()).optional(),
});

const classifyTextInputSchema = z.object({
  text: z.string().min(1),
  categories: z.array(z.string()).min(1),
  context: z.record(z.any()).optional(),
});

const extractStructuredDataInputSchema = z.object({
  text: z.string().min(1),
  fields: z.array(z.string()).min(1),
  context: z.record(z.any()).optional(),
});

const translateTextInputSchema = z.object({
  text: z.string().min(1),
  targetLanguage: z.string().min(1),
  sourceLanguage: z.string().optional(),
  context: z.record(z.any()).optional(),
});

const textToSpeechInputSchema = z.object({
  text: z.string().min(1),
  voice: z.enum(["male", "female"]).default("female"),
  speed: z.number().min(0.5).max(2).default(1),
});

const generateImageInputSchema = z.object({
  prompt: z.string().min(1),
  aspectRatio: z.enum(["1:1", "4:3", "16:9", "3:4", "9:16"]).default("1:1"),
  style: z.enum(["natural", "vivid"]).default("natural"),
  negativePrompt: z.string().optional(),
});

const generateVideoInputSchema = z.object({
  prompt: z.string().min(1),
  duration: z.enum(["5s", "8s"]).default("5s"),
  resolution: z.enum(["720p", "1080p"]).default("720p"),
  image: z
    .union([
      z.string(), // base64
      z.object({ url: z.string() }), // URL
    ])
    .optional(),
});

const analyzeVideoInputSchema = z.object({
  prompt: z.string().min(1),
  video: z.union([
    z.string(), // base64
    z.object({ url: z.string() }), // URL
  ]),
  context: z.record(z.any()).optional(),
});

const analyzeAudioInputSchema = z.object({
  prompt: z.string().min(1),
  audio: z.union([
    z.string(), // base64
    z.object({ url: z.string() }), // URL
  ]),
  context: z.record(z.any()).optional(),
});

const codeGenerationInputSchema = z.object({
  description: z.string().min(1),
  language: z.string().min(1),
  context: z.record(z.any()).optional(),
});

const codeExecutionInputSchema = z.object({
  code: z.string().min(1),
  language: z.string().min(1),
  inputs: z.record(z.any()).optional(),
});

const functionCallingInputSchema = z.object({
  prompt: z.string().min(1),
  functions: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        parameters: z.record(z.any()),
      }),
    )
    .min(1),
  context: z.record(z.any()).optional(),
});

const groundingWithGoogleSearchInputSchema = z.object({
  prompt: z.string().min(1),
  context: z.record(z.any()).optional(),
});

// Utility functions
function mapSafetyThreshold(threshold: string): HarmBlockThreshold {
  switch (threshold) {
    case "block_none":
      return HarmBlockThreshold.BLOCK_NONE;
    case "block_few":
      return HarmBlockThreshold.BLOCK_LOW_AND_ABOVE;
    case "block_some":
      return HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE;
    case "block_most":
      return HarmBlockThreshold.BLOCK_ONLY_HIGH;
    default:
      return HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE;
  }
}

function createSafetySettings(
  config: z.infer<typeof SafetySettingsSchema>,
): SafetySetting[] {
  return [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: mapSafetyThreshold(config.harassment),
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: mapSafetyThreshold(config.hateSpeech),
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: mapSafetyThreshold(config.sexuallyExplicit),
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: mapSafetyThreshold(config.dangerousContent),
    },
  ];
}

function createGenerationConfig(
  config: z.infer<typeof geminiConfigSchema>,
): GenerationConfig {
  return {
    temperature: config.temperature,
    topP: config.topP,
    topK: config.topK,
    maxOutputTokens: config.maxTokens,
    stopSequences: config.stopSequences,
    candidateCount: config.candidateCount,
  };
}

async function withRetry<T>(
  operation: () => Promise<T>,
  retryConfig: z.infer<typeof RetryConfigSchema>,
  logs: string[],
): Promise<T> {
  let lastError: Error;
  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      logs.push(`Attempt ${attempt + 1} failed: ${lastError.message}`);
      if (attempt < retryConfig.maxRetries) {
        await new Promise((resolve) =>
          setTimeout(resolve, retryConfig.backoffMs * (attempt + 1)),
        );
      }
    }
  }
  throw lastError!;
}

// Main Gemini node definition
const geminiNode: NodeDefinition = {
  id: "google-gemini",
  type: "ai-google-gemini",
  name: "Google Gemini",
  description:
    "Advanced AI reasoning using Google Gemini models with comprehensive functionality",
  category: "ai",
  icon: "🤖",
  color: "#4285F4",

  configSchema: geminiConfigSchema,

  inputs: [
    {
      id: "data",
      label: "Input Data",
      type: "object",
      required: true,
      description: "Input data varies based on selected action",
    },
  ],

  outputs: [
    {
      id: "result",
      label: "Result",
      type: "object",
      description: "Output data varies based on selected action",
    },
    {
      id: "usage",
      label: "Usage Stats",
      type: "object",
      description: "Token usage and metadata",
    },
    {
      id: "candidates",
      label: "All Candidates",
      type: "array",
      description: "All generated candidates if multiple",
    },
  ],

  validation: {
    input: z.object({
      data: z.record(z.any()),
    }),
    output: z.object({
      result: z.record(z.any()),
      usage: z
        .object({
          promptTokenCount: z.number().optional(),
          candidatesTokenCount: z.number().optional(),
          totalTokenCount: z.number().optional(),
        })
        .optional(),
      candidates: z.array(z.record(z.any())).optional(),
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

      logs.push(
        `Initializing Google Gemini AI client for action: ${config.action}`,
      );

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: config.model,
        generationConfig: createGenerationConfig(config),
        safetySettings: config.safetySettings
          ? createSafetySettings(config.safetySettings)
          : undefined,
        systemInstruction: config.systemPrompt,
        // Note: Grounding with Google Search requires additional setup
        // ...(config.action === "groundingWithGoogleSearch" && {
        //   tools: [{ googleSearch: {} }],
        // }),
      });

      let result: any = {};
      let usage: any = {};
      let candidates: any[] = [];

      // Handle different actions
      switch (config.action) {
        case "generateText": {
          const validatedInput = generateTextInputSchema.parse(input.data);
          let prompt = validatedInput.prompt;
          if (validatedInput.context) {
            prompt = `Context: ${JSON.stringify(validatedInput.context)}\n\n${prompt}`;
          }

          const response = await withRetry(
            () => model.generateContent(prompt),
            config.retry || { maxRetries: 3, backoffMs: 1000 },
            logs,
          );

          const text = response.response.text();
          usage = response.response.usageMetadata;
          candidates =
            response.response.candidates?.map((c) => ({
              text: c.content.parts[0].text,
            })) || [];

          result = {
            text,
            finishReason: response.response.candidates?.[0]?.finishReason,
          };
          break;
        }

        case "sendChatMessage": {
          const validatedInput = sendChatMessageInputSchema.parse(input.data);
          const chat = model.startChat();

          // Add message history
          for (const msg of validatedInput.messages.slice(0, -1)) {
            await chat.sendMessage(msg.content);
          }

          const lastMessage =
            validatedInput.messages[validatedInput.messages.length - 1];
          const response = await withRetry(
            () => chat.sendMessage(lastMessage.content),
            config.retry || { maxRetries: 3, backoffMs: 1000 },
            logs,
          );

          const text = response.response.text();
          usage = response.response.usageMetadata;
          candidates =
            response.response.candidates?.map((c) => ({
              text: c.content.parts[0].text,
            })) || [];

          result = {
            text,
            finishReason: response.response.candidates?.[0]?.finishReason,
          };
          break;
        }

        case "analyzeImage": {
          const validatedInput = analyzeImageInputSchema.parse(input.data);
          const parts: Part[] = [{ text: validatedInput.prompt }];

          if (typeof validatedInput.image === "string") {
            parts.push({
              inlineData: {
                mimeType: "image/jpeg", // Assume JPEG, could detect
                data: validatedInput.image,
              },
            });
          } else {
            parts.push({
              fileData: {
                mimeType: "image/jpeg",
                fileUri: validatedInput.image.url,
              },
            });
          }

          const response = await withRetry(
            () => model.generateContent(parts),
            config.retry || { maxRetries: 3, backoffMs: 1000 },
            logs,
          );

          const text = response.response.text();
          usage = response.response.usageMetadata;
          candidates =
            response.response.candidates?.map((c) => ({
              text: c.content.parts[0].text,
            })) || [];

          result = {
            text,
            finishReason: response.response.candidates?.[0]?.finishReason,
          };
          break;
        }

        case "generateJson": {
          const validatedInput = generateJsonInputSchema.parse(input.data);
          const prompt = `${validatedInput.prompt}\n\nReturn the result as valid JSON matching this schema: ${JSON.stringify(validatedInput.schema)}`;

          const response = await withRetry(
            () => model.generateContent(prompt),
            config.retry || { maxRetries: 3, backoffMs: 1000 },
            logs,
          );

          const text = response.response.text();
          usage = response.response.usageMetadata;
          candidates =
            response.response.candidates?.map((c) => ({
              text: c.content.parts[0].text,
            })) || [];

          try {
            const parsedJson = JSON.parse(text);
            result = {
              json: parsedJson,
              text,
              finishReason: response.response.candidates?.[0]?.finishReason,
            };
          } catch (e) {
            result = {
              text,
              parseError: "Failed to parse JSON",
              finishReason: response.response.candidates?.[0]?.finishReason,
            };
          }
          break;
        }

        case "countTokens": {
          const validatedInput = countTokensInputSchema.parse(input.data);
          const countModel = validatedInput.model
            ? genAI.getGenerativeModel({ model: validatedInput.model })
            : model;
          const { totalTokens } = await countModel.countTokens(
            validatedInput.text,
          );
          result = { tokenCount: totalTokens };
          break;
        }

        case "createEmbedding": {
          const validatedInput = createEmbeddingInputSchema.parse(input.data);
          const embeddingModel = genAI.getGenerativeModel({
            model: "text-embedding-004",
          });
          const resultEmbed = await embeddingModel.embedContent(
            validatedInput.text,
          );
          result = { embedding: resultEmbed.embedding.values };
          break;
        }

        case "summarizeContent": {
          const validatedInput = summarizeContentInputSchema.parse(input.data);
          const prompt = `Please summarize the following content${validatedInput.maxLength ? ` in at most ${validatedInput.maxLength} words` : ""}:\n\n${validatedInput.content}`;

          const response = await withRetry(
            () => model.generateContent(prompt),
            config.retry || { maxRetries: 3, backoffMs: 1000 },
            logs,
          );

          const text = response.response.text();
          usage = response.response.usageMetadata;
          candidates =
            response.response.candidates?.map((c) => ({
              text: c.content.parts[0].text,
            })) || [];

          result = {
            summary: text,
            finishReason: response.response.candidates?.[0]?.finishReason,
          };
          break;
        }

        case "classifyText": {
          const validatedInput = classifyTextInputSchema.parse(input.data);
          const prompt = `Classify the following text into one of these categories: ${validatedInput.categories.join(", ")}\n\nText: ${validatedInput.text}\n\nReturn only the category name.`;

          const response = await withRetry(
            () => model.generateContent(prompt),
            config.retry || { maxRetries: 3, backoffMs: 1000 },
            logs,
          );

          const text = response.response.text().trim();
          usage = response.response.usageMetadata;
          candidates =
            response.response.candidates?.map((c) => ({
              text: c.content.parts[0].text,
            })) || [];

          result = {
            category: text,
            finishReason: response.response.candidates?.[0]?.finishReason,
          };
          break;
        }

        case "extractStructuredData": {
          const validatedInput = extractStructuredDataInputSchema.parse(
            input.data,
          );
          const prompt = `Extract the following fields from the text: ${validatedInput.fields.join(", ")}\n\nText: ${validatedInput.text}\n\nReturn as JSON.`;

          const response = await withRetry(
            () => model.generateContent(prompt),
            config.retry || { maxRetries: 3, backoffMs: 1000 },
            logs,
          );

          const text = response.response.text();
          usage = response.response.usageMetadata;
          candidates =
            response.response.candidates?.map((c) => ({
              text: c.content.parts[0].text,
            })) || [];

          try {
            const extracted = JSON.parse(text);
            result = {
              data: extracted,
              finishReason: response.response.candidates?.[0]?.finishReason,
            };
          } catch (e) {
            result = {
              text,
              parseError: "Failed to parse extracted data",
              finishReason: response.response.candidates?.[0]?.finishReason,
            };
          }
          break;
        }

        case "translateText": {
          const validatedInput = translateTextInputSchema.parse(input.data);
          const sourceLang = validatedInput.sourceLanguage
            ? ` from ${validatedInput.sourceLanguage}`
            : "";
          const prompt = `Translate the following text to ${validatedInput.targetLanguage}${sourceLang}:\n\n${validatedInput.text}`;

          const response = await withRetry(
            () => model.generateContent(prompt),
            config.retry || { maxRetries: 3, backoffMs: 1000 },
            logs,
          );

          const text = response.response.text();
          usage = response.response.usageMetadata;
          candidates =
            response.response.candidates?.map((c) => ({
              text: c.content.parts[0].text,
            })) || [];

          result = {
            translation: text,
            finishReason: response.response.candidates?.[0]?.finishReason,
          };
          break;
        }

        case "textToSpeech": {
          // Note: Gemini doesn't directly support TTS, this would require a different API
          logs.push(
            "Text-to-Speech not directly supported by Gemini API - would need Google Cloud Text-to-Speech API",
          );
          throw new Error(
            "Text-to-Speech functionality requires Google Cloud Text-to-Speech API integration",
          );
        }

        case "generateImage": {
          // Note: Imagen is a separate API
          logs.push("Image generation requires Imagen API integration");
          throw new Error(
            "Image generation requires separate Imagen API integration",
          );
        }

        case "generateVideo": {
          // Note: Veo is a separate API
          logs.push("Video generation requires Veo API integration");
          throw new Error(
            "Video generation requires separate Veo API integration",
          );
        }

        case "analyzeVideo": {
          const validatedInput = analyzeVideoInputSchema.parse(input.data);
          const parts: Part[] = [{ text: validatedInput.prompt }];

          if (typeof validatedInput.video === "string") {
            parts.push({
              inlineData: {
                mimeType: "video/mp4", // Assume MP4
                data: validatedInput.video,
              },
            });
          } else {
            parts.push({
              fileData: {
                mimeType: "video/mp4",
                fileUri: validatedInput.video.url,
              },
            });
          }

          const response = await withRetry(
            () => model.generateContent(parts),
            config.retry || { maxRetries: 3, backoffMs: 1000 },
            logs,
          );

          const text = response.response.text();
          usage = response.response.usageMetadata;
          candidates =
            response.response.candidates?.map((c) => ({
              text: c.content.parts[0].text,
            })) || [];

          result = {
            analysis: text,
            finishReason: response.response.candidates?.[0]?.finishReason,
          };
          break;
        }

        case "analyzeAudio": {
          const validatedInput = analyzeAudioInputSchema.parse(input.data);
          const parts: Part[] = [{ text: validatedInput.prompt }];

          if (typeof validatedInput.audio === "string") {
            parts.push({
              inlineData: {
                mimeType: "audio/wav", // Assume WAV
                data: validatedInput.audio,
              },
            });
          } else {
            parts.push({
              fileData: {
                mimeType: "audio/wav",
                fileUri: validatedInput.audio.url,
              },
            });
          }

          const response = await withRetry(
            () => model.generateContent(parts),
            config.retry || { maxRetries: 3, backoffMs: 1000 },
            logs,
          );

          const text = response.response.text();
          usage = response.response.usageMetadata;
          candidates =
            response.response.candidates?.map((c) => ({
              text: c.content.parts[0].text,
            })) || [];

          result = {
            analysis: text,
            finishReason: response.response.candidates?.[0]?.finishReason,
          };
          break;
        }

        case "codeGeneration": {
          const validatedInput = codeGenerationInputSchema.parse(input.data);
          const prompt = `Generate ${validatedInput.language} code for the following requirement:\n\n${validatedInput.description}\n\nProvide only the code without explanation.`;

          const response = await withRetry(
            () => model.generateContent(prompt),
            config.retry || { maxRetries: 3, backoffMs: 1000 },
            logs,
          );

          const text = response.response.text();
          usage = response.response.usageMetadata;
          candidates =
            response.response.candidates?.map((c) => ({
              text: c.content.parts[0].text,
            })) || [];

          result = {
            code: text,
            language: validatedInput.language,
            finishReason: response.response.candidates?.[0]?.finishReason,
          };
          break;
        }

        case "codeExecution": {
          // Note: Gemini has code execution capabilities, but it's not directly exposed in the SDK
          logs.push("Code execution requires specialized setup");
          throw new Error(
            "Code execution functionality requires additional setup",
          );
        }

        case "functionCalling": {
          const validatedInput = functionCallingInputSchema.parse(input.data);
          const functions = validatedInput.functions.map((f) => ({
            name: f.name,
            description: f.description,
            parameters: {
              type: SchemaType.OBJECT,
              properties: f.parameters,
            },
          }));

          const modelWithFunctions = genAI.getGenerativeModel({
            model: config.model,
            generationConfig: createGenerationConfig(config),
            safetySettings: config.safetySettings
              ? createSafetySettings(config.safetySettings)
              : undefined,
            systemInstruction: config.systemPrompt,
            tools: [{ functionDeclarations: functions }],
          });

          const response = await withRetry(
            () => modelWithFunctions.generateContent(validatedInput.prompt),
            config.retry || { maxRetries: 3, backoffMs: 1000 },
            logs,
          );

          const functionCalls = response.response.functionCalls?.() || [];
          usage = response.response.usageMetadata;
          candidates =
            response.response.candidates?.map((c) => ({
              text: c.content.parts[0]?.text || "",
            })) || [];

          result = {
            functionCalls,
            finishReason: response.response.candidates?.[0]?.finishReason,
          };
          break;
        }

        case "groundingWithGoogleSearch": {
          const validatedInput = groundingWithGoogleSearchInputSchema.parse(
            input.data,
          );
          const response = await withRetry(
            () => model.generateContent(validatedInput.prompt),
            config.retry || { maxRetries: 3, backoffMs: 1000 },
            logs,
          );

          const text = response.response.text();
          usage = response.response.usageMetadata;
          candidates =
            response.response.candidates?.map((c) => ({
              text: c.content.parts[0].text,
            })) || [];

          result = {
            text,
            finishReason: response.response.candidates?.[0]?.finishReason,
          };
          break;
        }

        default:
          throw new Error(`Unsupported action: ${config.action}`);
      }

      logs.push(`Action ${config.action} completed successfully`);

      return {
        success: true,
        output: {
          result,
          usage,
          candidates,
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
