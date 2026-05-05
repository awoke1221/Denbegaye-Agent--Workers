/**
 * Core types for the AI agent builder system.
 */

/**
 * Represents a node in the agent workflow graph.
 */
export interface AgentNode {
  /** Unique identifier for the node */
  id: string;
  /** Display type of the node (e.g., 'ai-reasoning', 'webhook') */
  type: string;
  /** Position in the canvas */
  position: { x: number; y: number };
  /** Node-specific data */
  data: NodeData;
  /** Optional label */
  label?: string;
}

/**
 * Data payload for agent nodes.
 */
export interface NodeData {
  /** Node label */
  label: string;
  /** Node description */
  description?: string;
  /** Configuration parameters */
  config: Record<string, any>;
  /** Execution state */
  state?: NodeState;
}

/**
 * Execution state of a node.
 */
export interface NodeState {
  /** Current status */
  status: "idle" | "running" | "completed" | "error";
  /** Execution result */
  result?: any;
  /** Error message if failed */
  error?: string;
  /** Execution timestamp */
  executedAt?: Date;
}

/**
 * Represents a connection between nodes.
 */
export interface AgentEdge {
  /** Unique identifier */
  id: string;
  /** Source node ID */
  source: string;
  /** Target node ID */
  target: string;
  /** Source handle */
  sourceHandle?: string;
  /** Target handle */
  targetHandle?: string;
  /** Edge data */
  data?: Record<string, any>;
}

/**
 * Complete agent workflow definition.
 */
export interface AgentWorkflow {
  /** Unique identifier */
  id: string;
  /** Workflow name */
  name: string;
  /** Description */
  description?: string;
  /** Array of nodes */
  nodes: AgentNode[];
  /** Array of edges */
  edges: AgentEdge[];
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Owner user ID */
  userId: string;
  /** Workflow tags */
  tags?: string[];
}

export interface UserAgent {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  config: {
    nodes: AgentNode[];
    edges: AgentEdge[];
    [key: string]: any;
  };
  status: "draft" | "active" | "archived" | "error" | "published" | string;
  version?: string;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Execution context for running workflows.
 */
export interface ExecutionContext {
  /** Workflow being executed */
  workflow: AgentWorkflow;
  /** Current node being processed */
  currentNode?: AgentNode;
  /** Global variables */
  variables: Record<string, any>;
  /** Execution log */
  log: ExecutionLogEntry[];
  /** Start timestamp */
  startedAt: Date;
  /** Completion timestamp */
  completedAt?: Date;
}

/**
 * Log entry for workflow execution.
 */
export interface ExecutionLogEntry {
  /** Timestamp */
  timestamp: Date;
  /** Log level */
  level: "info" | "warn" | "error";
  /** Log message */
  message: string;
  /** Associated node ID */
  nodeId?: string;
  /** Additional data */
  data?: any;
}

/**
 * Result of workflow execution.
 */

export interface ExecutionResult {
  /** Success status */
  success: boolean;
  /** Final output */
  output?: any;
  /** Error details */
  error?: string;
  /** Execution duration in ms */
  duration: number;
  /** Execution log */
  log: ExecutionLogEntry[];
}
