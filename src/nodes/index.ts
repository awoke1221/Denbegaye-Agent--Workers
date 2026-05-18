// Built-in node registry for workflow execution
// This registry provides generic handlers for supported node types
// and enables LangGraph workflows to execute without falling back
// to no-op nodes for every unknown type.

import { HumanMessage } from "@langchain/core/messages";
import { Parser } from "expr-eval";
import { llmFactory } from "../utils/llmFactory";
import { logger } from "../utils/logger";
import { sendEmail, EmailOptions } from "../utils/emailService";
import { supabase } from "../utils/supabaseClient";
import { SupabaseMemorySystem } from "../utils/memorySystem";
import { SupabaseToolRegistry } from "../utils/toolRegistry";
import {
  GoogleGenerativeAI,
  SchemaType,
  FunctionCallingMode,
} from "@google/generative-ai";

const getProviderFromNodeType = (nodeType: string): string => {
  const type = nodeType.toLowerCase();
  if (type.includes("openai")) return "openai";
  if (type.includes("gemini")) return "gemini";
  if (type.includes("anthropic")) return "anthropic";
  if (type.includes("deepseek")) return "deepseek";
  if (type.includes("groq")) return "groq";
  return "openai"; // default
};

const normalizeNodeType = (type: string) =>
  type
    ?.toString()
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

const sanitizeExpression = (expression: any): string => {
  if (expression === undefined || expression === null) {
    return "";
  }
  const text = String(expression).trim();
  const match = text.match(/^\{\{(.+)\}\}$/);
  return match ? match[1].trim() : text;
};

const buildMemoryScope = (context: any): string => {
  return (
    context.agentId ||
    context.userId ||
    context.executionId ||
    "denbegaye"
  ).toString();
};

const parseToolList = (rawTools: any): string[] => {
  if (!rawTools) return [];
  if (Array.isArray(rawTools)) {
    return rawTools.map((tool) => String(tool).trim()).filter(Boolean);
  }

  if (typeof rawTools === "string") {
    return rawTools
      .split(/[,;\n]+/)
      .map((tool) => tool.trim())
      .filter(Boolean);
  }

  return [];
};

