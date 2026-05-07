import { z } from "zod";
import { AgentEdge, AgentNode } from "../jobs/types";

const AgentNodeTypeSchema = z.enum([
  "ai",
  "api",
  "email",
  "memory",
  "manual-input",
  "webhook-input",
  "file-input",
  "group",
  "ai-openai",
  "ai-gemini",
  "ai-deepseek",
  "logic-if",
  "logic-delay",
  "logic-loop",
  "action-twitter",
  "action-email",
  "action-save-db",
  "action-webhook",
  "action-telegram",
  "action-whatsapp",
  "action-linkedin",
  "action-facebook",
  "action-tiktok",
  "action-youtube",
  "ai-reasoning",
  "ai-anthropic",
  "ai-groq",
  "trigger-webhook",
  "trigger-schedule",
  "trigger-imap",
  "trigger-chat-message",
  "trigger-email",
  "trigger-gmail",
  "calendar-google",
  "data-google-sheets",
  "data-gmail",
  "core-http-request",
  "core-code-js",
  "core-code-python",
  "core-if",
  "core-switch",
  "core-set",
  "core-transform",
]);

const AgentNodeSchema = z.object({
  id: z.string().min(1),
  type: AgentNodeTypeSchema,
  config: z.record(z.any()).optional().default({}),
});

export interface AgentEdgeInput {
  from?: string;
  to?: string;
  source?: string;
  target?: string;
}

export const AgentEdgeInputSchema = z
  .union([
    z.object({ from: z.string().min(1), to: z.string().min(1) }),
    z.object({ source: z.string().min(1), target: z.string().min(1) }),
  ])
  .transform((edge) => ({
    from: "from" in edge ? edge.from : edge.source,
    to: "to" in edge ? edge.to : edge.target,
  }));

const AgentEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

export const normalizeAgentEdges = (
  edges: Array<AgentEdge | AgentEdgeInput>,
): AgentEdge[] =>
  edges.map((edge) => {
    const from = "from" in edge ? edge.from : edge.source;
    const to = "to" in edge ? edge.to : edge.target;

    if (!from || !to) {
      throw new Error("Edges must include `from/to` or `source/target`");
    }

    return { from, to };
  });

const AgentGraphSchema = z.object({
  nodes: z.array(AgentNodeSchema).nonempty(),
  edges: z.array(AgentEdgeInputSchema).optional().default([]),
});

export type ValidationResult = {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
  normalizedEdges?: AgentEdge[];
  executionPlan?: {
    executionOrder: string[];
    nodeDependencies: Record<string, string[]>;
    potentialIssues: string[];
  };
};

export const validateAgentGraph = (
  nodes: AgentNode[],
  edges: Array<AgentEdge | AgentEdgeInput>,
): ValidationResult => {
  // Normalize edges first
  const normalizedEdges = normalizeAgentEdges(edges);

  // Only validate node-level execution requirements
  const executionValidation = validateNodeExecutionRequirements(
    nodes,
    normalizedEdges,
  );

  // Check for basic graph issues as warnings
  const graphValidation = validateBasicGraphStructure(nodes, normalizedEdges);
  executionValidation.warnings.push(...graphValidation.warnings);

  // Always generate execution plan (even with warnings)
  const executionPlan = generateExecutionPlan(nodes, normalizedEdges);
  const valid = executionValidation.valid;

  return {
    valid,
    normalizedEdges,
    errors:
      executionValidation.errors.length > 0
        ? executionValidation.errors
        : undefined,
    warnings:
      executionValidation.warnings.length > 0
        ? executionValidation.warnings
        : undefined,
    executionPlan,
  };
};

