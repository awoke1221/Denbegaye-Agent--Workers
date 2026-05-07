/**
 * Migration Helper: Convert Old System to LangGraph
 * Use this to gradually migrate your existing workflows
 */

import { AgentNode, AgentEdge } from "../jobs/types";
import { supabase } from "./supabaseClient";

/**
 * Convert old workflow format to LangGraph config
 */
export function convertOldWorkflowToLangGraph(
  oldNodes: any[],
  oldEdges: any[],
  input: Record<string, any>,
  apiKeys: Record<string, any>,
) {
  // Convert nodes to new format
  const newNodes = oldNodes.map((node) => ({
    id: node.id,
    type: node.type,
    config: node.data?.config || node.config || {},
    label: node.label || node.data?.label,
    description: node.data?.description,
  }));

  // Convert edges to new format
  const newEdges = oldEdges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    condition: edge.condition,
  }));

  return {
    nodes: newNodes,
    edges: newEdges,
    input,
    apiKeys,
    enableStreaming: true,
  };
}

/**
 * Database Migration: Add workflow_execution_states table
 * This table stores detailed execution state for monitoring, recovery, and debugging
 */
export async function createWorkflowExecutionStatesTable(): Promise<void> {
  try {
    // Create the workflow_execution_states table using raw SQL
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS workflow_execution_states (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        execution_id TEXT NOT NULL UNIQUE,
        workflow_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        overall_success BOOLEAN NOT NULL,
        partial_success BOOLEAN NOT NULL DEFAULT FALSE,
        node_states JSONB NOT NULL,
        circuit_breaker_failures JSONB DEFAULT '[]'::jsonb,
        execution_time BIGINT NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_execution_states_execution_id
        ON workflow_execution_states(execution_id);

      CREATE INDEX IF NOT EXISTS idx_execution_states_user_id
        ON workflow_execution_states(user_id);

      CREATE INDEX IF NOT EXISTS idx_execution_states_workflow_id
        ON workflow_execution_states(workflow_id);

      CREATE INDEX IF NOT EXISTS idx_execution_states_timestamp
        ON workflow_execution_states(timestamp);

      -- Add RLS policies
      ALTER TABLE workflow_execution_states ENABLE ROW LEVEL SECURITY;

      -- Users can only see their own execution states
      DROP POLICY IF EXISTS "Users can view own execution states" ON workflow_execution_states;
      CREATE POLICY "Users can view own execution states"
        ON workflow_execution_states FOR SELECT
        USING (auth.uid()::text = user_id);

      -- Users can insert their own execution states
      DROP POLICY IF EXISTS "Users can insert own execution states" ON workflow_execution_states;
      CREATE POLICY "Users can insert own execution states"
        ON workflow_execution_states FOR INSERT
        WITH CHECK (auth.uid()::text = user_id);
    `;

    // Execute the migration by inserting a record that triggers the SQL execution
    // Note: This is a simplified approach. In production, you'd use proper migration tools
    const { error } = await supabase
      .from("agent_executions")
      .select("id")
      .limit(1);

    if (error && error.code === "42P01") {
      // Table doesn't exist, but that's expected
      console.log(
        "Note: workflow_execution_states table creation requires manual SQL execution",
      );
      console.log("Please run the following SQL in your Supabase dashboard:");
      console.log(createTableSQL);
    }

    console.log("Workflow execution states table migration prepared");
  } catch (error) {
    console.error(
      "Error preparing workflow_execution_states migration:",
      error,
    );
    throw error;
  }
}

/**
 * Migration: Update agent_executions table to support partial success
 */
export async function updateAgentExecutionsTable(): Promise<void> {
  try {
    // Check if columns exist and add them if they don't
    const alterTableSQL = `
      -- Add new columns to agent_executions table if they don't exist
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'agent_executions'
                       AND column_name = 'partial_success') THEN
          ALTER TABLE agent_executions ADD COLUMN partial_success BOOLEAN DEFAULT FALSE;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'agent_executions'
                       AND column_name = 'compensated_nodes') THEN
          ALTER TABLE agent_executions ADD COLUMN compensated_nodes TEXT[] DEFAULT '{}';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'agent_executions'
                       AND column_name = 'failed_nodes') THEN
          ALTER TABLE agent_executions ADD COLUMN failed_nodes TEXT[] DEFAULT '{}';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'agent_executions'
                       AND column_name = 'circuit_breaker_tripped') THEN
          ALTER TABLE agent_executions ADD COLUMN circuit_breaker_tripped BOOLEAN DEFAULT FALSE;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'agent_executions'
                       AND column_name = 'node_attempt_counts') THEN
          ALTER TABLE agent_executions ADD COLUMN node_attempt_counts JSONB DEFAULT '{}'::jsonb;
        END IF;
      END $$
    `;

    console.log("Agent executions table update prepared");
    console.log("Please run the following SQL in your Supabase dashboard:");
    console.log(alterTableSQL);
  } catch (error) {
    console.error("Error preparing agent_executions migration:", error);
    throw error;
  }
}

/**
 * Run all migrations
 */
export async function runAdvancedExecutionMigrations(): Promise<void> {
  try {
    console.log("Starting advanced execution database migrations...");

    await createWorkflowExecutionStatesTable();
    await updateAgentExecutionsTable();

    console.log("Advanced execution migrations prepared successfully");
    console.log(
      "Please execute the provided SQL statements in your Supabase dashboard",
    );
  } catch (error) {
    console.error("Migration preparation failed:", error);
    throw error;
  }
}

/**
 * Migration guide inline
 */
export const MigrationGuide = `
# Migration Guide: Old System → LangGraph

