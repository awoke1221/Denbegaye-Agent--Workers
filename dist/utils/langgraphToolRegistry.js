"use strict";
/**
 * Advanced LangGraph Tool Registry System
 * Integrates all node types as reusable LangChain tools
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdvancedToolExecutor = exports.globalToolRegistry = exports.AdvancedToolRegistry = exports.LangGraphNodeTool = void 0;
exports.createToolExecutor = createToolExecutor;
exports.registerWorkflowNodes = registerWorkflowNodes;
const tools_1 = require("@langchain/core/tools");
const zod_1 = require("zod");
const nodes_1 = require("../nodes");
const logger_1 = require("./logger");
const normalizeNodeType = (type) => type
    ?.toString()
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
/**
 * Advanced tool wrapper for LangGraph nodes
 */
class LangGraphNodeTool extends tools_1.StructuredTool {
    constructor(nodeId, nodeType, nodeConfig, apiKeys, description, schema) {
        super({
            name: nodeId,
            description,
            schema,
        });
        this.name = nodeId;
        this.description = description;
        this.schema = schema;
        this.nodeId = nodeId;
        this.nodeType = nodeType;
        this.nodeConfig = nodeConfig;
        this.apiKeys = apiKeys;
    }
    async _call(input) {
        try {
            const nodeDefinition = nodes_1.nodeRegistry.get(normalizeNodeType(this.nodeType));
            if (!nodeDefinition) {
                logger_1.logger.info(`No registry entry for node type '${this.nodeType}', using fallback execution.`);
                const fallbackOutput = await this.executeFallback(input);
                return JSON.stringify(fallbackOutput);
            }
            // Extract the actual previous node output from the context object
            // The 'input' parameter is the full context from executeNode() which contains:
            // { nodeId, nodeType, config: resolvedConfig, input: previousOutput, previousOutputs, variables, apiKeys, ... }
            const handlerInput = input?.input ?? input;
            const resolvedConfig = input?.config ?? this.nodeConfig;
            const previousOutputs = input?.previousOutputs;
            const handlerVariables = input?.variables;
            const result = await nodeDefinition.handler({
                nodeId: this.nodeId,
                nodeType: this.nodeType,
                config: resolvedConfig,
                input: handlerInput,
                previousOutputs,
                variables: handlerVariables,
                apiKeys: this.apiKeys,
            });
            return JSON.stringify(result);
        }
        catch (error) {
            logger_1.logger.error(`Tool execution failed for node ${this.nodeId}`, {
                error: error.message,
                nodeType: this.nodeType,
            });
            throw error;
        }
    }
    async executeFallback(input) {
        const result = {
            fallback: true,
            nodeId: this.nodeId,
            nodeType: this.nodeType,
            input,
            config: this.nodeConfig,
        };
        if (/\b(ai|gpt|chat|completion|reasoning)\b/i.test(this.nodeType)) {
            const prompt = input?.prompt || input?.text || JSON.stringify(input) || "default";
            result.message = `AI fallback response for ${this.nodeType}`;
            result.prompt = prompt;
            result.output = `Fallback AI response for ${prompt}`;
            return result;
        }
        if (/http|webhook|action|data|trigger|core|logic|schedule|event/i.test(this.nodeType)) {
            result.message = `Fallback executed node for ${this.nodeType}`;
            return result;
        }
        result.message = `Fallback node execution for ${this.nodeType}`;
        return result;
    }
}
exports.LangGraphNodeTool = LangGraphNodeTool;
/**
 * Tool registry for LangGraph execution
 */
class AdvancedToolRegistry {
    constructor() {
        this.tools = new Map();
        this.nodeTools = new Map();
    }
    /**
     * Register a LangChain tool
     */
    registerTool(name, tool) {
        this.tools.set(name, tool);
        logger_1.logger.debug(`Tool registered: ${name}`);
    }
    /**
     * Register a node as a tool
     */
    registerNodeTool(nodeId, nodeType, nodeConfig, apiKeys) {
        try {
            const normalizedType = normalizeNodeType(nodeType);
            const nodeDefinition = nodes_1.nodeRegistry.get(normalizedType);
            const schema = nodeDefinition?.validation?.input || zod_1.z.any();
            const description = nodeDefinition?.description ||
                `Fallback execution for ${normalizedType}`;
            if (!nodeDefinition) {
                logger_1.logger.info(`Node type '${nodeType}' not found; registering fallback tool.`);
            }
            const tool = new LangGraphNodeTool(nodeId, nodeType, nodeConfig, apiKeys, description, schema);
            this.nodeTools.set(nodeId, tool);
            this.tools.set(nodeId, tool);
            logger_1.logger.debug(`Node tool registered: ${nodeId} (type: ${nodeType})`);
            return tool;
        }
        catch (error) {
            logger_1.logger.error(`Failed to register node tool ${nodeId}`, {
                error: error.message,
            });
            return null;
        }
    }
    /**
     * Get a tool by name
     */
    getTool(name) {
        return this.tools.get(name);
    }
    /**
     * Get a node tool
     */
    getNodeTool(nodeId) {
        return this.nodeTools.get(nodeId);
    }
    /**
     * Get all tools as a formatted string
     */
    getToolsDescription() {
        const descriptions = [];
        for (const [name, tool] of this.tools) {
            descriptions.push(`- ${name}: ${tool.description}`);
        }
        return descriptions.join("\n");
    }
    /**
     * Get all tools as an array
     */
    getAllTools() {
        return Array.from(this.tools.values());
    }
    /**
     * Get node tools only
     */
    getNodeTools() {
        return Array.from(this.nodeTools.values());
    }
    /**
     * Clear all tools
     */
    clear() {
        this.tools.clear();
        this.nodeTools.clear();
    }
    /**
     * Register all available node types as tools
     */
    registerAllNodeTypes(apiKeys) {
        const registeredTools = new Map();
        // This would be called during workflow graph building
        // Nodes will be registered individually as they're encountered
        return registeredTools;
    }
}
exports.AdvancedToolRegistry = AdvancedToolRegistry;
/**
 * Global tool registry instance
 */