// Enhanced node-level validation
interface NodeExecutionValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validateNodeExecutionRequirements(
  nodes: AgentNode[],
  edges: AgentEdge[],
): NodeExecutionValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for nodes with missing required configuration
  nodes.forEach((node) => {
    const configValidation = validateNodeConfig(node);
    errors.push(...configValidation.errors);
    warnings.push(...configValidation.warnings);
  });

  // Check for execution dependencies and potential issues
  const dependencyValidation = validateExecutionDependencies(nodes, edges);
  errors.push(...dependencyValidation.errors);
  warnings.push(...dependencyValidation.warnings);

  // Check for execution flow issues
  const flowValidation = validateExecutionFlow(nodes, edges);
  errors.push(...flowValidation.errors);
  warnings.push(...flowValidation.warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateNodeConfig(node: AgentNode): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  switch (node.type) {
    case "ai-openai":
    case "ai-gemini":
    case "ai-anthropic":
    case "ai-groq":
    case "ai-deepseek":
      if (
        !node.config?.prompt &&
        !node.config?.messages &&
        !node.input?.prompt
      ) {
        errors.push(
          `Node ${node.id}: AI nodes require a prompt or messages configuration`,
        );
      }
      if (!node.config?.model && !node.config?.apiKey) {
        warnings.push(
          `Node ${node.id}: AI nodes should specify a model and API key`,
        );
      }
      break;

    case "api":
    case "core-http-request":
      if (!node.config?.url && !node.config?.endpoint) {
        errors.push(
          `Node ${node.id}: API nodes require a URL or endpoint configuration`,
        );
      }
      if (!node.config?.method) {
        warnings.push(
          `Node ${node.id}: API nodes should specify an HTTP method (defaulting to GET)`,
        );
      }
      break;

    case "action-email":
      if (!node.config?.to && !node.config?.recipients && !node.input?.to) {
        errors.push(
          `Node ${node.id}: Email action nodes require recipient configuration`,
        );
      }
      break;

    case "action-webhook":
      if (!node.config?.url && !node.input?.url) {
        errors.push(
          `Node ${node.id}: Webhook action nodes require a URL configuration`,
        );
      }
      if (!node.config?.method) {
        warnings.push(
          `Node ${node.id}: Webhook nodes should specify an HTTP method (defaulting to POST)`,
        );
      }
      break;

    case "trigger-schedule":
      if (!node.config?.cronExpression && !node.config?.interval) {
        errors.push(
          `Node ${node.id}: Schedule trigger nodes require a cron expression or interval`,
        );
      }
      break;

    case "core-code-js":
    case "core-code-python":
      if (!node.config?.code && !node.input?.code) {
        errors.push(
          `Node ${node.id}: Code execution nodes require a code block configuration`,
        );
      }
      break;

    case "logic-delay":
      if (!node.config?.duration && !node.input?.duration) {
        errors.push(
          `Node ${node.id}: Delay nodes require a duration configuration`,
        );
      }
      break;

    case "logic-if":
    case "core-if":
      if (!node.config?.condition && !node.input?.condition) {
        errors.push(
          `Node ${node.id}: Logic nodes require a condition configuration`,
        );
      }
      break;

    case "logic-loop":
      if (!node.config?.iterations && !node.config?.condition) {
        errors.push(
          `Node ${node.id}: Loop nodes require either iterations count or exit condition`,
        );
      }
      break;

    case "core-set":
    case "core-transform":
      if (!node.config?.expression) {
        errors.push(
          `Node ${node.id}: Transform nodes require an expression configuration`,
        );
      }
      break;

    case "action-save-db":
      if (!node.config?.table && !node.config?.collection) {
        errors.push(
          `Node ${node.id}: Database action nodes require table/collection configuration`,
        );
      }
      break;
  }

  return { errors, warnings };
}

function validateExecutionDependencies(
  nodes: AgentNode[],
  edges: AgentEdge[],
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Build dependency graph
  const dependencyGraph: Record<string, string[]> = {};
  nodes.forEach((node) => {
    dependencyGraph[node.id] = [];
  });

  edges.forEach((edge) => {
    if (dependencyGraph[edge.from]) {
      dependencyGraph[edge.from].push(edge.to);
    }
  });

  // Check for nodes that depend on specific input types
  nodes.forEach((node) => {
    const dependencies = edges
      .filter((edge) => edge.to === node.id)
      .map((edge) => edge.from);

    switch (node.type) {
      case "logic-if":
      case "core-if":
        if (dependencies.length === 0) {
          warnings.push(
            `Node ${node.id}: Logic nodes work better with input dependencies for conditional evaluation`,
          );
        }
        break;

      case "core-transform":
      case "core-set":
        if (dependencies.length === 0) {
          warnings.push(
            `Node ${node.id}: Transform nodes should have input dependencies to transform`,
          );
        }
        break;
    }
  });

  return { errors, warnings };
}

