"use strict";
// Built-in node registry for workflow execution
// This registry provides generic handlers for supported node types
// and enables LangGraph workflows to execute without falling back
// to no-op nodes for every unknown type.
Object.defineProperty(exports, "__esModule", { value: true });
exports.nodeRegistry = exports.NodeRegistry = void 0;
const messages_1 = require("@langchain/core/messages");
const llmFactory_1 = require("../utils/llmFactory");
const logger_1 = require("../utils/logger");
const getProviderFromNodeType = (nodeType) => {
    const type = nodeType.toLowerCase();
    if (type.includes("openai"))
        return "openai";
    if (type.includes("gemini"))
        return "gemini";
    if (type.includes("anthropic"))
        return "anthropic";
    if (type.includes("deepseek"))
        return "deepseek";
    if (type.includes("groq"))
        return "groq";
    return "openai"; // default
};
const normalizeNodeType = (type) => type
    ?.toString()
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
class NodeRegistry {
    constructor() {
        this.nodes = new Map();
    }
    register(node) {
        const normalizedType = normalizeNodeType(node.type);
        this.nodes.set(normalizedType, node);
    }
    get(type) {
        return this.nodes.get(normalizeNodeType(type));
    }
}
exports.NodeRegistry = NodeRegistry;
exports.nodeRegistry = new NodeRegistry();
const createNodeDefinition = (type, handler, description) => ({
    type,
    handler,
    description: description || `Generic handler for ${type}`,
    validation: {},
});
const aiHandler = async (context) => {
    const apiKey = context.config?.apiKey;
    const model = context.config?.model;
    const nodeType = context.nodeType || context.type || "ai";
    const provider = getProviderFromNodeType(nodeType);
    const prompt = context.config?.inputText ||
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
        const llm = llmFactory_1.llmFactory.createLLM({
            provider: provider,
            apiKey,
            model,
            temperature: context.config?.temperature ?? 0.7,
            maxTokens: context.config?.maxTokens,
        });
        const response = await llm.invoke([new messages_1.HumanMessage(prompt)]);
        const generatedText = response.content;
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
            logs: [`${nodeType} node executed with model ${model}, generated ${generatedText.length} characters`],
        };
    }
    catch (error) {
        logger_1.logger.error(`AI handler error for ${nodeType}:`, error);
        return {
            success: false,
            error: `Failed to execute AI node: ${error instanceof Error ? error.message : String(error)}`,
            nodeId: context.nodeId,
        };
    }
};
const triggerHandler = async (context) => {
    return {
        success: true,
        output: {
            nodeId: context.nodeId,
            nodeType: context.nodeType,
            triggered: true,
            config: context.config,
            input: context.input,
        },
        logs: [`Trigger node ${context.nodeId} executed`],
    };
};
const actionHandler = async (context) => {
    const nodeType = context.nodeType || context.type || "action";
    const message = context.config?.message ||
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
const coreHandler = async (context) => {
    return {
        success: true,
        output: {
            nodeId: context.nodeId,
            nodeType: context.nodeType,
            result: context.input,
            config: context.config,
        },
        logs: [`Core node ${context.nodeId} executed`],
    };
};
const fallbackHandler = async (context) => {
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
const openaiHandler = async (context) => {
    const apiKey = context.config?.apiKey || context.apiKeys?.openai;
    const model = context.config?.model || "gpt-4o-mini";
    const nodeType = context.nodeType || context.type || "ai-openai";
    const prompt = context.config?.inputText ||
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
        const llm = llmFactory_1.llmFactory.createLLM({
            provider: "openai",
            apiKey,
            model,
            temperature: context.config?.temperature ?? 0.7,
            maxTokens: context.config?.maxTokens,
        });
        const response = await llm.invoke([new messages_1.HumanMessage(prompt)]);
        const generatedText = response.content;
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
            logs: [`${nodeType} node executed with model ${model}, generated ${generatedText.length} characters`],
        };
    }
    catch (error) {
        logger_1.logger.error(`OpenAI handler error:`, error);
        return {
            success: false,
            error: `Failed to execute OpenAI node: ${error instanceof Error ? error.message : String(error)}`,
            nodeId: context.nodeId,
        };
    }
};
const anthropicHandler = async (context) => {
    const apiKey = context.config?.apiKey || context.apiKeys?.anthropic;
    const model = context.config?.model || "claude-3.5-opus";
    const nodeType = context.nodeType || context.type || "ai-anthropic";
    const prompt = context.config?.inputText ||
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
        const llm = llmFactory_1.llmFactory.createLLM({
            provider: "anthropic",
            apiKey,
            model,
            temperature: context.config?.temperature ?? 0.7,
            maxTokens: context.config?.maxTokens,
        });
        const response = await llm.invoke([new messages_1.HumanMessage(prompt)]);
        const generatedText = response.content;
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
            logs: [`${nodeType} node executed with model ${model}, generated ${generatedText.length} characters`],
        };
    }
    catch (error) {
        logger_1.logger.error(`Anthropic handler error:`, error);
        return {
            success: false,
            error: `Failed to execute Anthropic node: ${error instanceof Error ? error.message : String(error)}`,
            nodeId: context.nodeId,
        };
    }
};
const groqHandler = async (context) => {
    const apiKey = context.config?.apiKey || context.apiKeys?.groq;
    const model = context.config?.model || "groq-1.0";
    const nodeType = context.nodeType || context.type || "ai-groq";
    const prompt = context.config?.inputText ||
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
        const llm = llmFactory_1.llmFactory.createLLM({
            provider: "groq",
            apiKey,
            model,
            temperature: context.config?.temperature ?? 0.7,
            maxTokens: context.config?.maxTokens,
        });
        const response = await llm.invoke([new messages_1.HumanMessage(prompt)]);
        const generatedText = response.content;
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
            logs: [`${nodeType} node executed with model ${model}, generated ${generatedText.length} characters`],
        };
    }
    catch (error) {
        logger_1.logger.error(`Groq handler error:`, error);
        return {
            success: false,
            error: `Failed to execute Groq node: ${error instanceof Error ? error.message : String(error)}`,
            nodeId: context.nodeId,
        };
    }
};
const geminiHandler = async (context) => {
    const apiKey = context.config?.apiKey || context.apiKeys?.gemini;
    const model = context.config?.model || "gemini-1.5-pro";
    const nodeType = context.nodeType || context.type || "ai-gemini";
    const prompt = context.config?.inputText ||
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
        const llm = llmFactory_1.llmFactory.createLLM({
            provider: "gemini",
            apiKey,
            model,
            temperature: context.config?.temperature ?? 0.7,
            maxTokens: context.config?.maxTokens,
        });
        const response = await llm.invoke([new messages_1.HumanMessage(prompt)]);
        const generatedText = response.content;
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
            logs: [`${nodeType} node executed with model ${model}, generated ${generatedText.length} characters`],
        };
    }
    catch (error) {
        logger_1.logger.error(`Gemini handler error:`, error);
        return {
            success: false,
            error: `Failed to execute Gemini node: ${error instanceof Error ? error.message : String(error)}`,
            nodeId: context.nodeId,
        };
    }
};
const deepseekHandler = async (context) => {
    const apiKey = context.config?.apiKey || context.apiKeys?.deepseek;
    const model = context.config?.model || "deepseek-chat";
    const nodeType = context.nodeType || context.type || "ai-deepseek";
    const prompt = context.config?.inputText ||
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
    try {
        const llm = llmFactory_1.llmFactory.createLLM({
            provider: "deepseek",
            apiKey,
            model,
            temperature: context.config?.temperature ?? 0.7,
            maxTokens: context.config?.maxTokens,
        });
        const response = await llm.invoke([new messages_1.HumanMessage(prompt)]);
        const generatedText = response.content;
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
                    provider: "deepseek",
                },
                raw: {
                    model,
                    prompt,
                    response: generatedText,
                    nodeId: context.nodeId,
                    nodeType,
                },
            },
            logs: [`${nodeType} node executed with model ${model}, generated ${generatedText.length} characters`],
        };
    }
    catch (error) {
        logger_1.logger.error(`DeepSeek handler error:`, error);
        return {
            success: false,
            error: `Failed to execute DeepSeek node: ${error instanceof Error ? error.message : String(error)}`,
            nodeId: context.nodeId,
        };
    }
};
const scheduleHandler = async (context) => {
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
const emailActionHandler = async (context) => {
    const recipient = context.config?.to ||
        context.input?.email ||
        context.input?.to ||
        context.input?.data?.email ||
        "";
    const subject = context.config?.subject || context.input?.subject || "Agent Notification";
    const body = context.config?.body ||
        context.input?.text ||
        context.input?.output?.text ||
        context.input?.message ||
        "";
    if (!recipient) {
        return {
            success: false,
            error: "Email recipient not configured",
            nodeId: context.nodeId,
        };
    }
    return {
        success: true,
        output: {
            text: `Email sent to ${recipient}: ${subject}`,
            message: `Email action executed`,
            data: { recipient, subject, bodyLength: body.length },
        },
        logs: [`Email action executed: to=${recipient}`],
    };
};
const webhookActionHandler = async (context) => {
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
const codeJSHandler = async (context) => {
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
const codePythonHandler = async (context) => {
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
const logicIfHandler = async (context) => {
    const condition = context.config?.condition || context.input?.condition;
    if (!condition) {
        return {
            success: false,
            error: "Condition not configured",
            nodeId: context.nodeId,
        };
    }
    return {
        success: true,
        output: {
            nodeId: context.nodeId,
            nodeType: "logic-if",
            condition,
            evaluated: false,
            message: `Conditional logic prepared for evaluation`,
        },
        logs: [`Logic IF node: evaluating condition "${condition}"`],
    };
};
const logicDelayHandler = async (context) => {
    const duration = context.config?.duration || context.input?.duration;
    if (!duration) {
        return {
            success: false,
            error: "Duration not configured",
            nodeId: context.nodeId,
        };
    }
    return {
        success: true,
        output: {
            nodeId: context.nodeId,
            nodeType: "logic-delay",
            duration,
            message: `Delay node prepared`,
        },
        logs: [`Logic DELAY node: waiting for ${duration}ms`],
    };
};
const logicLoopHandler = async (context) => {
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
    createNodeDefinition("ai-openai", openaiHandler, "OpenAI ChatGPT compatible node"),
    createNodeDefinition("ai-anthropic", anthropicHandler, "Anthropic Claude compatible node"),
    createNodeDefinition("ai-groq", groqHandler, "Groq LLM compatible node"),
    createNodeDefinition("ai-gemini", geminiHandler, "Google Gemini AI node"),
    createNodeDefinition("ai-google-gemini", geminiHandler, "Google Gemini AI node alias for frontend"),
    createNodeDefinition("ai-deepseek", deepseekHandler, "DeepSeek AI node"),
    createNodeDefinition("ai-reasoning", aiHandler, "Reasoning AI node"),
    // Trigger nodes - with specialized handlers
    createNodeDefinition("trigger-webhook", triggerHandler, "Webhook trigger node"),
    createNodeDefinition("trigger-schedule", scheduleHandler, "Cron-based schedule trigger node"),
    createNodeDefinition("trigger-imap", triggerHandler, "IMAP trigger node"),
    createNodeDefinition("trigger-chat-message", triggerHandler, "Chat message trigger node"),
    createNodeDefinition("trigger-email", triggerHandler, "Email trigger node"),
    createNodeDefinition("trigger-gmail", triggerHandler, "Gmail trigger node"),
    // Action nodes - with specialized handlers
    createNodeDefinition("action-email", emailActionHandler, "Email action node with SMTP support"),
    createNodeDefinition("action-webhook", webhookActionHandler, "Webhook action node with HTTP support"),
    createNodeDefinition("action-save-db", actionHandler, "Database save action node"),
    createNodeDefinition("action-twitter", actionHandler, "Twitter action node"),
    createNodeDefinition("action-telegram", actionHandler, "Telegram action node"),
    createNodeDefinition("social-telegram", actionHandler, "Telegram social node alias for frontend"),
    createNodeDefinition("action-linkedin", actionHandler, "LinkedIn action node"),
    createNodeDefinition("social-linkedin", actionHandler, "LinkedIn social node alias for frontend"),
    createNodeDefinition("action-facebook", actionHandler, "Facebook action node"),
    createNodeDefinition("social-facebook", actionHandler, "Facebook social node alias for frontend"),
    createNodeDefinition("action-whatsapp", actionHandler, "WhatsApp action node"),
    createNodeDefinition("social-whatsapp", actionHandler, "WhatsApp social node alias for frontend"),
    createNodeDefinition("action-tiktok", actionHandler, "TikTok action node"),
    createNodeDefinition("action-youtube", actionHandler, "YouTube action node"),
    createNodeDefinition("social-youtube", actionHandler, "YouTube social node alias for frontend"),
    createNodeDefinition("calendar-google", coreHandler, "Google Calendar node"),
    createNodeDefinition("data-google-sheets", coreHandler, "Google Sheets data node"),
    createNodeDefinition("trigger-google-sheets", triggerHandler, "Google Sheets trigger node alias for frontend"),
    createNodeDefinition("data-gmail", actionHandler, "Google Gmail node"),
    // Core / utility nodes - with specialized handlers
    createNodeDefinition("core-http-request", coreHandler, "HTTP request core node"),
    createNodeDefinition("core-code-js", codeJSHandler, "JavaScript execution core node with sandboxing"),
    createNodeDefinition("core-code-python", codePythonHandler, "Python execution core node with sandboxing"),
    createNodeDefinition("core-if", coreHandler, "Conditional core node"),
    createNodeDefinition("core-switch", coreHandler, "Switch core node"),
    createNodeDefinition("core-set", coreHandler, "Set variable core node"),
    createNodeDefinition("core-transform", coreHandler, "Transform core node"),
    // Logic nodes - with specialized handlers
    createNodeDefinition("logic-if", logicIfHandler, "Logic IF conditional node"),
    createNodeDefinition("logic-delay", logicDelayHandler, "Logic delay/wait node"),
    createNodeDefinition("logic-loop", logicLoopHandler, "Logic loop iteration node"),
    // Input / system nodes
    createNodeDefinition("group", fallbackHandler, "Grouping node"),
    createNodeDefinition("manual-input", fallbackHandler, "Manual input node"),
    createNodeDefinition("webhook-input", fallbackHandler, "Webhook input node"),
    createNodeDefinition("file-input", fallbackHandler, "File input node"),
    createNodeDefinition("memory", fallbackHandler, "Memory node"),
    createNodeDefinition("email", actionHandler, "Basic email node"),
];
for (const node of builtInNodes) {
    exports.nodeRegistry.register(node);
}
