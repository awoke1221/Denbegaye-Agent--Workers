import type { Job } from "bull";
import { supabase } from "../utils/supabaseClient";
import { logger } from "../utils/logger";
import {
  executeWorkflow,
  ExecutionResult,
  WorkflowOptions,
} from "../utils/agentEngine";
import { validateAgentGraph } from "../utils/validation";
import { logWorkflowAudit } from "../utils/auditLogger";
import { AgentExecutionJobData, AgentEdge, AgentNode } from "./types";
import { decryptValue } from "../utils/encryption";

type ExecutionRow = {
  id: string;
  agent_id: string;
  user_id: string;
  input_data: Record<string, any>;
  metadata?: Record<string, any>;
  status: string;
  created_at?: string;
};

type AgentRow = {
  nodes: AgentNode[];
  edges: AgentEdge[];
};

type UserApiKeysRow = {
  encrypted_keys: string | null;
};

const parseJsonSafe = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    logger.error("Failed to parse JSON safely.", {
      error: (error as Error).message,
    });
    return fallback;
  }
};

const decryptApiKeys = (
  encrypted: string | null | undefined,
): Record<string, any> => {
  if (!encrypted) {
    return {};
  }

  try {
    const decrypted = decryptValue(encrypted);
    return parseJsonSafe<Record<string, any>>(decrypted, {});
  } catch (error) {
    logger.error("apiKeys decryption failed, proceeding with empty object.", {
      error: (error as Error).message,
    });
    return {};
  }
};

const fetchAndClaimExecution = async (
  executionId: string,
): Promise<ExecutionRow | null> => {
  // First, try to update the status to running
  const { error: updateError } = await supabase
    .from("executions")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
    })
    .eq("id", executionId)
    .eq("status", "queued");

  if (updateError) {
    throw new Error(
      `Supabase error claiming execution: ${updateError.message}`,
    );
  }

  // Then fetch the updated row
  const { data: execution, error: fetchError } = await supabase
    .from("executions")
    .select("id, agent_id, user_id, input_data, metadata, status, created_at")
    .eq("id", executionId)
    .eq("status", "running")
    .maybeSingle();

  if (fetchError) {
    throw new Error(
      `Supabase error fetching claimed execution: ${fetchError.message}`,
    );
  }

  if (execution) {
    return execution;
  }

  // If no row was updated, check if it's already running or completed
  const { data: existingExecution, error: existingError } = await supabase
    .from("executions")
    .select("status")
    .eq("id", executionId)
    .maybeSingle();

  if (existingError) {
    throw new Error(
      `Supabase error verifying execution state: ${existingError.message}`,
    );
  }

  if (!existingExecution) {
    throw new Error(`Execution ${executionId} not found.`);
  }

  if (
    existingExecution.status === "running" ||
    existingExecution.status === "completed"
  ) {
    logger.info("Execution already claimed or completed, skipping.", {
      executionId,
      status: existingExecution.status,
    });
    return null;
  }

  throw new Error(
    `Execution ${executionId} has invalid status: ${existingExecution.status}`,
  );
};

const fetchAgentConfig = async (agentId: string): Promise<AgentRow> => {
  const { data, error } = await supabase
    .from("agents")
    .select("nodes, edges")
    .eq("id", agentId)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase error fetching agent: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Agent ${agentId} not found.`);
  }

  return data as AgentRow;
};

const fetchUserApiKeys = async (userId: string): Promise<string | null> => {
  const { data, error } = await supabase
    .from("user_api_keys")
    .select("encrypted_keys")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase error fetching API keys: ${error.message}`);
  }

  return data?.encrypted_keys ?? null;
};

const persistExecutionResult = async (
  executionId: string,
  payload: Record<string, any>,
) => {
  const { error } = await supabase
    .from("executions")
    .update(payload)
    .eq("id", executionId);
  if (error) {
    throw new Error(
      `Supabase error updating execution result: ${error.message}`,
    );
  }
};

