/**
 * Advanced LangGraph Tool Registry System
 * Integrates all node types as reusable LangChain tools
 */

import {
  StructuredTool,
  type StructuredToolParams,
} from "@langchain/core/tools";
import { z } from "zod";
import { nodeRegistry } from "../nodes";
import {
  NodeExecutionContext,
  NodeExecutionResult,
  AgentStateType,
} from "./langgraphState";
import { logger } from "./logger";

const normalizeNodeType = (type: string) =>
  type
    ?.toString()
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

/**
 * Advanced tool wrapper for LangGraph nodes
 */
export class LangGraphNodeTool extends StructuredTool<
  Record<string, any>,
  any
> {
  name: string;
  description: string;
  schema: z.ZodSchema;
  nodeId: string;
  nodeType: string;
  nodeConfig: Record<string, any>;
  apiKeys: Record<string, any>;

  constructor(
    nodeId: string,
    nodeType: string,
    nodeConfig: Record<string, any>,
    apiKeys: Record<string, any>,
    description: string,
    schema: z.ZodSchema,
  ) {
    super({
      name: nodeId,
      description,
      schema,
    } as any);

    this.name = nodeId;
    this.description = description;
    this.schema = schema;
    this.nodeId = nodeId;
    this.nodeType = nodeType;
    this.nodeConfig = nodeConfig;
    this.apiKeys = apiKeys;
  }

  async _call(input: z.infer<z.ZodSchema>): Promise<string> {
    try {
      const nodeDefinition = nodeRegistry.get(normalizeNodeType(this.nodeType));
      if (!nodeDefinition) {
        logger.info(
          `No registry entry for node type '${this.nodeType}', using fallback execution.`,
        );

        const fallbackOutput = await this.executeFallback(input as any);
        return JSON.stringify(fallbackOutput);
      }

      const result = await nodeDefinition.handler({
        nodeId: this.nodeId,
        nodeType: this.nodeType,
        config: this.nodeConfig,
        input: input as any,
        apiKeys: this.apiKeys,
      } as any);

      return JSON.stringify(result);
    } catch (error) {
      logger.error(`Tool execution failed for node ${this.nodeId}`, {
        error: (error as Error).message,
        nodeType: this.nodeType,
      });
      throw error;
    }
  }

  private async executeFallback(input: any): Promise<any> {
    const result: any = {
      fallback: true,
      nodeId: this.nodeId,
      nodeType: this.nodeType,
      input,
      config: this.nodeConfig,
    };

    if (/\b(ai|gpt|chat|completion|reasoning)\b/i.test(this.nodeType)) {
      const prompt =
        input?.prompt || input?.text || JSON.stringify(input) || "default";
      result.message = `AI fallback response for ${this.nodeType}`;
      result.prompt = prompt;
      result.output = `Fallback AI response for ${prompt}`;
      return result;
    }

    if (
      /http|webhook|action|data|trigger|core|logic|schedule|event/i.test(
        this.nodeType,
      )
    ) {
      result.message = `Fallback executed node for ${this.nodeType}`;
      return result;
    }

    result.message = `Fallback node execution for ${this.nodeType}`;
    return result;
  }
}

/**
 * Tool registry for LangGraph execution
 */
export class AdvancedToolRegistry {
  private tools: Map<string, StructuredTool> = new Map();
  private nodeTools: Map<string, LangGraphNodeTool> = new Map();

  /**
   * Register a LangChain tool
   */
  registerTool(name: string, tool: StructuredTool): void {
    this.tools.set(name, tool);
    logger.debug(`Tool registered: ${name}`);
  }

