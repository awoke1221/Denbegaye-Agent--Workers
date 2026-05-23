import Redis from "ioredis";
import { initBullQueue, addBullJob, startBullWorker } from "./bullQueue";
import { z } from "zod";
import { supabase } from "./supabaseClient";
import { EncryptionService } from "./encryption";
import { executeWorkflow } from "./agentEngine";
import { emitSocketEvent } from "./socket";
import { logger } from "./logger";
import { AgentEdgeInputSchema } from "./validation";
import { SERVICE_ROLE, USE_BULL_QUEUE } from "../config";

const REDIS_URL = process.env.REDIS_URL;
const REDIS_QUEUE_KEY = "agent_execution_queue";
let redisClient: Redis | null = null;
let redisConnected = false;
let redisReconnectAttempt = 0;

if (REDIS_URL) {
  redisClient = new Redis(REDIS_URL);
  redisClient.on("connect", () => {
    console.info("Redis client connecting...");
  });
  redisClient.on("ready", () => {
    if (!redisConnected) {
      console.info(
        `Redis queue reconnected after ${redisReconnectAttempt} attempt${
          redisReconnectAttempt === 1 ? "" : "s"
        }`,
      );
    } else {
      console.info("Redis queue connected");
    }
    redisConnected = true;
    redisReconnectAttempt = 0;
  });
  redisClient.on("reconnecting", (delay: number) => {
    redisReconnectAttempt += 1;
    redisConnected = false;
    console.warn(
      `Redis reconnect attempt ${redisReconnectAttempt} scheduled in ${delay}ms`,
    );
  });
  redisClient.on("error", (error) => {
    redisConnected = false;
    console.error("Redis client error:", error);
  });
  redisClient.on("end", () => {
    redisConnected = false;
    console.warn("Redis client connection ended");
  });
  redisClient.on("close", () => {
    redisConnected = false;
    console.warn("Redis client connection closed");
  });
}

type AgentRunPayload = {
  agentId?: string;
  nodes: Array<{ id: string; type: string; config?: Record<string, unknown> }>;
  edges?: Array<z.infer<typeof AgentEdgeInputSchema>>;
  input?: Record<string, unknown>;
  apiKeys: string; // Encrypted string
  agentName?: string;
  config?: { nodes?: unknown[]; edges?: unknown[] };
  executionId?: string;
  userId?: string;
};

type JobQueueRow = {
  id: string;
  job_type: string;
  payload: AgentRunPayload;
  status: string;
  priority: number;
  max_attempts?: number;
  attempt_count: number;
  scheduled_at: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  failed_at?: string;
  error_message?: string;
};

type QueueOptions = {
  priority?: number;
  delay?: number;
};

type RedisQueuePayload = {
  jobId: string;
} & AgentRunPayload;

const EXECUTION_EVENTS_CHANNEL = "agent_execution_events";

async function publishJobToRedis(jobId: string, jobData: AgentRunPayload) {
  if (!redisClient || !redisConnected) return;
  try {
    await redisClient.lpush(
      REDIS_QUEUE_KEY,
      JSON.stringify({ jobId, ...jobData }),
    );
  } catch (error) {
    console.error("Failed to publish job to Redis queue:", error);
  }
}

async function publishExecutionEvent(eventData: any) {
  if (!redisClient || !redisConnected) return;
  try {
    await redisClient.publish(
      EXECUTION_EVENTS_CHANNEL,
      JSON.stringify(eventData),
    );
  } catch (error) {
    console.error("Failed to publish execution event:", error);
  }
}

function emitExecutionUpdate(executionId: string, payload: any) {
  const eventPayload = {
    ...payload,
    executionId,
    timestamp: new Date().toISOString(),
  };
  if (redisClient && redisConnected) {
    void publishExecutionEvent(eventPayload);
  } else {
    emitSocketEvent(
      "execution:update",
      eventPayload,
      `execution:${executionId}`,
    );
  }
}