exports.globalToolRegistry = new AdvancedToolRegistry();
/**
 * Advanced tool executor with streaming support
 */
class AdvancedToolExecutor {
    constructor(registry) {
        this.registry = registry;
    }
    /**
     * Set stream callback for real-time updates
     */
    setStreamCallback(callback) {
        this.streamCallback = callback;
    }
    /**
     * Execute a tool with streaming support
     */
    async executeTool(toolName, input, state) {
        const tool = this.registry.getTool(toolName);
        if (!tool) {
            throw new Error(`Tool '${toolName}' not found`);
        }
        try {
            this.streamCallback?.({
                type: "tool_call",
                toolName,
                input,
                timestamp: new Date(),
            });
            const result = await tool.invoke(input);
            this.streamCallback?.({
                type: "tool_result",
                toolName,
                result,
                timestamp: new Date(),
            });
            return result;
        }
        catch (error) {
            const errorMessage = error.message;
            this.streamCallback?.({
                type: "tool_error",
                toolName,
                error: errorMessage,
                timestamp: new Date(),
            });
            throw error;
        }
    }
    /**
     * Execute a node tool
     */
    async executeNodeTool(nodeId, input, state) {
        const tool = this.registry.getNodeTool(nodeId);
        if (!tool) {
            throw new Error(`Node tool '${nodeId}' not found`);
        }
        const startTime = Date.now();
        try {
            this.streamCallback?.({
                type: "node_start",
                nodeId,
                timestamp: new Date(),
            });
            const rawResult = await tool.invoke(input);
            const parsedResult = JSON.parse(rawResult);
            const executionTime = Date.now() - startTime;
            if (parsedResult?.success === false) {
                const errorMessage = parsedResult.error || parsedResult.message || "Node execution failed";
                this.streamCallback?.({
                    type: "node_error",
                    nodeId,
                    error: errorMessage,
                    result: parsedResult,
                    executionTime,
                    timestamp: new Date(),
                });
                return {
                    nodeId,
                    success: false,
                    data: parsedResult,
                    errors: [{ error: errorMessage, timestamp: new Date() }],
                    executionTime,
                };
            }
            this.streamCallback?.({
                type: "node_end",
                nodeId,
                result: parsedResult,
                executionTime,
                timestamp: new Date(),
            });
            return {
                nodeId,
                success: true,
                data: parsedResult,
                executionTime,
            };
        }
        catch (error) {
            const executionTime = Date.now() - startTime;
            const errorMessage = error.message;
            this.streamCallback?.({
                type: "node_error",
                nodeId,
                error: errorMessage,
                executionTime,
                timestamp: new Date(),
            });
            return {
                nodeId,
                success: false,
                data: {},
                errors: [{ error: errorMessage, timestamp: new Date() }],
                executionTime,
            };
        }
    }
    /**
     * Get tools as a list for prompt context
     */
    getToolsList() {
        return this.registry.getAllTools().map((tool) => ({
            name: tool.name,
            description: tool.description,
        }));
    }
}
exports.AdvancedToolExecutor = AdvancedToolExecutor;
/**
 * Create tool executor instance
 */
function createToolExecutor(registry) {
    return new AdvancedToolExecutor(registry);
}
/**
 * Register nodes as tools for a specific workflow
 */
function registerWorkflowNodes(registry, nodes, apiKeys) {
    const registeredNodes = new Map();
    for (const node of nodes) {
        const tool = registry.registerNodeTool(node.id, node.type, node.config, apiKeys);
        if (tool) {
            registeredNodes.set(node.id, tool);
        }
    }
    return registeredNodes;
}