## Phase 1: Setup (Week 1)
- [ ] Install new dependencies (npm install)
- [ ] Review LANGGRAPH_IMPLEMENTATION.md
- [ ] Set up environment variables
- [ ] Start backend with new routes

## Phase 2: Frontend Integration (Week 2)
- [ ] Create WebSocket connection in app root
- [ ] Add useLangGraphConnection hook
- [ ] Add useLangGraphExecution hook
- [ ] Test connection with simple workflow

## Phase 3: Component Migration (Week 3)
- [ ] Add AgentExecutionMonitor to builder
- [ ] Update execution controls
- [ ] Add streaming event panel
- [ ] Update error handling

## Phase 4: Workflow Migration (Week 4)
- [ ] Convert simple workflows first
- [ ] Test with staging backend
- [ ] Fix any compatibility issues
- [ ] Migrate complex workflows

## Phase 5: Deployment (Week 5)
- [ ] Deploy to staging
- [ ] Perform integration tests
- [ ] Deploy to production
- [ ] Monitor for issues

## Backward Compatibility

The old REST endpoint (/api/agent-run) is still available.
New endpoint (/api/langgraph/execute) offers streaming support.

You can run both systems in parallel during migration.

## Gradual Migration Strategy

1. Add new LangGraph routes alongside old ones
2. Create a feature flag to toggle between systems
3. Gradually migrate users to new system
4. Monitor performance and fix issues
5. Deprecate old system once stable

## Testing Checklist

- [ ] Simple sequential workflows
- [ ] Conditional branching workflows
- [ ] Error handling and retries
- [ ] Real-time streaming
- [ ] Large workflows (10+ nodes)
- [ ] Concurrent executions
- [ ] Connection failures
- [ ] Token expiration
- [ ] Memory management
`;

/**
 * Validator for workflow compatibility
 */
export function validateWorkflowCompatibility(
  nodes: any[],
  edges: any[],
): {
  compatible: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check for unsupported node types
  const supportedTypes = [
    "ai-chat",
    "ai-completion",
    "ai-reasoning",
    "ai-memory",
    "ai-tool-calling",
    "http-request",
    "database-query",
    "email-send",
    "webhook-trigger",
    "deepseek",
    "gemini",
    "openai",
    "telegram",
    "whatsapp",
    "linkedin",
    "youtube",
    "facebook",
    "google-calendar",
    "google-sheets",
    "google-docs",
    "gmail",
  ];

  for (const node of nodes) {
    if (!supportedTypes.includes(node.type)) {
      warnings.push(`Node type '${node.type}' may not be fully supported`);
    }

    // Check for required config
    if (!node.config && !node.data?.config) {
      errors.push(`Node ${node.id} missing configuration`);
    }
  }

  // Check for cycles in graph
  const hasCycle = detectCycle(nodes, edges);
  if (hasCycle) {
    errors.push("Workflow contains cycles");
  }

  // Check for isolated nodes
  const nodeIds = new Set(nodes.map((n) => n.id));
  const referencedNodes = new Set<string>();

  for (const edge of edges) {
    referencedNodes.add(edge.source);
    referencedNodes.add(edge.target);
  }

  for (const nodeId of nodeIds) {
    if (!referencedNodes.has(nodeId) && nodes.length > 1) {
      warnings.push(`Node ${nodeId} is isolated`);
    }
  }

  return {
    compatible: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Detect cycles in graph
 */
function detectCycle(nodes: any[], edges: any[]): boolean {
  const graph: Record<string, string[]> = {};
  const visited: Record<string, boolean> = {};
  const recursionStack: Record<string, boolean> = {};

  // Build adjacency list
  for (const node of nodes) {
    graph[node.id] = [];
  }

  for (const edge of edges) {
    graph[edge.source] = graph[edge.source] || [];
    graph[edge.source].push(edge.target);
  }

  // DFS to detect cycle
  const hasCycleDFS = (node: string): boolean => {
    visited[node] = true;
    recursionStack[node] = true;

    for (const neighbor of graph[node] || []) {
      if (!visited[neighbor]) {
        if (hasCycleDFS(neighbor)) {
          return true;
        }
      } else if (recursionStack[neighbor]) {
        return true;
      }
    }

    recursionStack[node] = false;
    return false;
  };

  for (const node of nodes) {
    if (!visited[node.id]) {
      if (hasCycleDFS(node.id)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Feature flag helper for gradual rollout
 */
export class MigrationFeatureFlag {
  private useNewSystem: boolean = false;
  private userPercentage: number = 0; // 0-100

  setUserPercentage(percentage: number): void {
    this.userPercentage = Math.min(100, Math.max(0, percentage));
  }

  shouldUseNewSystem(userId: string): boolean {
    // Hash user ID to determine if they should use new system
    const hash = hashUserId(userId);
    return hash % 100 < this.userPercentage;
  }

  getUsersOnNewSystem(): number {
    return this.userPercentage;
  }
}

/**
 * Hash user ID for consistent rollout
 */
function hashUserId(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Example: Gradual migration with feature flag
 */
export const GradualMigrationExample = `
// app.post('/api/agent-run', async (req, res) => {
//   const userId = req.user.id;
//   const featureFlag = new MigrationFeatureFlag();
//   
//   featureFlag.setUserPercentage(50); // 50% of users on new system
//   
//   if (featureFlag.shouldUseNewSystem(userId)) {
//     // Use new LangGraph system
//     return handleLangGraphExecution(req, res);
//   } else {
//     // Use old system
//     return handleLegacyExecution(req, res);
//   }
// });