function validateExecutionFlow(
  nodes: AgentNode[],
  edges: AgentEdge[],
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for isolated nodes (nodes with no connections)
  const connectedNodes = new Set<string>();
  edges.forEach((edge) => {
    connectedNodes.add(edge.from);
    connectedNodes.add(edge.to);
  });

  nodes.forEach((node) => {
    if (!connectedNodes.has(node.id)) {
      warnings.push(
        `Node ${node.id}: Isolated nodes will not execute unless they are starting points`,
      );
    }
  });

  // Check for potential infinite loops in logic nodes
  const loopNodes = nodes.filter((node) => node.type === "logic-loop");
  loopNodes.forEach((loopNode) => {
    const outgoingEdges = edges.filter((edge) => edge.from === loopNode.id);
    if (outgoingEdges.length === 0) {
      warnings.push(
        `Node ${loopNode.id}: Loop nodes should have outgoing connections for iteration results`,
      );
    }
  });

  return { errors, warnings };
}

function generateExecutionPlan(
  nodes: AgentNode[],
  edges: AgentEdge[],
): ValidationResult["executionPlan"] {
  try {
    // Use topological sort to determine execution order
    const executionOrder = topologicalSort(nodes, edges);

    // Build dependency map
    const nodeDependencies: Record<string, string[]> = {};
    nodes.forEach((node) => {
      nodeDependencies[node.id] = edges
        .filter((edge) => edge.to === node.id)
        .map((edge) => edge.from);
    });

    // Identify potential execution issues
    const potentialIssues: string[] = [];

    // Check for nodes that might cause performance issues
    const heavyNodes = nodes.filter((node) =>
      [
        "ai-openai",
        "ai-gemini",
        "ai-anthropic",
        "api",
        "core-http-request",
      ].includes(node.type),
    );

    if (heavyNodes.length > 5) {
      potentialIssues.push(
        "Workflow contains many heavy operations - consider optimizing for performance",
      );
    }

    // Check for long dependency chains
    const maxDepth = Math.max(
      ...executionOrder.map((nodeId, index) => {
        const dependencies = nodeDependencies[nodeId];
        return dependencies.length > 0 ? index : 0;
      }),
    );

    if (maxDepth > 10) {
      potentialIssues.push(
        "Workflow has deep dependency chains - consider breaking into smaller workflows",
      );
    }

    return {
      executionOrder,
      nodeDependencies,
      potentialIssues,
    };
  } catch (error) {
    return {
      executionOrder: [],
      nodeDependencies: {},
      potentialIssues: [`Failed to generate execution plan: ${error}`],
    };
  }
}

function validateBasicGraphStructure(
  nodes: AgentNode[],
  edges: AgentEdge[],
): { warnings: string[] } {
  const warnings: string[] = [];

  // Check for duplicate node IDs
  const nodeIds = nodes.map((node) => node.id);
  const duplicates = nodeIds.filter(
    (id, index) => nodeIds.indexOf(id) !== index,
  );
  const uniqueDuplicates = Array.from(new Set(duplicates));
  if (uniqueDuplicates.length > 0) {
    warnings.push(`Duplicate node id(s): ${uniqueDuplicates.join(", ")}`);
  }

  // Check for edges referencing non-existent nodes
  const nodeIdSet = new Set(nodeIds);
  edges.forEach((edge) => {
    if (!nodeIdSet.has(edge.from)) {
      warnings.push(`Edge source node ${edge.from} does not exist`);
    }
    if (!nodeIdSet.has(edge.to)) {
      warnings.push(`Edge target node ${edge.to} does not exist`);
    }
  });

  return { warnings };
}

// Topological sort helper (moved from agentEngine.ts for reuse)
function topologicalSort(nodes: AgentNode[], edges: AgentEdge[]): string[] {
  const graph: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};
  const queue: string[] = [];
  const result: string[] = [];

  nodes.forEach((node) => {
    graph[node.id] = [];
    inDegree[node.id] = 0;
  });

  edges.forEach((edge) => {
    if (graph[edge.from]) {
      graph[edge.from].push(edge.to);
      inDegree[edge.to] = (inDegree[edge.to] || 0) + 1;
    }
  });

  nodes.forEach((node) => {
    if (inDegree[node.id] === 0) {
      queue.push(node.id);
    }
  });

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    result.push(nodeId);

    graph[nodeId].forEach((neighbor: string) => {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) {
        queue.push(neighbor);
      }
    });
  }

  if (result.length !== nodes.length) {
    throw new Error("Workflow has no starting nodes or contains a cycle");
  }

  return result;
}