export async function reserveAgentQueueJob(
  timeoutSeconds = 30,
): Promise<RedisQueuePayload | null> {
  if (!redisClient || !redisConnected) {
    return null;
  }
  try {
    const result = await redisClient.brpop(REDIS_QUEUE_KEY, timeoutSeconds);
    if (!result) return null;
    const [, payload] = result;
    try {
      return JSON.parse(payload);
    } catch (error) {
      console.error("Failed to parse Redis queue payload:", error);
      return null;
    }
  } catch (error) {
    console.error("Redis brpop error:", error);
    return null;
  }
}

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  queued: ["running"],
  running: ["completed", "failed"],
  completed: [],
  failed: [],
  cancelled: [],
};

function isValidStatusTransition(currentStatus: string, newStatus: string) {
  return VALID_STATUS_TRANSITIONS[currentStatus]?.includes(newStatus) ?? false;
}

async function updateExecutionStatus(
  executionId: string | undefined,
  newStatus: string,
  additionalData: Record<string, unknown> = {},
) {
  if (!executionId) {
    console.error("Missing execution ID for status update");
    return;
  }
  const { data: execution, error } = await supabase
    .from("agent_executions")
    .select("status")
    .eq("id", executionId)
    .single();

  if (error || !execution) {
    console.error(`Execution ${executionId} not found`, error);
    return;
  }
  if (!isValidStatusTransition(execution.status, newStatus)) {
    console.error(
      `Invalid status transition from ${execution.status} to ${newStatus} for execution ${executionId}`,
    );
    return;
  }

  const updateData: Record<string, unknown> = {
    status: newStatus,
    ...additionalData,
  };
  if (newStatus === "completed" || newStatus === "failed") {
    updateData.completed_at = new Date().toISOString();
  }

  await supabase
    .from("agent_executions")
    .update(updateData)
    .eq("id", executionId);
}

class DatabaseQueue {
  private processing = false;
  private dbProcessing = false;
  private redisProcessing = false;
  private maxConcurrency = 1000;
  private processingJobs = new Set<string>();
  private started = false;