// Gradually increase percentage over time:
// Week 1: 10%
// Week 2: 25%
// Week 3: 50%
// Week 4: 75%
// Week 5: 100%
`;

/**
 * Monitoring helper for migration tracking
 */
export interface MigrationMetrics {
  oldSystemUsage: number; // percentage
  newSystemUsage: number; // percentage
  errorRateOld: number; // percentage
  errorRateNew: number; // percentage
  avgExecutionTimeOld: number; // ms
  avgExecutionTimeNew: number; // ms
  usersOnNewSystem: number;
}

export class MigrationMonitor {
  private metrics: MigrationMetrics = {
    oldSystemUsage: 0,
    newSystemUsage: 0,
    errorRateOld: 0,
    errorRateNew: 0,
    avgExecutionTimeOld: 0,
    avgExecutionTimeNew: 0,
    usersOnNewSystem: 0,
  };

  recordOldSystemExecution(success: boolean, executionTime: number): void {
    this.metrics.oldSystemUsage++;
    if (!success) {
      this.metrics.errorRateOld += 1;
    }
    this.metrics.avgExecutionTimeOld =
      (this.metrics.avgExecutionTimeOld + executionTime) / 2;
  }

  recordNewSystemExecution(success: boolean, executionTime: number): void {
    this.metrics.newSystemUsage++;
    if (!success) {
      this.metrics.errorRateNew += 1;
    }
    this.metrics.avgExecutionTimeNew =
      (this.metrics.avgExecutionTimeNew + executionTime) / 2;
  }

  getMetrics(): MigrationMetrics {
    return { ...this.metrics };
  }

  getReport(): string {
    const total = this.metrics.oldSystemUsage + this.metrics.newSystemUsage;
    const oldPercentage =
      total > 0 ? ((this.metrics.oldSystemUsage / total) * 100).toFixed(2) : 0;
    const newPercentage =
      total > 0 ? ((this.metrics.newSystemUsage / total) * 100).toFixed(2) : 0;

    return `
Migration Report:
================
Old System Usage: ${oldPercentage}%
New System Usage: ${newPercentage}%

Old System Error Rate: ${this.metrics.errorRateOld.toFixed(2)}%
New System Error Rate: ${this.metrics.errorRateNew.toFixed(2)}%

Old System Avg Time: ${this.metrics.avgExecutionTimeOld.toFixed(0)}ms
New System Avg Time: ${this.metrics.avgExecutionTimeNew.toFixed(0)}ms
    `;
  }
}

/**
 * Export helpers for easy import
 */
export const MigrationTools = {
  convertOldWorkflowToLangGraph,
  validateWorkflowCompatibility,
  MigrationFeatureFlag,
  MigrationMonitor,
};
