// Core execution engine interfaces and types

export interface ExecutionLog {
  id?: string;
  timestamp: Date;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  nodeId?: string;
  details?: Record<string, any>;
  data?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface ExecutionContext {
  workflowId: string;
  executionId: string;
  userId: string;
  variables: Record<string, any>;
  apiKeys: Record<string, any>;
  memory: {
    shortTerm: Record<string, any>;
    longTerm: VectorMemory[];
  };
  logs: ExecutionLog[];
  startTime: Date;
  status: "running" | "completed" | "failed" | "cancelled";
}

export interface ExecutionResult {
  success: boolean;
  output: Record<string, any>;
  logs: ExecutionLog[];
  errors: string[];
  executionTime: number;
  nodeResults: Record<string, any>;
  endTime?: Date;
  duration?: number;
  metrics?: {
    nodesExecuted: number;
    totalExecutionTime: number;
    memoryUsed: number;
    apiCalls: number;
    retries: number;
  };
  executionId?: string;
  status?: "success" | "failed" | "partial";
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  nodes: AdvancedNodeData[];
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
  }>;
  metadata?: Record<string, any>;
  settings?: {
    allowParallelExecution?: boolean;
    maxExecutionTime?: number;
    timeout?: number;
    retryPolicy?: {
      maxRetries: number;
      backoffMultiplier: number;
    };
    maxMemoryUsage?: number;
    enableDebugging?: boolean;
    logLevel?: string;
  };
  version?: string;
}

export interface AdvancedNodeData {
  id: string;
  type: AdvancedNodeType;
  label: string;
  position: { x: number; y: number };
  data: NodeConfig;
  retryCount?: number;
  timeout?: number;
  config?: any; // Legacy support
  executionState?: "pending" | "running" | "completed" | "failed";
  executionResult?: any;
  executionTime?: number;
}

export type AdvancedNodeType =
  | "ai-chat"
  | "ai-completion"
  | "ai-reasoning"
  | "ai-memory"
  | "ai-tool-calling"
  | "http-request"
  | "database-query"
  | "email-send"
  | "webhook-trigger"
  | "condition-branch"
  | "conditional-branch"
  | "loop"
  | "loop-controller"
  | "transform"
  | "memory-store"
  | "memory-retrieve"
  | "tool-execution"
  | "custom-function"
  | "multi-agent-orchestrator"
  | "human-approval"
  | "action-api-call"
  | "schedule-trigger"
  | "event-trigger";

export interface NodeConfig {
  type: AdvancedNodeType;
  inputs?: Record<string, any>;
  outputs?: Record<string, any>;
  config: Record<string, any>;
  validation?: {
    required?: string[];
    schema?: Record<string, any>;
  };
}

export interface VectorMemory {
  id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, any>;
  timestamp: Date;
  scope: string;
  similarity?: number;
}

export interface MemorySystem {
  store(memory: Omit<VectorMemory, "id" | "timestamp">): Promise<string>;
  retrieve(
    query: string,
    limit?: number,
    scope?: string,
  ): Promise<VectorMemory[]>;
  searchSimilar(
    embedding: number[],
    limit?: number,
    scope?: string,
  ): Promise<VectorMemory[]>;
  delete(id: string): Promise<boolean>;
  clear(scope?: string): Promise<void>;
}

export interface ToolRegistry {
  register(name: string, tool: any): void;
  get(name: string): any;
  list(): string[];
  execute(name: string, params: Record<string, any>): Promise<any>;
  update?(name: string, tool: any): Promise<void>;
  delete?(name: string): Promise<void>;
  getTool(name: string): Promise<any>;
  executeTool(tool: any, params: Record<string, any>): Promise<any>;
}

export interface PromptEngineering {
  optimize(prompt: string, context?: Record<string, any>): Promise<string>;
  generateSystemPrompt(
    type: string,
    config?: Record<string, any>,
  ): Promise<string>;
  validatePrompt(prompt: string): Promise<{ valid: boolean; errors: string[] }>;
}

export interface ExecutionEngine {
  execute(
    workflow: WorkflowDefinition,
    context: Partial<ExecutionContext>,
  ): Promise<ExecutionResult>;
}