export const agentExecutionJob = async (
  job: Job<AgentExecutionJobData>,
): Promise<ExecutionResult> => {
  const result: ExecutionResult = {
    success: false,
    output: {},
    logs: [],
    errors: [],
    nodeStatuses: [],
    nodeResults: [],
    executionTime: 0,
  };

  let executionMetadata: Record<string, any> | undefined;

  const startTime = Date.now();
  const { executionId } = job.data;

  try {
    logger.info("Agent execution job started.", { executionId });

    const execution = await fetchAndClaimExecution(executionId);
    if (!execution) {
      return {
        success: true,
        output: {},
        logs: ["Execution was already claimed or completed."],
        errors: [],
        nodeStatuses: [],
        nodeResults: [],
        executionTime: 0,
      };
    }

    const {
      agent_id: agentId,
      user_id: userId,
      input_data: input,
      metadata,
    } = execution;

    executionMetadata = metadata;

    const [agent, encryptedKeys] = await Promise.all([
      fetchAgentConfig(agentId),
      fetchUserApiKeys(userId),
    ]);

    // Emit execution started
    global.io?.emit("execution-started", { executionId });

    await logWorkflowAudit(executionId, "workflow.start", {
      agentId,
      userId,
      queuedAt: execution.created_at,
    });

    const decryptedApiKeys = decryptApiKeys(encryptedKeys);
    const nodes = (agent.nodes as AgentNode[]) ?? [];
    const edges = (agent.edges as AgentEdge[]) ?? [];

    const validation = validateAgentGraph(nodes, edges);

    // Log validation errors and warnings but don't block execution
    if (validation.errors && validation.errors.length > 0) {
      await logWorkflowAudit(executionId, "workflow.validation.errors", {
        errors: validation.errors,
      });
      logger.info("Agent graph validation errors (non-blocking)", {
        executionId,
        errors: validation.errors,
      });
    }

    if (validation.warnings && validation.warnings.length > 0) {
      await logWorkflowAudit(executionId, "workflow.validation.warnings", {
        warnings: validation.warnings,
      });
      logger.info("Agent graph validation warnings", {
        executionId,
        warnings: validation.warnings,
      });
    }

    await logWorkflowAudit(executionId, "workflow.graph.validated", {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      errorsCount: validation.errors?.length || 0,
      warningsCount: validation.warnings?.length || 0,
      executionOrder: validation.executionPlan?.executionOrder,
    });

    const workflowOptions: WorkflowOptions = {
      concurrency: 3,
      timeoutMs: 45000,
      retryCount: 2,
      nodeTimeoutMs: 30000,
      auditLog: async (event, details) => {
        await logWorkflowAudit(executionId, event, details);
      },
    };

    const workflowResult = await executeWorkflow(
      nodes,
      edges,
      input ?? {},
      decryptedApiKeys,
      {
        ...workflowOptions,
        executionId,
        executionPlan: validation.executionPlan,
        onNodeStart: (nodeId: string) => {
          global.io?.emit("execution-started", { executionId });
          global.io?.emit("node-started", { executionId, nodeId });
        },
        onNodeStatus: (status) => {
          global.io?.emit("node-status", {
            executionId,
            ...status,
          });
        },
        onNodeComplete: (
          nodeId: string,
          success: boolean,
          error?: string,
          result?: any,
        ) => {
          global.io?.emit("node-completed", {
            executionId,
            nodeId,
            success,
            error,
            executionTime: result?.executionTime,
            retryCount: result?.retryCount,
          });
        },
        onExecutionComplete: (success: boolean) => {
          global.io?.emit("execution-completed", { executionId, success });
        },
      },
    );

    const status = workflowResult.success ? "completed" : "failed";
    const executionTimeMs = Date.now() - startTime;

    const updatePayload = {
      status,
      output_data: workflowResult.output,
      logs: workflowResult.logs,
      errors: workflowResult.errors ?? [],
      completed_at: new Date().toISOString(),
      execution_time_ms: executionTimeMs,
      metadata: {
        ...metadata,
        last_run_at: new Date().toISOString(),
        node_count: nodes.length,
        node_statuses: workflowResult.nodeStatuses,
        node_results: workflowResult.nodeResults,
        execution_plan: workflowResult.executionPlan,
        total_execution_time: workflowResult.executionTime,
        validation_warnings: validation.warnings,
      },
    };

    await logWorkflowAudit(executionId, "workflow.completed", {
      status,
      executionTimeMs,
      nodeCount: nodes.length,
    });

    await persistExecutionResult(executionId, updatePayload);

    logger.info("Agent execution job completed.", {
      executionId,
      agentId,
      status,
      execution_time_ms: executionTimeMs,
    });

    return workflowResult;
  } catch (error: any) {
    const message = error?.message ?? String(error);
    logger.error("Agent execution job failed.", {
      executionId,
      error: message,
    });

    const executionTimeMs = Date.now() - startTime;
    result.logs.push("Agent execution failed.");
    result.errors?.push(message);

    try {
      await logWorkflowAudit(executionId, "workflow.failed", {
        error: message,
        executionTimeMs,
      });
    } catch (auditError: any) {
      logger.error("Failed to write workflow audit failure.", {
        executionId,
        error: auditError?.message || auditError,
      });
    }

    try {
      await persistExecutionResult(executionId, {
        status: "failed",
        output_data: null,
        logs: result.logs,
        errors: result.errors ?? [],
        completed_at: new Date().toISOString(),
        execution_time_ms: executionTimeMs,
        metadata: {
          ...(executionMetadata ?? {}),
          last_run_at: new Date().toISOString(),
          node_statuses: result.nodeStatuses,
        },
      });
    } catch (writeError: any) {
      logger.error("Failed to write execution failure to Supabase.", {
        executionId,
        error: writeError?.message || writeError,
      });
    }

    return result;
  }
};