  /**
   * Register a node as a tool
   */
  registerNodeTool(
    nodeId: string,
    nodeType: string,
    nodeConfig: Record<string, any>,
    apiKeys: Record<string, any>,
  ): LangGraphNodeTool | null {
    try {
      const normalizedType = normalizeNodeType(nodeType);
      const nodeDefinition = nodeRegistry.get(normalizedType);
      const schema = nodeDefinition?.validation?.input || z.any();
      const description =
        nodeDefinition?.description ||
        `Fallback execution for ${normalizedType}`;

      if (!nodeDefinition) {
        logger.info(
          `Node type '${nodeType}' not found; registering fallback tool.`,
        );
      }

      const tool = new LangGraphNodeTool(
        nodeId,
        nodeType,
        nodeConfig,
        apiKeys,
        description,
        schema,
      );

      this.nodeTools.set(nodeId, tool);
      this.tools.set(nodeId, tool);

      logger.debug(`Node tool registered: ${nodeId} (type: ${nodeType})`);
      return tool;
    } catch (error) {
      logger.error(`Failed to register node tool ${nodeId}`, {
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Get a tool by name
   */
  getTool(name: string): StructuredTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get a node tool
   */
  getNodeTool(nodeId: string): LangGraphNodeTool | undefined {
    return this.nodeTools.get(nodeId);
  }

  /**
   * Get all tools as a formatted string
   */
  getToolsDescription(): string {
    const descriptions: string[] = [];

    for (const [name, tool] of this.tools) {
      descriptions.push(`- ${name}: ${tool.description}`);
    }

    return descriptions.join("\n");
  }

  /**
   * Get all tools as an array
   */
  getAllTools(): StructuredTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get node tools only
   */
  getNodeTools(): LangGraphNodeTool[] {
    return Array.from(this.nodeTools.values());
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
    this.nodeTools.clear();
  }

  /**
   * Register all available node types as tools
   */
  registerAllNodeTypes(
    apiKeys: Record<string, any>,
  ): Map<string, LangGraphNodeTool> {
    const registeredTools = new Map<string, LangGraphNodeTool>();

    // This would be called during workflow graph building
    // Nodes will be registered individually as they're encountered

    return registeredTools;
  }
}

/**
 * Global tool registry instance
 */
export const globalToolRegistry = new AdvancedToolRegistry();

/**
 * Advanced tool executor with streaming support
 */
export class AdvancedToolExecutor {
  private registry: AdvancedToolRegistry;
  private streamCallback?: (event: any) => void;

  constructor(registry: AdvancedToolRegistry) {
    this.registry = registry;
  }

  /**
   * Set stream callback for real-time updates
   */
  setStreamCallback(callback: (event: any) => void): void {
    this.streamCallback = callback;
  }

  /**
   * Execute a tool with streaming support
   */
  async executeTool(
    toolName: string,
    input: Record<string, any>,
    state: AgentStateType,
  ): Promise<string> {
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

      return result as string;
    } catch (error) {
      const errorMessage = (error as Error).message;

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
  async executeNodeTool(
    nodeId: string,
    input: Record<string, any>,
    state: AgentStateType,
  ): Promise<NodeExecutionResult> {
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
      const parsedResult = JSON.parse(rawResult as string);
      const executionTime = Date.now() - startTime;

      if (parsedResult?.success === false) {
        const errorMessage =
          parsedResult.error || parsedResult.message || "Node execution failed";

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
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = (error as Error).message;

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
  getToolsList(): Array<{ name: string; description: string }> {
    return this.registry.getAllTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
    }));
  }
}

/**
 * Create tool executor instance
 */
export function createToolExecutor(
  registry: AdvancedToolRegistry,
): AdvancedToolExecutor {
  return new AdvancedToolExecutor(registry);
}

/**
 * Register nodes as tools for a specific workflow
 */
export function registerWorkflowNodes(
  registry: AdvancedToolRegistry,
  nodes: Array<{ id: string; type: string; config: Record<string, any> }>,
  apiKeys: Record<string, any>,
): Map<string, LangGraphNodeTool> {
  const registeredNodes = new Map<string, LangGraphNodeTool>();

  for (const node of nodes) {
    const tool = registry.registerNodeTool(
      node.id,
      node.type,
      node.config,
      apiKeys,
    );

    if (tool) {
      registeredNodes.set(node.id, tool);
    }
  }

  return registeredNodes;
}
