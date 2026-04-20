"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.geminiNode = void 0;
const zod_1 = require("zod");
const generative_ai_1 = require("@google/generative-ai");
// Action types for Gemini node
const GeminiAction = zod_1.z.enum([
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
const SafetySettingsSchema = zod_1.z.object({
    harassment: zod_1.z
        .enum(["block_none", "block_few", "block_some", "block_most"])
        .default("block_some"),
    hateSpeech: zod_1.z
        .enum(["block_none", "block_few", "block_some", "block_most"])
        .default("block_some"),
    sexuallyExplicit: zod_1.z
        .enum(["block_none", "block_few", "block_some", "block_most"])
        .default("block_some"),
    dangerousContent: zod_1.z
        .enum(["block_none", "block_few", "block_some", "block_most"])
        .default("block_some"),
});
// Retry configuration
const RetryConfigSchema = zod_1.z.object({
    maxRetries: zod_1.z.number().min(0).max(10).default(3),
    backoffMs: zod_1.z.number().min(100).max(10000).default(1000),
});
// Gemini configuration schema
const geminiConfigSchema = zod_1.z.object({
    action: GeminiAction,
    model: zod_1.z
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
    temperature: zod_1.z.number().min(0).max(2).default(0.7),
    topP: zod_1.z.number().min(0).max(1).optional(),
    topK: zod_1.z.number().min(1).max(100).optional(),
    maxTokens: zod_1.z.number().min(1).max(8192).default(2048),
    stopSequences: zod_1.z.array(zod_1.z.string()).optional(),
    candidateCount: zod_1.z.number().min(1).max(8).default(1),
    safetySettings: SafetySettingsSchema.optional(),
    systemPrompt: zod_1.z.string().optional(),
    apiKey: zod_1.z.string().optional(),
    retry: RetryConfigSchema.optional(),
    timeout: zod_1.z.number().min(1000).max(300000).default(30000), // 30 seconds
    logging: zod_1.z
        .object({
        level: zod_1.z.enum(["debug", "info", "warn", "error"]).default("info"),
        metadata: zod_1.z.record(zod_1.z.any()).optional(),
    })
        .optional(),
});
// Input schemas for different actions
const generateTextInputSchema = zod_1.z.object({
    prompt: zod_1.z.string().min(1),
    context: zod_1.z.record(zod_1.z.any()).optional(),
});
const sendChatMessageInputSchema = zod_1.z.object({
    messages: zod_1.z
        .array(zod_1.z.object({
        role: zod_1.z.enum(["user", "model"]),
        content: zod_1.z.string(),
    }))
        .min(1),
    context: zod_1.z.record(zod_1.z.any()).optional(),
});
const analyzeImageInputSchema = zod_1.z.object({
    prompt: zod_1.z.string().min(1),
    image: zod_1.z.union([
        zod_1.z.string(), // base64
        zod_1.z.object({ url: zod_1.z.string() }), // URL
    ]),
    context: zod_1.z.record(zod_1.z.any()).optional(),
});
const generateJsonInputSchema = zod_1.z.object({
    prompt: zod_1.z.string().min(1),
    schema: zod_1.z.record(zod_1.z.any()), // JSON schema for structured output
    context: zod_1.z.record(zod_1.z.any()).optional(),
});
const countTokensInputSchema = zod_1.z.object({
    text: zod_1.z.string().min(1),
    model: zod_1.z.string().optional(), // Override model for counting
});
const createEmbeddingInputSchema = zod_1.z.object({
    text: zod_1.z.string().min(1),
});
const summarizeContentInputSchema = zod_1.z.object({
    content: zod_1.z.string().min(1),
    maxLength: zod_1.z.number().optional(),
    context: zod_1.z.record(zod_1.z.any()).optional(),
});
const classifyTextInputSchema = zod_1.z.object({
    text: zod_1.z.string().min(1),
    categories: zod_1.z.array(zod_1.z.string()).min(1),
    context: zod_1.z.record(zod_1.z.any()).optional(),
});
const extractStructuredDataInputSchema = zod_1.z.object({
    text: zod_1.z.string().min(1),
    fields: zod_1.z.array(zod_1.z.string()).min(1),
    context: zod_1.z.record(zod_1.z.any()).optional(),
});
const translateTextInputSchema = zod_1.z.object({
    text: zod_1.z.string().min(1),
    targetLanguage: zod_1.z.string().min(1),
    sourceLanguage: zod_1.z.string().optional(),
    context: zod_1.z.record(zod_1.z.any()).optional(),
});
const textToSpeechInputSchema = zod_1.z.object({
    text: zod_1.z.string().min(1),
    voice: zod_1.z.enum(["male", "female"]).default("female"),
    speed: zod_1.z.number().min(0.5).max(2).default(1),
});
const generateImageInputSchema = zod_1.z.object({
    prompt: zod_1.z.string().min(1),
    aspectRatio: zod_1.z.enum(["1:1", "4:3", "16:9", "3:4", "9:16"]).default("1:1"),
    style: zod_1.z.enum(["natural", "vivid"]).default("natural"),
    negativePrompt: zod_1.z.string().optional(),
});
const generateVideoInputSchema = zod_1.z.object({
    prompt: zod_1.z.string().min(1),
    duration: zod_1.z.enum(["5s", "8s"]).default("5s"),
    resolution: zod_1.z.enum(["720p", "1080p"]).default("720p"),
    image: zod_1.z
        .union([
        zod_1.z.string(), // base64
        zod_1.z.object({ url: zod_1.z.string() }), // URL
    ])
        .optional(),
});
const analyzeVideoInputSchema = zod_1.z.object({
    prompt: zod_1.z.string().min(1),
    video: zod_1.z.union([
        zod_1.z.string(), // base64
        zod_1.z.object({ url: zod_1.z.string() }), // URL
    ]),
    context: zod_1.z.record(zod_1.z.any()).optional(),
});
const analyzeAudioInputSchema = zod_1.z.object({
    prompt: zod_1.z.string().min(1),
    audio: zod_1.z.union([
        zod_1.z.string(), // base64
        zod_1.z.object({ url: zod_1.z.string() }), // URL
    ]),
    context: zod_1.z.record(zod_1.z.any()).optional(),
});
const codeGenerationInputSchema = zod_1.z.object({
    description: zod_1.z.string().min(1),
    language: zod_1.z.string().min(1),
    context: zod_1.z.record(zod_1.z.any()).optional(),
});
const codeExecutionInputSchema = zod_1.z.object({
    code: zod_1.z.string().min(1),
    language: zod_1.z.string().min(1),
    inputs: zod_1.z.record(zod_1.z.any()).optional(),
});
const functionCallingInputSchema = zod_1.z.object({
    prompt: zod_1.z.string().min(1),
    functions: zod_1.z
        .array(zod_1.z.object({
        name: zod_1.z.string(),
        description: zod_1.z.string(),
        parameters: zod_1.z.record(zod_1.z.any()),
    }))
        .min(1),
    context: zod_1.z.record(zod_1.z.any()).optional(),
});
const groundingWithGoogleSearchInputSchema = zod_1.z.object({
    prompt: zod_1.z.string().min(1),
    context: zod_1.z.record(zod_1.z.any()).optional(),
});
// Utility functions
function mapSafetyThreshold(threshold) {
    switch (threshold) {
        case "block_none":
            return generative_ai_1.HarmBlockThreshold.BLOCK_NONE;
        case "block_few":
            return generative_ai_1.HarmBlockThreshold.BLOCK_LOW_AND_ABOVE;
        case "block_some":
            return generative_ai_1.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE;
        case "block_most":
            return generative_ai_1.HarmBlockThreshold.BLOCK_ONLY_HIGH;
        default:
            return generative_ai_1.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE;
    }
}
function createSafetySettings(config) {
    return [
        {
            category: generative_ai_1.HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: mapSafetyThreshold(config.harassment),
        },
        {
            category: generative_ai_1.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: mapSafetyThreshold(config.hateSpeech),
        },
        {
            category: generative_ai_1.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: mapSafetyThreshold(config.sexuallyExplicit),
        },
        {
            category: generative_ai_1.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: mapSafetyThreshold(config.dangerousContent),
        },
    ];
}
function createGenerationConfig(config) {
    return {
        temperature: config.temperature,
        topP: config.topP,
        topK: config.topK,
        maxOutputTokens: config.maxTokens,
        stopSequences: config.stopSequences,
        candidateCount: config.candidateCount,
    };
}
async function withRetry(operation, retryConfig, logs) {
    let lastError;
    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
        try {
            return await operation();
        }
        catch (error) {
            lastError = error;
            logs.push(`Attempt ${attempt + 1} failed: ${lastError.message}`);
            if (attempt < retryConfig.maxRetries) {
                await new Promise((resolve) => setTimeout(resolve, retryConfig.backoffMs * (attempt + 1)));
            }
        }
    }
    throw lastError;
}
// Main Gemini node definition
const geminiNode = {
    id: "google-gemini",
    type: "ai-google-gemini",
    name: "Google Gemini",
    description: "Advanced AI reasoning using Google Gemini models with comprehensive functionality",
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
        input: zod_1.z.object({
            data: zod_1.z.record(zod_1.z.any()),
        }),
        output: zod_1.z.object({
            result: zod_1.z.record(zod_1.z.any()),
            usage: zod_1.z
                .object({
                promptTokenCount: zod_1.z.number().optional(),
                candidatesTokenCount: zod_1.z.number().optional(),
                totalTokenCount: zod_1.z.number().optional(),
            })
                .optional(),
            candidates: zod_1.z.array(zod_1.z.record(zod_1.z.any())).optional(),
        }),
    },
    handler: async (context) => {
        const startTime = Date.now();
        const logs = [];
        try {
            const config = geminiConfigSchema.parse(context.config);
            const input = context.validation.input.parse(context.input);
            const apiKey = config.apiKey || context.apiKeys.gemini;
            if (!apiKey) {
                throw new Error("Google Gemini API key not provided");
            }
            logs.push(`Initializing Google Gemini AI client for action: ${config.action}`);
            const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
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
            let result = {};
            let usage = {};
            let candidates = [];
            // Handle different actions
            switch (config.action) {
                case "generateText": {
                    const validatedInput = generateTextInputSchema.parse(input.data);
                    let prompt = validatedInput.prompt;
                    if (validatedInput.context) {
                        prompt = `Context: ${JSON.stringify(validatedInput.context)}\n\n${prompt}`;
                    }
                    const response = await withRetry(() => model.generateContent(prompt), config.retry || { maxRetries: 3, backoffMs: 1000 }, logs);
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
                    const lastMessage = validatedInput.messages[validatedInput.messages.length - 1];
                    const response = await withRetry(() => chat.sendMessage(lastMessage.content), config.retry || { maxRetries: 3, backoffMs: 1000 }, logs);
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
                    const parts = [{ text: validatedInput.prompt }];
                    if (typeof validatedInput.image === "string") {
                        parts.push({
                            inlineData: {
                                mimeType: "image/jpeg", // Assume JPEG, could detect
                                data: validatedInput.image,
                            },
                        });
                    }
                    else {
                        parts.push({
                            fileData: {
                                mimeType: "image/jpeg",
                                fileUri: validatedInput.image.url,
                            },
                        });
                    }
                    const response = await withRetry(() => model.generateContent(parts), config.retry || { maxRetries: 3, backoffMs: 1000 }, logs);
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
                    const response = await withRetry(() => model.generateContent(prompt), config.retry || { maxRetries: 3, backoffMs: 1000 }, logs);
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
                    }
                    catch (e) {
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
                    const { totalTokens } = await countModel.countTokens(validatedInput.text);
                    result = { tokenCount: totalTokens };
                    break;
                }
                case "createEmbedding": {
                    const validatedInput = createEmbeddingInputSchema.parse(input.data);
                    const embeddingModel = genAI.getGenerativeModel({
                        model: "text-embedding-004",
                    });
                    const resultEmbed = await embeddingModel.embedContent(validatedInput.text);
                    result = { embedding: resultEmbed.embedding.values };
                    break;
                }
                case "summarizeContent": {
                    const validatedInput = summarizeContentInputSchema.parse(input.data);
                    const prompt = `Please summarize the following content${validatedInput.maxLength ? ` in at most ${validatedInput.maxLength} words` : ""}:\n\n${validatedInput.content}`;
                    const response = await withRetry(() => model.generateContent(prompt), config.retry || { maxRetries: 3, backoffMs: 1000 }, logs);
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
                    const response = await withRetry(() => model.generateContent(prompt), config.retry || { maxRetries: 3, backoffMs: 1000 }, logs);
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
                    const validatedInput = extractStructuredDataInputSchema.parse(input.data);
                    const prompt = `Extract the following fields from the text: ${validatedInput.fields.join(", ")}\n\nText: ${validatedInput.text}\n\nReturn as JSON.`;
                    const response = await withRetry(() => model.generateContent(prompt), config.retry || { maxRetries: 3, backoffMs: 1000 }, logs);
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
                    }
                    catch (e) {
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
                    const response = await withRetry(() => model.generateContent(prompt), config.retry || { maxRetries: 3, backoffMs: 1000 }, logs);
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
                    logs.push("Text-to-Speech not directly supported by Gemini API - would need Google Cloud Text-to-Speech API");
                    throw new Error("Text-to-Speech functionality requires Google Cloud Text-to-Speech API integration");
                }
                case "generateImage": {
                    // Note: Imagen is a separate API
                    logs.push("Image generation requires Imagen API integration");
                    throw new Error("Image generation requires separate Imagen API integration");
                }
                case "generateVideo": {
                    // Note: Veo is a separate API
                    logs.push("Video generation requires Veo API integration");
                    throw new Error("Video generation requires separate Veo API integration");
                }
                case "analyzeVideo": {
                    const validatedInput = analyzeVideoInputSchema.parse(input.data);
                    const parts = [{ text: validatedInput.prompt }];
                    if (typeof validatedInput.video === "string") {
                        parts.push({
                            inlineData: {
                                mimeType: "video/mp4", // Assume MP4
                                data: validatedInput.video,
                            },
                        });
                    }
                    else {
                        parts.push({
                            fileData: {
                                mimeType: "video/mp4",
                                fileUri: validatedInput.video.url,
                            },
                        });
                    }
                    const response = await withRetry(() => model.generateContent(parts), config.retry || { maxRetries: 3, backoffMs: 1000 }, logs);
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
                    const parts = [{ text: validatedInput.prompt }];
                    if (typeof validatedInput.audio === "string") {
                        parts.push({
                            inlineData: {
                                mimeType: "audio/wav", // Assume WAV
                                data: validatedInput.audio,
                            },
                        });
                    }
                    else {
                        parts.push({
                            fileData: {
                                mimeType: "audio/wav",
                                fileUri: validatedInput.audio.url,
                            },
                        });
                    }
                    const response = await withRetry(() => model.generateContent(parts), config.retry || { maxRetries: 3, backoffMs: 1000 }, logs);
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
                    const response = await withRetry(() => model.generateContent(prompt), config.retry || { maxRetries: 3, backoffMs: 1000 }, logs);
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
                    throw new Error("Code execution functionality requires additional setup");
                }
                case "functionCalling": {
                    const validatedInput = functionCallingInputSchema.parse(input.data);
                    const functions = validatedInput.functions.map((f) => ({
                        name: f.name,
                        description: f.description,
                        parameters: {
                            type: generative_ai_1.SchemaType.OBJECT,
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
                    const response = await withRetry(() => modelWithFunctions.generateContent(validatedInput.prompt), config.retry || { maxRetries: 3, backoffMs: 1000 }, logs);
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
                    const validatedInput = groundingWithGoogleSearchInputSchema.parse(input.data);
                    const response = await withRetry(() => model.generateContent(validatedInput.prompt), config.retry || { maxRetries: 3, backoffMs: 1000 }, logs);
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
        }
        catch (error) {
            logs.push(`Error in Gemini node: ${error instanceof Error ? error.message : String(error)}`);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                logs,
                executionTime: Date.now() - startTime,
            };
        }
    },
};
exports.geminiNode = geminiNode;