const parseToolCall = (
  output: string,
): { tool: string; params: any } | null => {
  if (!output) return null;

  const toolCallRegex = /TOOL_CALL\s*:\s*(\{[\s\S]*?\})(?![\s\S]*\{)/i;
  const jsonMatch = output.match(toolCallRegex);
  let payload: any = null;

  if (jsonMatch?.[1]) {
    try {
      payload = JSON.parse(jsonMatch[1]);
    } catch {
      // try to extract JSON-ish content manually
      const fallback = jsonMatch[1]
        .replace(/([a-z0-9A-Z_]+)\s*:/g, '"$1":')
        .replace(/'/g, '"');
      try {
        payload = JSON.parse(fallback);
      } catch {
        payload = null;
      }
    }
  }

  if (!payload || !payload.tool) {
    return null;
  }

  return {
    tool: String(payload.tool).trim(),
    params: payload.params || {},
  };
};

const loadRelevantMemory = async (
  context: any,
  query: string,
  limit = 5,
): Promise<string> => {
  try {
    const memorySystem = new SupabaseMemorySystem();
    const memoryScope = buildMemoryScope(context);
    const memories = await memorySystem.retrieve(query, limit, memoryScope);
    if (!memories || memories.length === 0) {
      return "";
    }
    return memories.map((memory) => `- ${memory.content}`).join("\n");
  } catch (error) {
    logger.warn("Memory retrieval failed", {
      error: error instanceof Error ? error.message : String(error),
      context: {
        agentId: context.agentId,
        userId: context.userId,
      },
    });
    return "";
  }
};

const storeAgentMemory = async (
  context: any,
  content: string,
  memoryType: string,
): Promise<string | null> => {
  try {
    const memorySystem = new SupabaseMemorySystem();
    const memoryScope = buildMemoryScope(context);
    const memoryId = await memorySystem.store({
      content,
      embedding: [],
      metadata: {
        agentId: context.agentId,
        userId: context.userId,
        executionId: context.executionId,
        type: memoryType || "semantic",
      },
      scope: memoryScope,
    });
    return memoryId;
  } catch (error) {
    logger.warn("Memory store failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

const callTool = async (toolName: string, params: any) => {
  const toolRegistry = new SupabaseToolRegistry();
  const tool = await toolRegistry.getTool(toolName);
  if (!tool) {
    throw new Error(`Tool ${toolName} not found`);
  }
  return await toolRegistry.executeTool(tool, params || {});
};

const evaluateExpression = (expression: any, context: any): any => {
  if (expression === undefined || expression === null || expression === "") {
    return context.input;
  }
  if (typeof expression !== "string") {
    return expression;
  }

  const sanitized = sanitizeExpression(expression);
  try {
    const parser = new Parser();
    const expr = parser.parse(sanitized);
    return expr.evaluate({
      input: context.input,
      variables: context.variables || {},
      previousOutputs: context.previousOutputs || {},
      config: context.config || {},
    });
  } catch (error) {
    logger.warn("Expression evaluation failed", {
      expression: sanitized,
      error: error instanceof Error ? error.message : String(error),
      nodeId: context.nodeId,
    });
    return sanitized;
  }
};

const buildSetVariables = (context: any, value: any): Record<string, any> => {
  if (
    context.config?.variables &&
    typeof context.config.variables === "object"
  ) {
    return context.config.variables;
  }

  const variableName =
    context.config?.variableName ||
    context.config?.variable ||
    context.config?.name ||
    context.config?.key;

  if (typeof variableName === "string" && variableName.length > 0) {
    return { [variableName]: value };
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  return { value };
};

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

const searchViaDuckDuckGo = async (
  query: string,
  maxResults: number,
): Promise<SearchResult[]> => {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const response = await fetch(url, {
    headers: { "User-Agent": "DenbegayeAgent/1.0" },
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo HTTP ${response.status}`);
  }

  const data = (await response.json()) as any;
  const results: SearchResult[] = [];

  if (data.AbstractText) {
    results.push({
      title: data.Heading || query,
      url: data.AbstractURL || "",
      snippet: data.AbstractText,
      source: data.AbstractSource || "DuckDuckGo",
    });
  }

  const topics = (data.RelatedTopics || []) as any[];
  for (const item of topics) {
    if (results.length >= maxResults) break;
    if (item.Text && item.FirstURL) {
      results.push({
        title: item.Text.split(" - ")[0] || item.Text.slice(0, 80),
        url: item.FirstURL,
        snippet: item.Text,
        source: new URL(item.FirstURL).hostname,
      });
    }
    if (item.Topics) {
      for (const sub of item.Topics as any[]) {
        if (results.length >= maxResults) break;
        if (sub.Text && sub.FirstURL) {
          results.push({
            title: sub.Text.split(" - ")[0] || sub.Text.slice(0, 80),
            url: sub.FirstURL,
            snippet: sub.Text,
            source: new URL(sub.FirstURL).hostname,
          });
        }
      }
    }
  }

  return results.slice(0, maxResults);
};

const searchViaSerpAPI = async (
  query: string,
  apiKey: string,
  maxResults: number,
): Promise<SearchResult[]> => {
  const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${encodeURIComponent(apiKey)}&num=${maxResults}&engine=google`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`SerpAPI HTTP ${response.status}`);
  }

  const data = (await response.json()) as any;
  return (data.organic_results || []).slice(0, maxResults).map((item: any) => ({
    title: item.title || "",
    url: item.link || "",
    snippet: item.snippet || "",
    source: item.displayed_link || "",
  }));
};

const searchViaBrave = async (
  query: string,
  apiKey: string,
  maxResults: number,
): Promise<SearchResult[]> => {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`;
  const response = await fetch(url, {
    headers: {
      "X-Subscription-Token": apiKey,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Brave Search HTTP ${response.status}`);
  }

  const data = (await response.json()) as any;
  return (data.web?.results || []).slice(0, maxResults).map((item: any) => ({
    title: item.title || "",
    url: item.url || "",
    snippet: item.description || "",
    source: item.meta_url?.netloc || "",
  }));
};

const webSearchHandler = async (context: any) => {
  const query =
    context.config?.query ||
    context.input?.query ||
    context.input?.text ||
    context.input?.output?.text ||
    "";
  const provider = (context.config?.provider || "duckduckgo").toString();
  const maxResults = Number(context.config?.maxResults) || 5;
  const apiKey = context.config?.apiKey || "";

  if (!query || query.includes("{{")) {
    return {
      success: false,
      error: `Search query is empty or unresolved: "${query}"`,
      output: {
        text: `Search failed: query not resolved`,
        message: "Web search failed",
        data: { query, reason: "empty_or_unresolved_query" },
      },
      logs: [`Web search failed: query="${query}"`],
    };
  }

  logger.info(`[web-search] Searching: "${query}" via ${provider}`);

  try {
    let results: SearchResult[] = [];

    if (provider === "serpapi" && apiKey && apiKey !== "awokezemenu") {
      results = await searchViaSerpAPI(query, apiKey, maxResults);
    } else if (provider === "brave" && apiKey && apiKey !== "awokezemenu") {
      results = await searchViaBrave(query, apiKey, maxResults);
    } else {
      results = await searchViaDuckDuckGo(query, maxResults);
    }

    const resultsText = results.length
      ? results
          .map(
            (r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`,
          )
          .join("\n\n")
      : `No results found for: ${query}`;

    logger.info(`[web-search] Found ${results.length} results`);

    return {
      success: true,
      output: {
        text: resultsText,
        message: `Found ${results.length} results`,
        data: {
          query,
          provider,
          results,
          resultCount: results.length,
        },
      },
      logs: [
        `Web search: "${query}"`,
        `Provider: ${provider}`,
        `Results: ${results.length}`,
      ],
    };
  } catch (error: any) {
    logger.error(`[web-search] Error: ${error?.message || error}`);
    return {
      success: false,
      error: `Search failed: ${error?.message || String(error)}`,
      output: {
        text: `Search failed: ${error?.message || String(error)}`,
        message: "Web search failed",
        data: { query, error: error?.message || String(error) },
      },
      logs: [`Web search error: ${error?.message || String(error)}`],
    };
  }
};

const coreHttpRequestHandler = async (context: any) => {
  const url = context.config?.url || context.input?.url || "";
  const method = (context.config?.method || "GET").toString().toUpperCase();
  const headers = context.config?.headers
    ? typeof context.config.headers === "string"
      ? JSON.parse(context.config.headers)
      : context.config.headers
    : {};
  const body = context.config?.body || context.input?.body || null;

  if (!url) {
    return {
      success: false,
      error: "URL is required",
      output: {
        text: "HTTP request failed: no URL",
        message: "HTTP request failed",
        data: { reason: "missing_url" },
      },
      logs: ["HTTP request failed: missing URL"],
    };
  }

  const options: any = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  };

  if (body && method !== "GET") {
    options.body = typeof body === "string" ? body : JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const responseText = await response.text();

  let responseData: any;
  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = responseText;
  }

  return {
    success: response.ok,
    output: {
      text:
        typeof responseData === "string"
          ? responseData
          : JSON.stringify(responseData, null, 2),
      message: `HTTP ${method} ${url} → ${response.status}`,
      data: {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseData,
      },
    },
    logs: [
      `HTTP ${method} ${url}`,
      `Status: ${response.status} ${response.statusText}`,
    ],
  };
};

const dataSupabaseHandler = async (context: any) => {
  const table = context.config?.table || "";
  const operation = (context.config?.operation || "select").toString();
  const columns = context.config?.columns || "*";
  const matchField = context.config?.matchField || "";
  const matchValue = context.config?.matchValue || "";
  const limit = Number(context.config?.limit) || 10;
  const record = context.config?.record || context.input?.data || null;

  if (!table) {
    return {
      success: false,
      error: "Table name is required",
      output: {
        text: "Supabase failed: no table specified",
        message: "Supabase operation failed",
        data: { reason: "missing_table" },
      },
      logs: ["Supabase failed: missing table"],
    };
  }

  let query: any = supabase.from(table);
  let result: any;

  if (operation === "select") {
    let q = query.select(columns).limit(limit);
    if (matchField && matchValue) {
      q = q.eq(matchField, matchValue);
    }
    result = await q;
  } else if (operation === "insert") {
    result = await query.insert(record).select();
  } else if (operation === "update") {
    let q = query.update(record);
    if (matchField && matchValue) {
      q = q.eq(matchField, matchValue);
    }
    result = await q.select();
  } else if (operation === "delete") {
    let q = query.delete();
    if (matchField && matchValue) {
      q = q.eq(matchField, matchValue);
    }
    result = await q;
  } else {
    let q = query.select(columns).limit(limit);
    if (matchField && matchValue) {
      q = q.eq(matchField, matchValue);
    }
    result = await q;
  }

  if (result.error) {
    return {
      success: false,
      error: `Supabase error: ${result.error.message}`,
      output: {
        text: `Supabase ${operation} failed: ${result.error.message}`,
        message: "Supabase operation failed",
        data: { error: result.error },
      },
      logs: [`Supabase error: ${result.error.message}`],
    };
  }

  const rows = result.data || [];
  const text = JSON.stringify(rows, null, 2);

  return {
    success: true,
    output: {
      text,
      message: `Supabase ${operation} on ${table}: ${rows.length} rows`,
      data: {
        rows,
        rowCount: rows.length,
        table,
        operation,
      },
    },
    logs: [
      `Supabase ${operation} on ${table}`,
      `Rows affected: ${rows.length}`,
    ],
  };
};

const logicIfHandler = async (context: any) => {
  const condition = context.config?.condition || "";
  const input = context.input || {};

  if (!condition) {
    return {
      success: false,
      error: "Condition expression is required",
      output: {
        text: "IF node failed: no condition",
        message: "IF condition failed",
        data: { reason: "missing_condition" },
      },
      logs: ["IF node failed: missing condition"],
    };
  }

  let result = false;
  let error = "";

  try {
    const fn = new Function(
      "input",
      "data",
      `"use strict"; return (${condition});`,
    );
    result = Boolean(fn(input, input?.data || {}));
  } catch (err: any) {
    error = err?.message || String(err);
    result = false;
  }

  return {
    success: true,
    output: {
      text: result ? "true" : "false",
      message: `Condition "${condition}" = ${result}`,
      data: {
        condition,
        result,
        branch: result ? "true" : "false",
        input,
        error: error || undefined,
      },
    },
    logs: [
      `IF condition: ${condition}`,
      `Result: ${result}`,
      `Branch: ${result ? "true" : "false"}`,
    ],
  };
};

const logicDelayHandler = async (context: any) => {
  const delayMs = Number(
    context.config?.delayMs || context.config?.duration || 1000,
  );
  const maxDelay = 30000;
  const actualDelay = Math.min(delayMs, maxDelay);

  await new Promise((resolve) => setTimeout(resolve, actualDelay));

  return {
    success: true,
    output: {
      text: `Delayed ${actualDelay}ms`,
      message: `Delay complete: ${actualDelay}ms`,
      data: {
        requestedDelay: delayMs,
        actualDelay,
        completedAt: new Date().toISOString(),
        ...context.input,
      },
    },
    logs: [`Delay: ${actualDelay}ms complete`],
  };
};

export class NodeRegistry {
  private nodes: Map<string, any> = new Map();

  register(node: any) {
    const normalizedType = normalizeNodeType(node.type);
    this.nodes.set(normalizedType, node);
  }

  get(type: string) {
    return this.nodes.get(normalizeNodeType(type));
  }
}

export const nodeRegistry = new NodeRegistry();

const createNodeDefinition = (
  type: string,
  handler: (context: any) => Promise<any>,
  description?: string,
) => ({
  type,
  handler,
  description: description || `Generic handler for ${type}`,
  validation: {},
});

const aiHandler = async (context: any) => {
  const apiKey = context.config?.apiKey;
  const model = context.config?.model;
  const nodeType = context.nodeType || context.type || "ai";
  const provider = getProviderFromNodeType(nodeType);
  const prompt =
    context.config?.inputText ||
    context.config?.prompt ||
    context.input?.text ||
    context.input?.output?.text ||
    context.input?.message ||
    "";

  if (!apiKey) {
    return {
      success: false,
      error: "API key not configured for AI node",
      nodeId: context.nodeId,
    };
  }

  try {
    const llm = llmFactory.createLLM({
      provider: provider as any,
      apiKey,
      model,
      temperature: context.config?.temperature ?? 0.7,
      maxTokens: context.config?.maxTokens,
    });

    const response = await llm.invoke([new HumanMessage(prompt)]);
    const generatedText = response.content as string;

    return {
      success: true,
      output: {
        text: generatedText,
        message: `${nodeType} executed with model ${model}`,
        model,
        data: {
          model,
          systemPrompt: context.config?.systemPrompt || "",
          executionType: "ai-completion",
          provider,
        },
        raw: {
          model,
          prompt,
          response: generatedText,
          nodeId: context.nodeId,
          nodeType,
        },
      },
      logs: [
        `${nodeType} node executed with model ${model}, generated ${generatedText.length} characters`,
      ],
    };
  } catch (error) {
    logger.error(`AI handler error for ${nodeType}:`, error);
    return {
      success: false,
      error: `Failed to execute AI node: ${error instanceof Error ? error.message : String(error)}`,
      nodeId: context.nodeId,
    };
  }
};

const buildDenbegayeAgentPrompt = (context: any) => {
  const systemPrompt =
    context.config?.systemPrompt ||
    "You are Denbegaye, an autonomous AI agent. Use the available tools and memory to complete the task. Be explicit when selecting tools and provide structured output when requested.";
  const inputText =
    context.config?.inputText ||
    context.config?.prompt ||
    context.input?.text ||
    context.input?.output?.text ||
    context.input?.message ||
    "";
  const variablesText = Object.entries(context.variables || {})
    .filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    )
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join("\n");

  const toolList = (() => {
    const rawTools = context.config?.tools;
    if (Array.isArray(rawTools)) {
      return rawTools.map((tool: any) => String(tool).trim()).filter(Boolean);
    }
    if (typeof rawTools === "string") {
      return rawTools
        .split(/[\n,;]+/)
        .map((tool) => tool.trim())
        .filter(Boolean);
    }
    return [];
  })();

  const enableToolCalling =
    String(
      context.config?.["Enable Tool Calling"] ||
        context.config?.enableToolCalling ||
        "yes",
    ).toLowerCase() === "yes";
  const enableMemory =
    String(
      context.config?.["Enable Memory"] || context.config?.enableMemory || "no",
    ).toLowerCase() === "yes";
  const memoryType =
    context.config?.["Memory Type"] || context.config?.memoryType || "semantic";
  const reasoningType =
    context.config?.["Reasoning Type"] ||
    context.config?.reasoningType ||
    "step-by-step";
  const outputFormat =
    context.config?.["Output Format"] || context.config?.outputFormat || "text";
  const maxIterations = Number(
    context.config?.["Max Iterations"] || context.config?.maxIterations || 5,
  );

  const memorySection = enableMemory
    ? `Memory type: ${memoryType}
Memory enabled: yes
Memory snapshot: ${String(
        context.variables?.memory ||
          context.variables?.memoryContext ||
          context.input?.memory ||
          context.input?.memoryContext ||
          "No memory context available",
      )}
`
    : "Memory enabled: no\n";

  const toolSection = enableToolCalling
    ? `Available tools:\n${toolList.length ? toolList.map((tool, index) => `${index + 1}. ${tool}`).join("\n") : "No tools configured"}\nTool calling is enabled. When you decide to use a tool, describe the tool call clearly and include a tool payload if applicable.`
    : "Tool calling disabled.\n";

  const outputGuidance =
    outputFormat.toLowerCase() === "json"
      ? "Respond with valid JSON only."
      : outputFormat.toLowerCase() === "structured"
        ? "Respond with a structured plan and final answer in clearly separated sections."
        : "Respond with a concise but complete answer.";

  let prompt = `${systemPrompt}\n\n`;

  if (toolSection) {
    prompt += `${toolSection}\n\n`;
  }

  prompt += `Reasoning strategy: ${reasoningType}. Max iterations: ${maxIterations}.\n`;

  if (variablesText) {
    prompt += `Context variables:\n${variablesText}\n\n`;
  }

  prompt += `${memorySection}\n`;
  prompt += `Task input:\n${inputText}\n\n`;
  prompt += `${outputGuidance}\n`;

  if (toolList.length > 0) {
    prompt += `If a tool is useful, choose the best tool from the available list and explain why. Use the following tool format:\n`;
    prompt += `TOOL_CALL: {\n  \"tool\": \"tool-name\",\n  \"action\": \"description of action\",\n  \"params\": { ... }\n}\n\n`;
  }

  prompt += `Begin by planning your next steps, and if tools are used, make the tool selection explicit.\n`;

  return prompt;
};

const denbegayeAgentHandler = async (context: any) => {
  const apiKey = context.config?.apiKey;
  const provider = (
    context.config?.provider ||
    context.config?.["LLM Provider"] ||
    "gemini"
  )
    .toString()
    .toLowerCase();
  const model = context.config?.model;
  const nodeType = context.nodeType || context.type || "denbegaye-agent";

  if (!apiKey) {
    return {
      success: false,
      error: "API key not configured for Denbegaye Agent node",
      nodeId: context.nodeId,
    };
  }

  const effectiveProvider =
    provider === "gemini" ||
    provider === "openai" ||
    provider === "anthropic" ||
    provider === "deepseek" ||
    provider === "groq"
      ? provider
      : getProviderFromNodeType(nodeType);

  const memoryEnabled =
    String(
      context.config?.["Enable Memory"] || context.config?.enableMemory || "no",
    ).toLowerCase() === "yes";
  const memoryType =
    context.config?.["Memory Type"] || context.config?.memoryType || "semantic";
  const tools = parseToolList(context.config?.tools);

  const memoryContext = memoryEnabled
    ? await loadRelevantMemory(
        context,
        context.input?.text || context.config?.prompt || "",
      )
    : "";

  const prompt = buildDenbegayeAgentPrompt({
    ...context,
    variables: {
      ...context.variables,
      memory: memoryContext,
    },
    input: {
      ...context.input,
      memory: memoryContext,
    },
  });

  try {
    let lastOutput = "";
    let iteration = 0;
    let toolOutput: any = null;
    let toolNameUsed: string | null = null;

    const isGeminiProvider = effectiveProvider === "gemini";
    let geminiModel: any = null;
    let functionDeclarations: any[] = [];
    let history: any[] = [];

    if (isGeminiProvider) {
      const toolRegistry = new SupabaseToolRegistry();
      const availableTools = await toolRegistry.listTools();
      const allowedToolNames = availableTools.map((tool: any) =>
        String(tool.name),
      );

      functionDeclarations = availableTools.map((tool: any) => ({
        name: String(tool.name),
        description: String(tool.description || ""),
        parameters: tool.parameters
          ? {
              type: SchemaType.OBJECT,
              properties: tool.parameters.properties || {},
              required: tool.parameters.required || [],
              description: tool.parameters.description,
            }
          : undefined,
      }));

      const genAI = new GoogleGenerativeAI(apiKey);
      geminiModel = genAI.getGenerativeModel({
        model: model || "gemini-pro",
        generationConfig: {
          temperature: context.config?.temperature ?? 0.7,
          maxOutputTokens: context.config?.maxTokens ?? 1500,
        },
        systemInstruction: context.config?.systemPrompt || "",
        tools: [{ functionDeclarations }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingMode.AUTO,
            allowedFunctionNames: allowedToolNames,
          },
        },
      });

      history = [{ role: "user", parts: [{ text: prompt }] }];
    } else {
      // Non-Gemini providers keep the existing LangChain flow
      const llm = llmFactory.createLLM({
        provider: effectiveProvider as any,
        apiKey,
        model,
        temperature: context.config?.temperature ?? 0.7,
        maxTokens: context.config?.maxTokens ?? 1500,
      });

      history = null as any;
      geminiModel = llm;
    }

    while (iteration < 5) {
      iteration += 1;

      if (isGeminiProvider) {
        const response = await geminiModel.generateContent({
          contents: history,
        });

        const functionCalls = response.response.functionCalls?.() || [];
        const functionCall = functionCalls[0];

        if (
          functionCall &&
          functionCall.name &&
          functionDeclarations.some((fn) => fn.name === functionCall.name)
        ) {
          toolNameUsed = functionCall.name;
          toolOutput = await callTool(
            functionCall.name,
            functionCall.args || {},
          );
          lastOutput = `Tool ${functionCall.name} returned:\n${JSON.stringify(toolOutput, null, 2)}`;
          history.push({
            role: "tool",
            parts: [
              {
                functionResponse: {
                  name: functionCall.name,
                  response: toolOutput || {},
                },
              },
            ],
          });
          continue;
        }

        const generatedText = response.response.text();
        if (memoryEnabled && generatedText) {
          await storeAgentMemory(context, generatedText, memoryType);
        }

        return {
          success: true,
          output: {
            text: generatedText,
            message: `Denbegaye autonomous agent executed with provider ${effectiveProvider}`,
            model,
            provider: effectiveProvider,
            toolCalls: tools,
            memoryEnabled,
            data: {
              model,
              provider: effectiveProvider,
              systemPrompt: context.config?.systemPrompt || "",
              reasoningType:
                context.config?.["Reasoning Type"] ||
                context.config?.reasoningType ||
                "step-by-step",
              outputFormat:
                context.config?.["Output Format"] ||
                context.config?.outputFormat ||
                "text",
              toolList: tools,
              memoryType,
              memoryContext,
              toolNameUsed,
              toolOutput,
              executionType: "denbegaye-autonomous-agent",
            },
            raw: {
              prompt,
              response: generatedText,
              nodeId: context.nodeId,
              nodeType,
            },
          },
          logs: [
            `${nodeType} executed with provider ${effectiveProvider} and model ${model || "default"}`,
            `Iteration: ${iteration}`,
            toolNameUsed ? `Tool used: ${toolNameUsed}` : "No tool used",
          ].filter(Boolean),
        };
      }

      const response = await geminiModel.invoke([
        new HumanMessage(
          prompt +
            (lastOutput ? `\n\nPrevious tool output:\n${lastOutput}` : ""),
        ),
      ]);
      const generatedText = response.content as string;
      const toolCall = parseToolCall(generatedText);

      if (toolCall && tools.includes(toolCall.tool)) {
        toolNameUsed = toolCall.tool;
        toolOutput = await callTool(toolCall.tool, toolCall.params);
        lastOutput = `Tool ${toolCall.tool} returned:\n${JSON.stringify(toolOutput, null, 2)}`;
        continue;
      }

      if (memoryEnabled && generatedText) {
        await storeAgentMemory(context, generatedText, memoryType);
      }

      return {
        success: true,
        output: {
          text: generatedText,
          message: `Denbegaye autonomous agent executed with provider ${effectiveProvider}`,
          model,
          provider: effectiveProvider,
          toolCalls: tools,
          memoryEnabled,
          data: {
            model,
            provider: effectiveProvider,
            systemPrompt: context.config?.systemPrompt || "",
            reasoningType:
              context.config?.["Reasoning Type"] ||
              context.config?.reasoningType ||
              "step-by-step",
            outputFormat:
              context.config?.["Output Format"] ||
              context.config?.outputFormat ||
              "text",
            toolList: tools,
            memoryType,
            memoryContext,
            toolNameUsed,
            toolOutput,
            executionType: "denbegaye-autonomous-agent",
          },
          raw: {
            prompt,
            response: generatedText,
            nodeId: context.nodeId,
            nodeType,
          },
        },
        logs: [
          `${nodeType} executed with provider ${effectiveProvider} and model ${model || "default"}`,
          `Iteration: ${iteration}`,
          toolNameUsed ? `Tool used: ${toolNameUsed}` : "No tool used",
        ].filter(Boolean),
      };
    }

    return {
      success: true,
      output: {
        text: lastOutput || "No meaningful output generated.",
        message: "Denbegaye autonomous agent completed after max iterations",
        data: {
          iteration,
          toolNameUsed,
          toolOutput,
          memoryEnabled,
          memoryType,
        },
      },
      logs: [`${nodeType} completed after reaching max iterations`],
    };
  } catch (error) {
    logger.error(`Denbegaye Agent handler error for ${nodeType}:`, error);
    return {
      success: false,
      error: `Failed to execute Denbegaye Agent node: ${error instanceof Error ? error.message : String(error)}`,
      nodeId: context.nodeId,
    };
  }
};

const triggerHandler = async (context: any) => {
  const rawInput =
    context.config?.inputSchema ||
    context.config?.input ||
    context.input?.text ||
    "";

  const market =
    context.config?.market ||
    context.config?.fields?.market ||
    context.input?.market ||
    "";
  const topic =
    context.config?.topic ||
    context.config?.fields?.topic ||
    context.input?.topic ||
    rawInput;
  const timeScope =
    context.config?.timeScope ||
    context.config?.fields?.timeScope ||
    context.input?.timeScope ||
    "last 6 months";

  const resolvedMarket = market || "General";
  const resolvedTopic = topic || rawInput;
  const resolvedTimeScope = timeScope || "last 6 months";

  return {
    success: true,
    output: {
      text: rawInput,
      message: "Manual trigger executed",
      data: {
        rawInput,
        triggeredAt: new Date().toISOString(),
      },
      market: resolvedMarket,
      topic: resolvedTopic,
      timeScope: resolvedTimeScope,
    },
    logs: [
      `Manual trigger: market="${resolvedMarket}"`,
      `topic="${resolvedTopic}"`,
      `timeScope="${resolvedTimeScope}"`,
    ],
  };
};

const actionHandler = async (context: any) => {
  const nodeType = context.nodeType || context.type || "action";
  const message =
    context.config?.message ||
    context.input?.text ||
    context.input?.output?.text ||
    context.input?.message ||
    "";

  return {
    success: true,
    output: {
      text: `Action executed: ${message.slice(0, 100)}`,
      message: `${nodeType} action executed`,
      data: {
        nodeType,
        messageLength: message.length,
      },
    },
    logs: [`${nodeType} action executed`],
  };
};

const coreHandler = async (context: any) => {
  const nodeType = normalizeNodeType(
    context.nodeType || context.type || "core",
  );
  const expression =
    context.config?.expression ||
    context.config?.condition ||
    context.config?.value;
  const evaluated = evaluateExpression(expression, context);

  const baseOutput: Record<string, any> = {
    nodeId: context.nodeId,
    nodeType: context.nodeType,
    input: context.input,
    config: context.config,
    result: evaluated,
  };

  switch (nodeType) {
    case "core-set":
      return {
        success: true,
        output: {
          ...baseOutput,
          variables: buildSetVariables(context, evaluated),
        },
        logs: [`Core set node ${context.nodeId} executed`],
      };

    case "core-transform":
      return {
        success: true,
        output: {
          ...baseOutput,
          transformed: evaluated,
        },
        logs: [`Core transform node ${context.nodeId} executed`],
      };

    case "core-if":
      return {
        success: true,
        output: {
          ...baseOutput,
          condition: Boolean(evaluated),
        },
        logs: [
          `Core if node ${context.nodeId} evaluated to ${Boolean(evaluated)}`,
        ],
      };

    case "core-switch":
      return {
        success: true,
        output: {
          ...baseOutput,
          selected: evaluated,
        },
        logs: [
          `Core switch node ${context.nodeId} selected branch ${String(evaluated)}`,
        ],
      };

    default:
      return {
        success: true,
        output: baseOutput,
        logs: [`Core node ${context.nodeId} executed`],
      };
  }
};

const fallbackHandler = async (context: any) => {
  return {
    success: true,
    output: {
      fallback: true,
      nodeId: context.nodeId,
      nodeType: context.nodeType,
      config: context.config,
      input: context.input,
      message: `Fallback execution for node type ${context.nodeType}`,
    },
    logs: [`Fallback node ${context.nodeId} executed`],
  };
};

// Specialized handlers for LangChain-compatible execution
const openaiHandler = async (context: any) => {
  const apiKey = context.config?.apiKey || context.apiKeys?.openai;
  const model = context.config?.model || "gpt-4o-mini";
  const nodeType = context.nodeType || context.type || "ai-openai";
  const prompt =
    context.config?.inputText ||
    context.config?.prompt ||
    context.input?.text ||
    context.input?.output?.text ||
    context.input?.message ||
    "";

  if (!apiKey) {
    return {
      success: false,
      error: "OpenAI API key not configured",
      nodeId: context.nodeId,
    };
  }

  try {
    const llm = llmFactory.createLLM({
      provider: "openai",
      apiKey,
      model,
      temperature: context.config?.temperature ?? 0.7,
      maxTokens: context.config?.maxTokens,
    });

    const response = await llm.invoke([new HumanMessage(prompt)]);
    const generatedText = response.content as string;

    return {
      success: true,
      output: {
        text: generatedText,
        message: `${nodeType} executed with model ${model}`,
        model,
        data: {
          model,
          systemPrompt: context.config?.systemPrompt || "",
          executionType: "ai-completion",
          provider: "openai",
        },
        raw: {
          model,
          prompt,
          response: generatedText,
          nodeId: context.nodeId,
          nodeType,
        },
      },
      logs: [
        `${nodeType} node executed with model ${model}, generated ${generatedText.length} characters`,
      ],
    };
  } catch (error) {
    logger.error(`OpenAI handler error:`, error);
    return {
      success: false,
      error: `Failed to execute OpenAI node: ${error instanceof Error ? error.message : String(error)}`,
      nodeId: context.nodeId,
    };
  }
};

const anthropicHandler = async (context: any) => {
  const apiKey = context.config?.apiKey || context.apiKeys?.anthropic;
  const model = context.config?.model || "claude-3.5-opus";
  const nodeType = context.nodeType || context.type || "ai-anthropic";
  const prompt =
    context.config?.inputText ||
    context.config?.prompt ||
    context.input?.text ||
    context.input?.output?.text ||
    context.input?.message ||
    "";

  if (!apiKey) {
    return {
      success: false,
      error: "Anthropic API key not configured",
      nodeId: context.nodeId,
    };
  }

  try {
    const llm = llmFactory.createLLM({
      provider: "anthropic",
      apiKey,
      model,
      temperature: context.config?.temperature ?? 0.7,
      maxTokens: context.config?.maxTokens,
    });

    const response = await llm.invoke([new HumanMessage(prompt)]);
    const generatedText = response.content as string;

    return {
      success: true,
      output: {
        text: generatedText,
        message: `${nodeType} executed with model ${model}`,
        model,
        data: {
          model,
          systemPrompt: context.config?.systemPrompt || "",
          executionType: "ai-completion",
          provider: "anthropic",
        },
        raw: {
          model,
          prompt,
          response: generatedText,
          nodeId: context.nodeId,
          nodeType,
        },
      },
      logs: [
        `${nodeType} node executed with model ${model}, generated ${generatedText.length} characters`,
      ],
    };
  } catch (error) {
    logger.error(`Anthropic handler error:`, error);
    return {
      success: false,
      error: `Failed to execute Anthropic node: ${error instanceof Error ? error.message : String(error)}`,
      nodeId: context.nodeId,
    };
  }
};

const groqHandler = async (context: any) => {
  const apiKey = context.config?.apiKey || context.apiKeys?.groq;
  const model = context.config?.model || "groq-1.0";
  const nodeType = context.nodeType || context.type || "ai-groq";
  const prompt =
    context.config?.inputText ||
    context.config?.prompt ||
    context.input?.text ||
    context.input?.output?.text ||
    context.input?.message ||
    "";

  if (!apiKey) {
    return {
      success: false,
      error: "Groq API key not configured",
      nodeId: context.nodeId,
    };
  }

  try {
    const llm = llmFactory.createLLM({
      provider: "groq",
      apiKey,
      model,
      temperature: context.config?.temperature ?? 0.7,
      maxTokens: context.config?.maxTokens,
    });

    const response = await llm.invoke([new HumanMessage(prompt)]);
    const generatedText = response.content as string;

    return {
      success: true,
      output: {
        text: generatedText,
        message: `${nodeType} executed with model ${model}`,
        model,
        data: {
          model,
          systemPrompt: context.config?.systemPrompt || "",
          executionType: "ai-completion",
          provider: "groq",
        },
        raw: {
          model,
          prompt,
          response: generatedText,
          nodeId: context.nodeId,
          nodeType,
        },
      },
      logs: [
        `${nodeType} node executed with model ${model}, generated ${generatedText.length} characters`,
      ],
    };
  } catch (error) {
    logger.error(`Groq handler error:`, error);
    return {
      success: false,
      error: `Failed to execute Groq node: ${error instanceof Error ? error.message : String(error)}`,
      nodeId: context.nodeId,
    };
  }
};

const geminiHandler = async (context: any) => {
  const apiKey = context.config?.apiKey || context.apiKeys?.gemini;
  const model = context.config?.model || "gemini-1.5-pro";
  const nodeType = context.nodeType || context.type || "ai-gemini";
  const prompt =
    context.config?.inputText ||
    context.config?.prompt ||
    context.input?.text ||
    context.input?.output?.text ||
    context.input?.message ||
    "";

  if (!apiKey) {
    return {
      success: false,
      error: "Google Gemini API key not configured",
      nodeId: context.nodeId,
    };
  }

  try {
    const llm = llmFactory.createLLM({
      provider: "gemini",
      apiKey,
      model,
      temperature: context.config?.temperature ?? 0.7,
      maxTokens: context.config?.maxTokens,
    });

    const response = await llm.invoke([new HumanMessage(prompt)]);
    const generatedText = response.content as string;

    return {
      success: true,
      output: {
        text: generatedText,
        message: `${nodeType} executed with model ${model}`,
        model,
        data: {
          model,
          systemPrompt: context.config?.systemPrompt || "",
          executionType: "ai-completion",
          provider: "gemini",
        },
        raw: {
          model,
          prompt,
          response: generatedText,
          nodeId: context.nodeId,
          nodeType,
        },
      },
      logs: [
        `${nodeType} node executed with model ${model}, generated ${generatedText.length} characters`,
      ],
    };
  } catch (error) {
    logger.error(`Gemini handler error:`, error);
    return {
      success: false,
      error: `Failed to execute Gemini node: ${error instanceof Error ? error.message : String(error)}`,
      nodeId: context.nodeId,
    };
  }
};

const deepseekHandler = async (context: any) => {
  const apiKey = context.config?.apiKey || context.apiKeys?.deepseek;
  const model = context.config?.model || "deepseek-v4-flash";
  const compatibility = context.config?.compatibility || "openai";
  const customBaseUrl = context.config?.baseUrl;
  const nodeType = context.nodeType || context.type || "ai-deepseek";
  const prompt =
    context.config?.inputText ||
    context.config?.prompt ||
    context.input?.text ||
    context.input?.output?.text ||
    context.input?.message ||
    "";

  if (!apiKey) {
    return {
      success: false,
      error: "DeepSeek API key not configured",
      nodeId: context.nodeId,
    };
  }

  const baseUrl = customBaseUrl
    ? customBaseUrl.replace(/\/+$/g, "")
    : compatibility === "anthropic"
      ? "https://api.deepseek.com/anthropic"
      : "https://api.deepseek.com";

  try {
    const isAnthropic = compatibility === "anthropic";
    const endpoint = isAnthropic
      ? `${baseUrl}/v1/messages`
      : `${baseUrl}/v1/chat/completions`;

    const body: Record<string, any> = {
      model,
      temperature: context.config?.temperature ?? 0.7,
      max_tokens: context.config?.maxTokens ?? 1000,
    };

    if (isAnthropic) {
      body.messages = [
        {
          role: "user",
          content: prompt,
        },
      ];
    } else {
      body.messages = [
        {
          role: "user",
          content: prompt,
        },
      ];
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (isAnthropic) {
      headers["x-api-key"] = apiKey;
    } else {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const message =
        errorData?.error?.message || errorData?.message || response.statusText;
      throw new Error(`DeepSeek API error: ${message}`);
    }

    const result = await response.json();
    const generatedText = isAnthropic
      ? result?.choices?.[0]?.message?.content || result?.completion || ""
      : result?.choices?.[0]?.message?.content ||
        result?.choices?.[0]?.text ||
        "";

    return {
      success: true,
      output: {
        text: generatedText,
        message: `${nodeType} executed with model ${model}`,
        model,
        data: {
          model,
          compatibility,
          baseUrl,
          systemPrompt: context.config?.systemPrompt || "",
          executionType: "ai-completion",
          provider: "deepseek",
        },
        raw: {
          model,
          prompt,
          response: result,
          nodeId: context.nodeId,
          nodeType,
        },
      },
      logs: [
        `${nodeType} node executed with model ${model} on ${endpoint}, generated ${generatedText.length} characters`,
      ],
    };
  } catch (error) {
    logger.error(`DeepSeek handler error:`, error);
    return {
      success: false,
      error: `Failed to execute DeepSeek node: ${error instanceof Error ? error.message : String(error)}`,
      nodeId: context.nodeId,
    };
  }
};

const scheduleHandler = async (context: any) => {
  const cronExpression = context.config?.cronExpression;
  const timezone = context.config?.timezone || "UTC";

  if (!cronExpression) {
    return {
      success: false,
      error: "Cron expression not configured",
      nodeId: context.nodeId,
    };
  }

  return {
    success: true,
    output: {
      trigger: "schedule",
      cronExpression,
      timezone,
      nodeId: context.nodeId,
      nodeType: "trigger-schedule",
      message: `Schedule trigger configured with cron: ${cronExpression}`,
    },
    logs: [`Schedule trigger registered for ${cronExpression} (${timezone})`],
  };
};

const normalizeEmailConfig = (
  config: Record<string, any>,
): Record<string, any> => {
  const normalized: Record<string, any> = {};

  for (const [key, value] of Object.entries(config)) {
    // Map space-separated keys from frontend to camelCase
    if (key.includes("SMTP")) {
      if (key === "SMTP Host") normalized.smtpHost = value;
      else if (key === "SMTP Port") normalized.smtpPort = value;
      else if (key === "SMTP Secure") normalized.smtpSecure = value;
      else if (key === "SMTP User") normalized.smtpUser = value;
      else if (key === "SMTP Password") normalized.smtpPassword = value;
    } else if (key.includes("SendGrid")) {
      if (key === "SendGrid API Key") normalized.sendgridApiKey = value;
      else if (key === "SendGrid From Email")
        normalized.sendgridFromEmail = value;
    } else if (key.includes("Mailgun")) {
      if (key === "Mailgun API Key") normalized.mailgunApiKey = value;
      else if (key === "Mailgun Domain") normalized.mailgunDomain = value;
    } else if (key.includes("AWS")) {
      if (key === "AWS Region") normalized.awsRegion = value;
      else if (key === "AWS Access Key") normalized.awsAccessKey = value;
      else if (key === "AWS Secret Key") normalized.awsSecretKey = value;
    } else if (key === "Provider") {
      normalized.provider = value;
    } else if (key === "From") {
      normalized.from = value;
    } else if (key === "To") {
      normalized.to = value;
    } else if (key === "Subject") {
      normalized.subject = value;
    } else if (key === "Body") {
      normalized.body = value;
    } else if (key === "Is HTML") {
      normalized.isHtml = value;
    } else if (key === "Attachments") {
      normalized.attachments = value;
    } else {
      normalized[key] = value;
    }
  }

  return normalized;
};

const emailActionHandler = async (context: any) => {
  try {
    // Normalize config keys from frontend format (space-separated) to camelCase
    const config = normalizeEmailConfig(context.config || {});

    // Extract provider first
    const provider =
      config.provider ||
      context.config?.Provider ||
      process.env.EMAIL_PROVIDER ||
      "smtp";

    // Extract common fields
    const recipient =
      config.to ||
      context.input?.email ||
      context.input?.to ||
      context.input?.data?.email ||
      "";
    const subject =
      config.subject || context.input?.subject || "Agent Notification";
    const body =
      config.body ||
      context.input?.text ||
      context.input?.output?.text ||
      context.input?.message ||
      "";
    const from = config.from || process.env.SMTP_USER;
    const isHtml = config.isHtml !== false; // Default to HTML
    const attachments = config.attachments || [];

    // Validate required fields
    if (!recipient) {
      return {
        success: false,
        error: "Email recipient not configured (To field required)",
        nodeId: context.nodeId,
      };
    }

    if (!subject) {
      return {
        success: false,
        error: "Email subject not configured (Subject field required)",
        nodeId: context.nodeId,
      };
    }

    if (!body) {
      return {
        success: false,
        error: "Email body not configured (Body field required)",
        nodeId: context.nodeId,
      };
    }

    // Parse attachments if they're a JSON string
    let parsedAttachments: Array<{ filename: string; url: string }> = [];
    if (attachments) {
      if (typeof attachments === "string") {
        try {
          parsedAttachments = JSON.parse(attachments);
        } catch (e) {
          logger.warn("Failed to parse attachments as JSON", e);
          parsedAttachments = [];
        }
      } else if (Array.isArray(attachments)) {
        parsedAttachments = attachments;
      }
    }

    // Build base email options
    let emailOptions: EmailOptions = {
      to: recipient,
      from,
      subject,
      body,
      html: isHtml,
      attachments: parsedAttachments,
      provider: provider as "smtp" | "sendgrid" | "mailgun" | "ses",
    };

    // Add provider-specific configuration
    switch (provider.toLowerCase()) {
      case "smtp": {
        const smtpConfig = {
          host: config.smtpHost || process.env.SMTP_HOST || "smtp.gmail.com",
          port: parseInt(
            String(config.smtpPort || process.env.SMTP_PORT || 587),
          ),
          secure:
            config.smtpSecure !== undefined
              ? config.smtpSecure
              : process.env.SMTP_SECURE === "true",
          auth: {
            user: config.smtpUser || process.env.SMTP_USER || "",
            pass: config.smtpPassword || process.env.SMTP_PASSWORD || "",
          },
        };

        if (!smtpConfig.auth.user || !smtpConfig.auth.pass) {
          return {
            success: false,
            error:
              "SMTP credentials not configured (SMTP User and SMTP Password required)",
            nodeId: context.nodeId,
          };
        }

        emailOptions.smtpConfig = smtpConfig;
        break;
      }

      case "sendgrid": {
        const sendgridApiKey =
          config.sendgridApiKey || process.env.SENDGRID_API_KEY;
        const sendgridFromEmail =
          config.sendgridFromEmail ||
          config.from ||
          process.env.SENDGRID_FROM_EMAIL;

        if (!sendgridApiKey) {
          return {
            success: false,
            error: "SendGrid API key not configured",
            nodeId: context.nodeId,
          };
        }

        emailOptions.sendGridApiKey = sendgridApiKey;
        emailOptions.from = sendgridFromEmail || from;
        break;
      }

      case "mailgun": {
        const mailgunApiKey =
          config.mailgunApiKey || process.env.MAILGUN_API_KEY;
        const mailgunDomain =
          config.mailgunDomain || process.env.MAILGUN_DOMAIN;

        if (!mailgunApiKey || !mailgunDomain) {
          return {
            success: false,
            error:
              "Mailgun credentials not configured (API Key and Domain required)",
            nodeId: context.nodeId,
          };
        }

        emailOptions.mailgunApiKey = mailgunApiKey;
        emailOptions.mailgunDomain = mailgunDomain;
        break;
      }

      case "ses": {
        const awsRegion = config.awsRegion || process.env.AWS_REGION;
        const awsAccessKey =
          config.awsAccessKey || process.env.AWS_ACCESS_KEY_ID;
        const awsSecretKey =
          config.awsSecretKey || process.env.AWS_SECRET_ACCESS_KEY;

        if (!awsRegion || !awsAccessKey || !awsSecretKey) {
          return {
            success: false,
            error:
              "AWS SES credentials not configured (Region, Access Key, and Secret Key required)",
            nodeId: context.nodeId,
          };
        }

        // Store for SES handler (when implemented)
        (emailOptions as any)._awsRegion = awsRegion;
        (emailOptions as any)._awsAccessKey = awsAccessKey;
        (emailOptions as any)._awsSecretKey = awsSecretKey;
        break;
      }

      default:
        return {
          success: false,
          error: `Unknown email provider: ${provider}`,
          nodeId: context.nodeId,
        };
    }

    // Send the email
    const result = await sendEmail(emailOptions);

    if (result.success) {
      logger.info(
        `Email sent successfully via ${provider} to ${recipient}`,
        result,
      );
      return {
        success: true,
        output: {
          text: `Email sent to ${recipient}: ${subject}`,
          message: `Email action executed successfully via ${provider}`,
          data: {
            recipient,
            subject,
            bodyLength: body.length,
            provider,
            messageId: result.messageId,
            timestamp: result.timestamp,
          },
        },
        logs: [
          `Email action executed: to=${recipient}, provider=${provider}, messageId=${result.messageId}`,
        ],
      };
    } else {
      logger.error(
        `Email send failed via ${provider} to ${recipient}:`,
        result.error,
      );
      return {
        success: false,
        error: `Failed to send email via ${provider}: ${result.error}`,
        nodeId: context.nodeId,
        logs: [
          `Email action failed: to=${recipient}, provider=${provider}, error=${result.error}`,
        ],
      };
    }
  } catch (error) {
    logger.error("Email action handler error:", error);
    return {
      success: false,
      error: `Email action error: ${error instanceof Error ? error.message : String(error)}`,
      nodeId: context.nodeId,
      logs: [
        `Email action error: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
};

const webhookActionHandler = async (context: any) => {
  const url = context.config?.url || context.input?.url || "";
  const payload = context.config?.body || context.input || {};
  const method = context.config?.method || context.input?.method || "POST";

  if (!url) {
    return {
      success: false,
      error: "Webhook URL not configured",
      nodeId: context.nodeId,
    };
  }

  return {
    success: true,
    output: {
      text: `Webhook sent to ${url}`,
      message: "Webhook action executed",
      data: { url, method },
      raw: payload,
    },
    logs: [`Webhook action executed: url=${url}`],
  };
};

const codeJSHandler = async (context: any) => {
  const code = context.config?.code || context.input?.code;
  const timeout = context.config?.timeout || 5000;

  if (!code) {
    return {
      success: false,
      error: "JavaScript code not provided",
      nodeId: context.nodeId,
    };
  }

  return {
    success: true,
    output: {
      language: "javascript",
      codeLength: code.length,
      timeout,
      nodeId: context.nodeId,
      nodeType: "core-code-js",
      message: `JavaScript code prepared for execution`,
    },
    logs: [`JavaScript execution node: ${code.substring(0, 50)}...`],
  };
};

const codePythonHandler = async (context: any) => {
  const code = context.config?.code || context.input?.code;
  const timeout = context.config?.timeout || 5000;

  if (!code) {
    return {
      success: false,
      error: "Python code not provided",
      nodeId: context.nodeId,
    };
  }

  return {
    success: true,
    output: {
      language: "python",
      codeLength: code.length,
      timeout,
      nodeId: context.nodeId,
      nodeType: "core-code-python",
      message: `Python code prepared for execution`,
    },
    logs: [`Python execution node: ${code.substring(0, 50)}...`],
  };
};

const logicLoopHandler = async (context: any) => {
  const iterations = context.config?.iterations || context.input?.iterations;
  const condition = context.config?.condition;

  if (!iterations && !condition) {
    return {
      success: false,
      error: "Iterations or condition not configured",
      nodeId: context.nodeId,
    };
  }

  return {
    success: true,
    output: {
      nodeId: context.nodeId,
      nodeType: "logic-loop",
      iterations,
      condition,
      message: `Loop node prepared`,
    },
    logs: [`Logic LOOP node: iterations=${iterations}, condition=${condition}`],
  };
};

const builtInNodes = [
  // AI nodes - with specialized handlers
  createNodeDefinition("ai", aiHandler, "Generic AI node fallback"),
  createNodeDefinition(
    "ai-openai",
    openaiHandler,
    "OpenAI ChatGPT compatible node",
  ),
  createNodeDefinition(
    "ai-anthropic",
    anthropicHandler,
    "Anthropic Claude compatible node",
  ),
  createNodeDefinition("ai-groq", groqHandler, "Groq LLM compatible node"),
  createNodeDefinition("ai-gemini", geminiHandler, "Google Gemini AI node"),
  createNodeDefinition(
    "ai-google-gemini",
    geminiHandler,
    "Google Gemini AI node alias for frontend",
  ),
  createNodeDefinition(
    "denbegaye-agent",
    denbegayeAgentHandler,
    "Denbegaye autonomous agent node with tool and memory support",
  ),
  createNodeDefinition("ai-deepseek", deepseekHandler, "DeepSeek AI node"),
  createNodeDefinition("ai-reasoning", aiHandler, "Reasoning AI node"),

  // Trigger nodes - with specialized handlers
  createNodeDefinition(
    "trigger-webhook",
    triggerHandler,
    "Webhook trigger node",
  ),
  createNodeDefinition(
    "trigger-schedule",
    scheduleHandler,
    "Cron-based schedule trigger node",
  ),
  createNodeDefinition("trigger-imap", triggerHandler, "IMAP trigger node"),
  createNodeDefinition(
    "trigger-chat-message",
    triggerHandler,
    "Chat message trigger node",
  ),
  createNodeDefinition("trigger-email", triggerHandler, "Email trigger node"),
  createNodeDefinition("trigger-gmail", triggerHandler, "Gmail trigger node"),

  // Action nodes - with specialized handlers
  createNodeDefinition(
    "action-email",
    emailActionHandler,
    "Email action node with SMTP support",
  ),
  createNodeDefinition(
    "action-webhook",
    webhookActionHandler,
    "Webhook action node with HTTP support",
  ),
  createNodeDefinition(
    "action-save-db",
    actionHandler,
    "Database save action node",
  ),
  createNodeDefinition("action-twitter", actionHandler, "Twitter action node"),
  createNodeDefinition(
    "action-telegram",
    actionHandler,
    "Telegram action node",
  ),
  createNodeDefinition(
    "social-telegram",
    actionHandler,
    "Telegram social node alias for frontend",
  ),
  createNodeDefinition(
    "action-linkedin",
    actionHandler,
    "LinkedIn action node",
  ),
  createNodeDefinition(
    "social-linkedin",
    actionHandler,
    "LinkedIn social node alias for frontend",
  ),
  createNodeDefinition(
    "action-facebook",
    actionHandler,
    "Facebook action node",
  ),
  createNodeDefinition(
    "social-facebook",
    actionHandler,
    "Facebook social node alias for frontend",
  ),
  createNodeDefinition(
    "action-whatsapp",
    actionHandler,
    "WhatsApp action node",
  ),
  createNodeDefinition(
    "social-whatsapp",
    actionHandler,
    "WhatsApp social node alias for frontend",
  ),
  createNodeDefinition("action-tiktok", actionHandler, "TikTok action node"),
  createNodeDefinition("action-youtube", actionHandler, "YouTube action node"),
  createNodeDefinition(
    "social-youtube",
    actionHandler,
    "YouTube social node alias for frontend",
  ),
  createNodeDefinition("calendar-google", coreHandler, "Google Calendar node"),
  createNodeDefinition(
    "data-google-sheets",
    coreHandler,
    "Google Sheets data node",
  ),
  createNodeDefinition(
    "trigger-google-sheets",
    triggerHandler,
    "Google Sheets trigger node alias for frontend",
  ),
  createNodeDefinition("data-gmail", actionHandler, "Google Gmail node"),

  // Core / utility nodes - with specialized handlers
  createNodeDefinition(
    "core-http-request",
    coreHttpRequestHandler,
    "HTTP request core node",
  ),
  createNodeDefinition(
    "data-supabase",
    dataSupabaseHandler,
    "Supabase data node",
  ),
  createNodeDefinition(
    "core-code-js",
    codeJSHandler,
    "JavaScript execution core node with sandboxing",
  ),
  createNodeDefinition(
    "core-code-python",
    codePythonHandler,
    "Python execution core node with sandboxing",
  ),
  createNodeDefinition("core-if", coreHandler, "Conditional core node"),
  createNodeDefinition("core-switch", coreHandler, "Switch core node"),
  createNodeDefinition("core-set", coreHandler, "Set variable core node"),
  createNodeDefinition("core-transform", coreHandler, "Transform core node"),

  // Logic nodes - with specialized handlers
  createNodeDefinition("logic-if", logicIfHandler, "Logic IF conditional node"),
  createNodeDefinition(
    "logic-delay",
    logicDelayHandler,
    "Logic delay/wait node",
  ),
  createNodeDefinition(
    "logic-loop",
    logicLoopHandler,
    "Logic loop iteration node",
  ),

  // Input / system nodes
  createNodeDefinition("group", fallbackHandler, "Grouping node"),
  createNodeDefinition("manual-input", fallbackHandler, "Manual input node"),
  createNodeDefinition("webhook-input", fallbackHandler, "Webhook input node"),
  createNodeDefinition("file-input", fallbackHandler, "File input node"),
  createNodeDefinition("memory", fallbackHandler, "Memory node"),
  createNodeDefinition("email", actionHandler, "Basic email node"),
];

for (const node of builtInNodes) {
  nodeRegistry.register(node);
}

// Web search aliases
nodeRegistry.register({
  type: "tool-serpapi-search",
  handler: webSearchHandler,
  description: "Web search node (SerpAPI/DuckDuckGo)",
});

nodeRegistry.register({
  type: "tool-web-search",
  handler: webSearchHandler,
  description: "Web search node",
});

nodeRegistry.register({
  type: "web-search",
  handler: webSearchHandler,
  description: "Web search node",
});

// Manual trigger
nodeRegistry.register({
  type: "trigger-manual",
  handler: triggerHandler,
  description: "Manual input trigger with structured fields",
});

// core-set variable setter - ENHANCED
nodeRegistry.register({
  type: "core-set",
  handler: async (context: any) => {
    const variables: Record<string, any> = {};
    if (
      context.config?.variables &&
      typeof context.config.variables === "object" &&
      !Array.isArray(context.config.variables)
    ) {
      Object.assign(variables, context.config.variables);
    }

    const safeExpressions: Record<string, () => any> = {
      "new Date().toISOString().slice(0,10)": () =>
        new Date().toISOString().slice(0, 10),
      "new Date().toISOString()": () => new Date().toISOString(),
      "Date.now()": () => Date.now(),
      today: () => new Date().toISOString().slice(0, 10),
    };

    for (const [key, value] of Object.entries(context.config || {})) {
      if (
        ["isConfigured", "variables", "triggerName", "inputSchema"].includes(
          key,
        )
      )
        continue;

      if (typeof value === "string") {
        const trimmed = value.trim();
        if (safeExpressions[trimmed]) {
          variables[key] = safeExpressions[trimmed]();
        } else if (trimmed.startsWith("{{") && trimmed.endsWith("}}")) {
          variables[key] = "";
        } else {
          variables[key] = value;
        }
      } else {
        variables[key] = value;
      }
    }

    if (context.input?.market) {
      variables.market = variables.market || context.input.market;
    }
    if (context.input?.topic) {
      variables.topic = variables.topic || context.input.topic;
    }
    if (context.input?.timeScope) {
      variables.timeScope = variables.timeScope || context.input.timeScope;
    }

    const text = Object.entries(variables)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");

    return {
      success: true,
      output: {
        text,
        message: `Variables set: ${Object.keys(variables).join(", ")}`,
        data: variables,
        ...variables,
      },
      logs: [
        `core-set: stored variables: ${JSON.stringify(variables).slice(0, 200)}`,
      ],
    };
  },
  description: "Set workflow variables",
});