  async add(jobData: AgentRunPayload, options: QueueOptions = {}) {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const { error } = await supabase.from("job_queue").insert({
      id: jobId,
      job_type: "agent_execution",
      payload: jobData,
      status: "queued",
      priority: options.priority || 1,
      max_attempts: 3,
      attempt_count: 0,
      scheduled_at: options.delay
        ? new Date(Date.now() + options.delay).toISOString()
        : new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Failed to add job to queue:", error);
      throw error;
    }

    void this.start().catch((queueError) => {
      console.error("Failed to ensure queue processing started:", queueError);
    });

    if (redisClient) {
      await publishJobToRedis(jobId, jobData);
    }

    // If configured, push to Bull queue for Redis-backed processing
    if (USE_BULL_QUEUE) {
      try {
        await addBullJob(jobId, jobData, { priority: options.priority || 1 });
      } catch (e) {
        console.error("Failed to add job to Bull queue", e);
      }
    }

    return { id: jobId };
  }

  async start() {
    if (this.started) return;
    this.started = true;

    const isApiOnly = SERVICE_ROLE === "api";
    const isWorkerNode = SERVICE_ROLE === "worker" || SERVICE_ROLE === "all";

    logger.info("Agent queue start invoked", {
      started: this.started,
      serviceRole: SERVICE_ROLE,
      redisEnabled: Boolean(redisClient),
      maxConcurrency: this.maxConcurrency,
    });

    if (isWorkerNode) {
      if (redisClient) {
        void this.startRedisConsumer();
      }
      void this.startProcessing();
    } else {
      logger.info("API-only node, skipping local queue processing loops", {
        serviceRole: SERVICE_ROLE,
      });
    }

    if (USE_BULL_QUEUE) {
      await initBullQueue();
      if (!isApiOnly) {
        void startBullWorker();
      } else {
        logger.info(
          "API-only node will initialize Bull queue for enqueuing jobs only",
          {
            serviceRole: SERVICE_ROLE,
          },
        );
      }
    }
  }

  private async startProcessing() {
    if (this.dbProcessing) return;
    this.dbProcessing = true;
    this.processing = true;
    logger.info("DB queue processor started", {
      maxConcurrency: this.maxConcurrency,
    });
    logger.info("DB queue worker is alive and ready to fetch jobs");
    while (this.processing) {
      try {
        const now = new Date().toISOString();
        const availableSlots = this.maxConcurrency - this.processingJobs.size;
        if (availableSlots <= 0) {
          await this.delay(1000);
          continue;
        }

        let query = supabase
          .from("job_queue")
          .select("*")
          .eq("status", "queued")
          .lte("scheduled_at", now)
          .order("priority", { ascending: false })
          .order("created_at", { ascending: true });

        if (this.processingJobs.size > 0) {
          const excludedIds = Array.from(this.processingJobs)
            .map((id) => `'${id}'`)
            .join(",");
          query = query.not("id", "in", `(${excludedIds})`);
        }

        const { data: jobs, error } = await query.limit(availableSlots);

        if (error) {
          logger.error("Error fetching jobs:", error);
          await this.delay(5000);
          continue;
        }
        if (!jobs || jobs.length === 0) {
          await this.delay(1000);
          continue;
        }
        const processingPromises = jobs.map((job) =>
          this.processJob(job as JobQueueRow),
        );
        await Promise.allSettled(processingPromises);
      } catch (error) {
        console.error("Queue processing error:", error);
        await this.delay(5000);
      }
    }
  }

  private async claimJob(job: JobQueueRow): Promise<boolean> {
    const { data: claimedJob, error } = await supabase
      .from("job_queue")
      .update({
        status: "processing",
        started_at: new Date().toISOString(),
        attempt_count: job.attempt_count + 1,
      })
      .eq("id", job.id)
      .eq("status", "queued")
      .select("id")
      .single();

    if (error || !claimedJob) {
      logger.debug("Failed to claim job for processing", {
        jobId: job.id,
        status: job.status,
        error,
      });
      return false;
    }

    return true;
  }

  private async processJob(job: JobQueueRow) {
    if (this.processingJobs.has(job.id)) return;
    this.processingJobs.add(job.id);
    try {
      const claimed = await this.claimJob(job);
      if (!claimed) {
        return;
      }

      await processJobFunction(job.payload, job.id);

      await supabase
        .from("job_queue")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    } catch (error) {
      console.error(`Job ${job.id} failed:`, error);
      const attemptCount = job.attempt_count + 1;
      const maxAttempts = job.max_attempts || 3;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (attemptCount >= maxAttempts) {
        await supabase
          .from("job_queue")
          .update({
            status: "dead_letter",
            error_message: errorMessage,
            failed_at: new Date().toISOString(),
          })
          .eq("id", job.id);
        await supabase.from("usage_analytics").insert({
          user_id: job.payload.userId,
          event_type: "dead_letter_job",
          event_data: {
            job_id: job.id,
            execution_id: job.payload.executionId,
            agent_id: job.payload.agentId,
            error: errorMessage,
            attempts: attemptCount,
            timestamp: new Date().toISOString(),
          },
        });
      } else {
        const delay = Math.min(1000 * Math.pow(2, attemptCount - 1), 300000);
        await supabase
          .from("job_queue")
          .update({
            status: "queued",
            scheduled_at: new Date(Date.now() + delay).toISOString(),
            error_message: errorMessage,
            attempt_count: attemptCount,
          })
          .eq("id", job.id);
      }
    } finally {
      this.processingJobs.delete(job.id);
    }
  }

  private async delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async startRedisConsumer() {
    if (this.redisProcessing) return;
    this.redisProcessing = true;
    this.processing = true;
    while (this.processing) {
      try {
        const payload = await reserveAgentQueueJob(30);
        if (!payload) {
          await this.delay(2000);
          continue;
        }
        await this.processRedisPayload(payload);
      } catch (error) {
        console.error("Redis consumer error:", error);
        await this.delay(2000);
      }
    }
  }

  private async processRedisPayload(payload: RedisQueuePayload) {
    const jobId = payload.jobId;
    try {
      const { data: job, error } = await supabase
        .from("job_queue")
        .select("*")
        .eq("id", jobId)
        .single();
      if (error || !job) {
        console.error(`Failed to fetch job ${jobId} from queue`, error);
        return;
      }
      const jobRow = job as JobQueueRow;
      if (jobRow.status !== "queued") {
        return;
      }
      await this.processJob(jobRow);
    } catch (error) {
      console.error(`Failed to process Redis queue job ${jobId}:`, error);
    }
  }

  async getWaiting() {
    const { data } = await supabase
      .from("job_queue")
      .select("*")
      .eq("status", "queued")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true });
    return data || [];
  }

  async getActive() {
    const { data } = await supabase
      .from("job_queue")
      .select("*")
      .eq("status", "processing");
    return data || [];
  }

  async getCompleted() {
    const { data } = await supabase
      .from("job_queue")
      .select("*")
      .eq("status", "completed")
      .order("completed_at", { ascending: false });
    return data || [];
  }

  async getFailed() {
    const { data } = await supabase
      .from("job_queue")
      .select("*")
      .eq("status", "failed")
      .order("created_at", { ascending: false });
    return data || [];
  }

  async getDelayed() {
    const { data } = await supabase
      .from("job_queue")
      .select("*")
      .eq("status", "queued")
      .gt("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true });
    return data || [];
  }
}

