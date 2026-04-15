import { z } from "zod";

/**
 * Base interface for all node types
 */
export interface BaseNode {
  id: string;
  type: string;
  name: string;
  description: string;
  category: NodeCategory;
  icon?: string;
  color?: string;
}

/**
 * Node categories
 */
export type NodeCategory =
  | "ai"
  | "trigger"
  | "core"
  | "social"
  | "calendar"
  | "data";

/**
 * Node execution context
 */
export interface NodeExecutionContext {
  nodeId: string;
  input: Record<string, any>;
  variables: Record<string, any>;
  apiKeys: Record<string, string>;
  config: Record<string, any>;
  validation: NodeValidation;
}

/**
 * Node execution result
 */
export interface NodeExecutionResult {
  success: boolean;
  output?: any;
  error?: string;
  logs: string[];
  executionTime: number;
}

/**
 * Complete node execution result with nodeId
 */
export interface CompleteNodeExecutionResult extends NodeExecutionResult {
  nodeId: string;
}

/**
 * Node handler function type
 */
export type NodeHandler = (
  context: NodeExecutionContext,
) => Promise<NodeExecutionResult>;

/**
 * Node validation schema
 */
export interface NodeValidation {
  input: z.ZodSchema;
  output: z.ZodSchema;
}

/**
 * Complete node definition
 */
export interface NodeDefinition extends BaseNode {
  handler: NodeHandler;
  validation: NodeValidation;
  inputs: NodePort[];
  outputs: NodePort[];
  configSchema: z.ZodSchema;
}

/**
 * Node port definition
 */
export interface NodePort {
  id: string;
  label: string;
  type: "string" | "number" | "boolean" | "object" | "array" | "any";
  required?: boolean;
  description?: string;
}

/**
 * Registry for all available nodes
 */
export class NodeRegistry {
  private nodes = new Map<string, NodeDefinition>();

  register(node: NodeDefinition): void {
    this.nodes.set(node.type, node);
  }

  get(type: string): NodeDefinition | undefined {
    return this.nodes.get(type);
  }

  getAll(): NodeDefinition[] {
    return Array.from(this.nodes.values());
  }

  getByCategory(category: NodeCategory): NodeDefinition[] {
    return this.getAll().filter((node) => node.category === category);
  }
}

// Global node registry instance
export const nodeRegistry = new NodeRegistry();
