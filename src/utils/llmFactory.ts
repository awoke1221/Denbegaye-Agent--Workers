/**
 * LLM Factory
 * Manages different LLM providers (OpenAI, Gemini, Anthropic, etc.)
 */

import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatAnthropic } from "@langchain/anthropic";
import { logger } from "./logger";

export type BaseChatModel = any;

export interface LLMConfig {
  provider: "openai" | "gemini" | "anthropic" | "deepseek" | "groq";
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
}

/**
 * LLM Factory for creating LLM instances
 */
export class LLMFactory {
  private cache: Map<string, BaseChatModel> = new Map();

  /**
   * Create or get an LLM instance
   */
  createLLM(config: LLMConfig): BaseChatModel {
    const cacheKey = `${config.provider}-${config.model || "default"}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    let llm: BaseChatModel;

    switch (config.provider) {
      case "openai":
        llm = new ChatOpenAI({
          apiKey: config.apiKey,
          modelName: config.model || "gpt-4-turbo",
          temperature: config.temperature ?? 0.7,
          maxTokens: config.maxTokens,
          streaming: config.streaming ?? false,
        });
        break;

      case "gemini":
        llm = new ChatGoogleGenerativeAI({
          apiKey: config.apiKey,
          model: config.model || "gemini-2.5-flash",
          temperature: config.temperature ?? 0.7,
          maxOutputTokens: config.maxTokens,
          streaming: config.streaming ?? false,
        } as any);
        break;

      case "anthropic":
        llm = new ChatAnthropic({
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
        logger.info(`Using fallback for ${config.provider}`);
        llm = new ChatOpenAI({
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
    logger.debug(`LLM created: ${cacheKey}`);

    return llm;
  }

  /**
   * Get LLM from API keys
   */
  getLLMFromApiKeys(
    apiKeys: Record<string, string>,
    provider?: string,
  ): BaseChatModel {
    // Try to determine provider
    let selectedProvider: string = provider || "openai";

    if (!provider) {
      if (apiKeys.openai_api_key) selectedProvider = "openai";
      else if (apiKeys.gemini_api_key) selectedProvider = "gemini";
      else if (apiKeys.anthropic_api_key) selectedProvider = "anthropic";
      else throw new Error("No valid API key found");
    }

    const apiKeyMap: Record<string, string> = {
      openai: apiKeys.openai_api_key || apiKeys.OPENAI_API_KEY || "",
      gemini:
        apiKeys.gemini_api_key ||
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
      provider: selectedProvider as LLMConfig["provider"],
      apiKey,
      streaming: true,
    });
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get all cached LLMs
   */
  getCachedLLMs(): Map<string, BaseChatModel> {
    return new Map(this.cache);
  }
}

/**
 * Global LLM Factory instance
 */
export const llmFactory = new LLMFactory();