export const agentRunSchema = z
  .object({
    agentId: z.string().uuid().optional(),
    nodes: z
      .array(
        z.object({
          id: z.string().min(1),
          type: z.string().min(1),
          config: z.record(z.any()).optional(),
        }),
      )
      .min(1),
    edges: z.array(AgentEdgeInputSchema).optional().default([]),
    input: z.record(z.any()).optional().default({}),
    apiKeys: z.record(z.any()).optional().default({}),
    executionId: z.string().optional(),
    agentName: z.string().min(1).optional().default("Unnamed Agent"),
    saveAsAgent: z.boolean().optional().default(false), // NEW: Only save as agent if explicitly requested
    isTemporary: z.boolean().optional().default(true), // NEW: Mark execution as temporary
  })
  .refine(
    (data) => {
      const nodeIds = new Set(data.nodes.map((n) => n.id));
      for (const edge of data.edges) {
        if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
          return false;
        }
      }
      return true;
    },
    {
      message: "Invalid graph: edges reference non-existent nodes",
      path: ["edges"],
    },
  );

export async function processJobFunction(
  jobData: AgentRunPayload,
  jobId: string,
) {
  const { agentId, userId, input, config, apiKeys, executionId } = jobData;
  if (!executionId) {
    throw new Error("Missing executionId");
  }
  if (!userId) {
    throw new Error("Missing userId");
  }
  logger.info("Processing queued job", {
    jobId,
    executionId,
    userId,
    agentId,
  });
  const jobStartTime = Date.now();
  try {
    await updateExecutionStatus(executionId, "running", {
      started_at: new Date().toISOString(),
    });
    // Emit execution-started event to frontend
    emitSocketEvent(
      "execution-started",
      { executionId },
      `execution:${executionId}`,
    );
    await supabase
      .from("job_queue")
      .update({
        status: "processing",
        started_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    // Decrypt API keys with tamper detection
    let decryptedApiKeys: Record<string, any>;
    try {
      decryptedApiKeys = JSON.parse(EncryptionService.decryptValue(apiKeys));
    } catch (decryptionError) {
      // Credential decryption failed - indicates tampering or wrong key
      // Mark as dead-letter immediately (no retries)
      const errorMessage = "credential_decryption_failed";
      const errorDetail =
        decryptionError instanceof Error
          ? decryptionError.message
          : String(decryptionError);

      logger.error("API key decryption failed - job marked as dead-letter", {
        executionId,
        jobId,
        errorDetail,
      });

      await supabase
        .from("job_queue")
        .update({
          status: "dead_letter",
          error_message: errorMessage,
          failed_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      await updateExecutionStatus(executionId, "failed", {
        error_message: errorMessage,
        error_detail: errorDetail,
        completed_at: new Date().toISOString(),
      });

      await supabase.from("usage_analytics").insert({
        user_id: userId,
        event_type: "credential_decryption_failed",
        event_data: {
          job_id: jobId,
          execution_id: executionId,
          agent_id: agentId,
          error_detail: errorDetail,
          timestamp: new Date().toISOString(),
        },
      });

      throw new Error(
        `${errorMessage}: Credential integrity check failed. The encryption key may have changed or credentials have been tampered with.`,
      );
    }

    logger.info("Starting workflow execution", {
      executionId,
      nodeCount: config?.nodes?.length || 0,
      edgeCount: config?.edges?.length || 0,
    });

    // Ensure node configs meet validation requirements (e.g. transform nodes need expressions)
    const nodesForExecution = (config?.nodes || []).map((node: any) => {
      try {
        const nodeType = String(node.type || "").toLowerCase();
        const cfg = node.config || {};

        // For transform/set nodes, ensure an expression exists; prefer explicit value/variables when present
        if (["core-transform", "core-set"].includes(nodeType)) {
          const hasExpression =
            cfg.expression !== undefined &&
            cfg.expression !== null &&
            String(cfg.expression).trim() !== "";
          if (!hasExpression) {
            if (cfg.value !== undefined) {
              cfg.expression = cfg.value;
            } else if (cfg.variables !== undefined) {
              // store a simple expression representing the variables object
              cfg.expression = JSON.stringify(cfg.variables);
            } else {
              // default to passing through previous input
              cfg.expression = "{{input}}";
            }
            // update node config
            node.config = cfg;
            logger.debug("Auto-filled expression for transform/set node", {
              executionId,
              nodeId: node.id,
              expression: cfg.expression,
            });
          }
        }
      } catch (e) {
        // don't block execution if normalization fails
        logger.warn("Failed to normalize node config", { node, error: e });
      }
      return node;
    });

    const result = await executeWorkflow(
      nodesForExecution,
      config?.edges || [],
      input ?? {},
      decryptedApiKeys,
      executionId,
      userId,
      agentId,
      {
        onNodeStart: (nodeId) => {
          logger.debug("Node started", { executionId, nodeId });
          // Emit node-started event to frontend
          emitSocketEvent(
            "node-started",
            { executionId, nodeId },
            `execution:${executionId}`,
          );
        },
        onNodeComplete: (nodeId, success, error) => {
          logger.debug("Node completed", {
            executionId,
            nodeId,
            success,
            error,
          });
          // Emit node-completed event to frontend
          emitSocketEvent(
            "node-completed",
            { executionId, nodeId, success, error },
            `execution:${executionId}`,
          );
        },
        onExecutionComplete: (result: any) => {
          logger.info("Workflow execution completed event", {
            executionId,
            success: result?.success,
            hasOutput: result?.hasOutput,
            nodeStatusCount: result?.nodeStatusCount,
          });
          const success =
            typeof result === "boolean" ? result : result?.success || false;
          // Emit execution-completed event to frontend
          emitSocketEvent(
            "execution-completed",
            {
              executionId,
              success,
              hasOutput: result?.hasOutput,
              nodeStatusCount: result?.nodeStatusCount,
            },
            `execution:${executionId}`,
          );
        },
        onCompensationStart: (nodeId) => {
          emitSocketEvent(
            "compensation-started",
            { executionId, nodeId },
            `execution:${executionId}`,
          );
        },
        onCompensationComplete: (nodeId, success) => {
          emitSocketEvent(
            "compensation-completed",
            { executionId, nodeId, success },
            `execution:${executionId}`,
          );
        },
      },
    );

    logger.info("Workflow execution returned", {
      executionId,
      success: result?.success,
      hasErrors: (result?.errors?.length || 0) > 0,
      errorCount: result?.errors?.length || 0,
      hasOutput: result?.hasOutput,
      nodeStatusCount:
        (result?.nodeStatusCount ?? result?.nodeStatuses?.length) || 0,
    });

    const executionTime = Date.now() - jobStartTime;

    // Determine final status based on advanced execution result
    let finalStatus: string;
    let finalResult: any = result;

    if (result.success) {
      finalStatus = "completed";
    } else if ((result as any).partialSuccess) {
      // Partial success - workflow had some successful nodes but overall failed
      finalStatus = "partial_success";
      finalResult = {
        ...result,
        partialSuccess: true,
        compensatedNodes: (result as any).compensatedNodes || [],
        failedNodes: (result as any).failedNodes || [],
      };
    } else {
      finalStatus = "failed";
    }

    logger.info("Updating execution status to " + finalStatus, {
      executionId,
      finalStatus,
      executionTime,
    });

    await updateExecutionStatus(executionId, finalStatus, {
      result: finalResult,
      execution_time_ms: executionTime,
      completed_at: new Date().toISOString(),
      logs: result.logs,
      errors: result.errors,
      tokens_used: 0,
      partial_success: (result as any).partialSuccess || false,
      compensated_nodes: (result as any).compensatedNodes || [],
      failed_nodes: (result as any).failedNodes || [],
      circuit_breaker_tripped: (result as any).circuitBreakerTripped || false,
    });

    await supabase
      .from("job_queue")
      .update({
        status: finalStatus === "completed" ? "completed" : "failed",
        completed_at: new Date().toISOString(),
        result: JSON.stringify(finalResult),
      })
      .eq("id", jobId);

    return finalResult;
  } catch (error) {
    const executionTime = Date.now() - jobStartTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Job processing failed for ${executionId}:`, error);
    emitExecutionUpdate(executionId, {
      event: "execution-completed",
      success: false,
      error: errorMessage,
    });

    await updateExecutionStatus(executionId, "failed", {
      error_message: errorMessage,
      execution_time_ms: executionTime,
      completed_at: new Date().toISOString(),
    });

    await supabase
      .from("job_queue")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: errorMessage,
      })
      .eq("id", jobId);

    const { data: job } = await supabase
      .from("job_queue")
      .select("attempt_count")
      .eq("id", jobId)
      .single();
    const retryCount = (job?.attempt_count || 0) + 1;
    const maxRetries = 3;
    if (retryCount >= maxRetries) {
      await supabase
        .from("job_queue")
        .update({
          status: "dead_letter",
          attempt_count: retryCount,
        })
        .eq("id", jobId);
    } else {
      const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 300000);
      const retryAt = new Date(Date.now() + backoffDelay);
      await supabase
        .from("job_queue")
        .update({
          status: "queued",
          attempt_count: retryCount,
          next_retry_at: retryAt.toISOString(),
        })
        .eq("id", jobId);
    }
    throw error;
  }
}

export const agentQueue = new DatabaseQueue();

export const deadLetterQueue = {
  async getWaiting() {
    const { data } = await supabase
      .from("job_queue")
      .select("*")
      .eq("status", "dead_letter")
      .order("created_at", { ascending: false });
    return data || [];
  },
  async getJob(jobId: string) {
    const { data } = await supabase
      .from("job_queue")
      .select("*")
      .eq("id", jobId)
      .eq("status", "dead_letter")
      .single();
    return data;
  },
  async add(jobData: AgentRunPayload) {
    return { id: "dead-letter" };
  },
};

export class QueueManager {
  static async getQueueStats() {
    const [waiting, active, completed, failed, delayed, deadLetter] =
      await Promise.all([
        agentQueue.getWaiting(),
        agentQueue.getActive(),
        agentQueue.getCompleted(),
        agentQueue.getFailed(),
        agentQueue.getDelayed(),
        deadLetterQueue.getWaiting(),
      ]);
    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      deadLetter: deadLetter.length,
    };
  }

  static async retryDeadLetterJob(jobId: string) {
    const job = await deadLetterQueue.getJob(jobId);
    if (!job) {
      throw new Error(`Dead-letter job ${jobId} not found`);
    }
    await supabase
      .from("job_queue")
      .update({
        status: "queued",
        attempt_count: 0,
        error_message: null,
        scheduled_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    return { success: true, message: `Job ${jobId} moved back to main queue` };
  }

  static async cleanupOldJobs(olderThanDays = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    const completedResponse: { data: unknown } = await supabase
      .from("job_queue")
      .delete()
      .eq("status", "completed")
      .lt("completed_at", cutoff.toISOString());
    const failedResponse: { data: unknown } = await supabase
      .from("job_queue")
      .delete()
      .eq("status", "failed")
      .lt("created_at", cutoff.toISOString());
    const completedJobs = completedResponse.data;
    const failedJobs = failedResponse.data;
    const completedCount = Array.isArray(completedJobs)
      ? completedJobs.length
      : 0;
    const failedCount = Array.isArray(failedJobs) ? failedJobs.length : 0;
    return {
      completedJobsCleaned: completedCount,
      failedJobsCleaned: failedCount,
    };
  }

  static async pauseQueue() {
    return {
      success: false,
      message: "Pause not implemented for database queue",
    };
  }

  static async resumeQueue() {
    return {
      success: false,
      message: "Resume not implemented for database queue",
    };
  }
}
