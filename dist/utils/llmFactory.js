"use strict";
/**
 * LLM Factory
 * Manages different LLM providers (OpenAI, Gemini, Anthropic, etc.)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.llmFactory = exports.LLMFactory = void 0;
const openai_1 = require("@langchain/openai");
const google_genai_1 = require("@langchain/google-genai");
const anthropic_1 = require("@langchain/anthropic");
const logger_1 = require("./logger");
/**
 * LLM Factory for creating LLM instances
 */
class LLMFactory {
    constructor() {
        this.cache = new Map();
    }
    /**
     * Create or get an LLM instance
     */
    createLLM(config) {
        const cacheKey = `${config.provider}-${config.model || "default"}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        let llm;
        switch (config.provider) {
            case "openai":
                llm = new openai_1.ChatOpenAI({
                    apiKey: config.apiKey,
                    modelName: config.model || "gpt-4-turbo",
                    temperature: config.temperature ?? 0.7,
                    maxTokens: config.maxTokens,
                    streaming: config.streaming ?? false,
                });
                break;
            case "gemini":
                llm = new google_genai_1.ChatGoogleGenerativeAI({
                    apiKey: config.apiKey,
                    model: config.model || "gemini-pro",
                    temperature: config.temperature ?? 0.7,
                    maxOutputTokens: config.maxTokens,
                    streaming: config.streaming ?? false,
                });
                break;
            case "anthropic":
                llm = new anthropic_1.ChatAnthropic({
                    apiKey: config.apiKey,
                    modelName: config.model || "claude-3-opus-20240229",
                    temperature: config.temperature ?? 0.7,
                    maxTokens: config.maxTokens,
                    streaming: config.streaming ?? false,
                });
                break;
            case "deepseek":
            case "groq":
                // Fallback to OpenAI-compatible format
                logger_1.logger.info(`Using fallback for ${config.provider}`);
                llm = new openai_1.ChatOpenAI({
                    apiKey: config.apiKey,
                    modelName: config.model || "default",
                    temperature: config.temperature ?? 0.7,
                    maxTokens: config.maxTokens,
                    streaming: config.streaming ?? false,
                });
                break;
            default:
                throw new Error(`Unsupported LLM provider: ${config.provider}`);
        }
        this.cache.set(cacheKey, llm);
        logger_1.logger.debug(`LLM created: ${cacheKey}`);
        return llm;
    }
    /**
     * Get LLM from API keys
     */
    getLLMFromApiKeys(apiKeys, provider) {
        // Try to determine provider
        let selectedProvider = provider || "openai";
        if (!provider) {
            if (apiKeys.openai_api_key)
                selectedProvider = "openai";
            else if (apiKeys.gemini_api_key)
                selectedProvider = "gemini";
            else if (apiKeys.anthropic_api_key)
                selectedProvider = "anthropic";
            else
                throw new Error("No valid API key found");
        }
        const apiKeyMap = {
            openai: apiKeys.openai_api_key || apiKeys.OPENAI_API_KEY || "",
            gemini: apiKeys.gemini_api_key ||
                apiKeys.GOOGLE_API_KEY ||
                apiKeys.GEMINI_API_KEY ||
                "",
            anthropic: apiKeys.anthropic_api_key || apiKeys.ANTHROPIC_API_KEY || "",
            deepseek: apiKeys.deepseek_api_key || apiKeys.DEEPSEEK_API_KEY || "",
            groq: apiKeys.groq_api_key || apiKeys.GROQ_API_KEY || "",
        };
        const apiKey = apiKeyMap[selectedProvider];
        if (!apiKey) {
            throw new Error(`No API key found for provider: ${selectedProvider}`);
        }
        return this.createLLM({
            provider: selectedProvider,
            apiKey,
            streaming: true,
        });
    }
    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
    }
    /**
     * Get all cached LLMs
     */
    getCachedLLMs() {
        return new Map(this.cache);
    }
}
exports.LLMFactory = LLMFactory;
/**
 * Global LLM Factory instance
 */
exports.llmFactory = new LLMFactory();
