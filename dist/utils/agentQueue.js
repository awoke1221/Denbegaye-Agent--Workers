"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueManager = exports.deadLetterQueue = exports.agentQueue = exports.agentRunSchema = void 0;
exports.reserveAgentQueueJob = reserveAgentQueueJob;
const ioredis_1 = __importDefault(require("ioredis"));
const zod_1 = require("zod");
const supabaseClient_1 = require("./supabaseClient");
const encryption_1 = require("./encryption");
const agentEngine_1 = require("./agentEngine");
const socket_1 = require("./socket");
const validation_1 = require("./validation");
const REDIS_URL = process.env.REDIS_URL;
const REDIS_QUEUE_KEY = "agent_execution_queue";
const redisClient = REDIS_URL ? new ioredis_1.default(REDIS_URL) : null;
async function publishJobToRedis(jobId, jobData) {
    if (!redisClient)
        return;
    try {
        await redisClient.lpush(REDIS_QUEUE_KEY, JSON.stringify({ jobId, ...jobData }));
    }
    catch (error) {
        console.error("Failed to publish job to Redis queue:", error);
    }
}
async function reserveAgentQueueJob(timeoutSeconds = 30) {
    if (!redisClient) {
        throw new Error("Redis queue is not configured. Set REDIS_URL to enable worker queueing.");
    }
    const result = await redisClient.brpop(REDIS_QUEUE_KEY, timeoutSeconds);
    if (!result)
        return null;
    const [, payload] = result;
    try {
        return JSON.parse(payload);
    }
    catch (error) {
        console.error("Failed to parse Redis queue payload:", error);
        return null;
    }
}
// Status transition validation
const VALID_STATUS_TRANSITIONS = {
    queued: ["running"],
    running: ["completed", "failed"],
    completed: [],
    failed: [],
    cancelled: [],
};
function isValidStatusTransition(currentStatus, newStatus) {
    return VALID_STATUS_TRANSITIONS[currentStatus]?.includes(newStatus) ?? false;
}
async function updateExecutionStatus(executionId, newStatus, additionalData = {}) {
    // Get current status
    const { data: execution } = await supabaseClient_1.supabase
        .from("agent_executions")
        .select("status")
        .eq("id", executionId)
        .single();
    if (!execution) {
        console.error(`Execution ${executionId} not found`);
        return;
    }
    if (!isValidStatusTransition(execution.status, newStatus)) {
        console.error(`Invalid status transition from ${execution.status} to ${newStatus} for execution ${executionId}`);
        return;
    }
    const updateData = { status: newStatus, ...additionalData };
    if (newStatus === "completed" || newStatus === "failed") {
        updateData.completed_at = new Date().toISOString();
    }
    await supabaseClient_1.supabase
        .from("agent_executions")
        .update(updateData)
        .eq("id", executionId);
}
// Database-backed job queue with retry persistence
class DatabaseQueue {
    constructor() {
        this.processing = false;
        this.maxConcurrency = 5; // Process up to 5 jobs concurrently
        this.processingJobs = new Set();
        this.started = false;
    }
    async add(jobData, options = {}) {
        const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        // Insert job into database
        const { error } = await supabaseClient_1.supabase.from("job_queue").insert({
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
        // Ensure queue processing is started in the current process.
        void this.start().catch((queueError) => {
            console.error("Failed to ensure queue processing started:", queueError);
        });
        if (redisClient) {
            // When Redis is configured, publish the job to the worker queue.
            await publishJobToRedis(jobId, jobData);
        }
        return { id: jobId };
    }
    async start() {
        if (this.started)
            return;
        this.started = true;
        if (redisClient) {
            void this.startRedisConsumer();
        }
        else {
            void this.startProcessing();
        }
    }
    async startProcessing() {
        if (this.processing)
            return;
        this.processing = true;
        while (this.processing) {
            try {
                // Get available jobs (not currently being processed)
                const { data: jobs, error } = await supabaseClient_1.supabase
                    .from("job_queue")
                    .select("*")
                    .eq("status", "queued")
                    .lt("scheduled_at", new Date().toISOString())
                    .not("id", "in", `(${Array.from(this.processingJobs)
                    .map((id) => `'${id}'`)
                    .join(",") || "null"})`)
                    .order("priority", { ascending: false })
                    .order("created_at", { ascending: true })
                    .limit(this.maxConcurrency - this.processingJobs.size);
                if (error) {
                    console.error("Error fetching jobs:", error);
                    await this.delay(5000); // Wait 5 seconds before retrying
                    continue;
                }
                if (!jobs || jobs.length === 0) {
                    await this.delay(1000); // Wait 1 second before checking again
                    continue;
                }
                // Process jobs concurrently
                const processingPromises = jobs.map((job) => this.processJob(job));
                await Promise.allSettled(processingPromises);
            }
            catch (error) {
                console.error("Queue processing error:", error);
                await this.delay(5000);
            }
        }
    }
    async processJob(job) {
        if (this.processingJobs.has(job.id))
            return;
        this.processingJobs.add(job.id);
        try {
            // Mark job as processing
            await supabaseClient_1.supabase
                .from("job_queue")
                .update({
                status: "processing",
                started_at: new Date().toISOString(),
                attempt_count: job.attempt_count + 1,
            })
                .eq("id", job.id);
            // Process the job
            await processJobFunction(job.payload, job.id);
            // Mark as completed
            await supabaseClient_1.supabase
                .from("job_queue")
                .update({
                status: "completed",
                completed_at: new Date().toISOString(),
            })
                .eq("id", job.id);
        }
        catch (error) {
            console.error(`Job ${job.id} failed:`, error);
            const attemptCount = job.attempt_count + 1;
            const maxAttempts = job.max_attempts || 3;
            if (attemptCount >= maxAttempts) {
                // Move to dead-letter queue
                await supabaseClient_1.supabase
                    .from("job_queue")
                    .update({
                    status: "dead_letter",
                    error_message: error instanceof Error ? error.message : "Unknown error",
                    failed_at: new Date().toISOString(),
                })
                    .eq("id", job.id);
                // Log to analytics
                await supabaseClient_1.supabase.from("usage_analytics").insert({
                    user_id: job.payload.userId,
                    event_type: "dead_letter_job",
                    event_data: {
                        job_id: job.id,
                        execution_id: job.payload.executionId,
                        agent_id: job.payload.agentId,
                        error: error instanceof Error ? error.message : "Unknown error",
                        attempts: attemptCount,
                        timestamp: new Date().toISOString(),
                    },
                });
            }
            else {
                // Schedule retry with exponential backoff
                const delay = Math.min(1000 * Math.pow(2, attemptCount - 1), 300000); // Max 5 minutes
                await supabaseClient_1.supabase
                    .from("job_queue")
                    .update({
                    status: "queued",
                    scheduled_at: new Date(Date.now() + delay).toISOString(),
                    error_message: error instanceof Error ? error.message : "Unknown error",
                    attempt_count: attemptCount,
                })
                    .eq("id", job.id);
            }
        }
        finally {
            this.processingJobs.delete(job.id);
        }
    }
    async delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    async startRedisConsumer() {
        if (this.processing)
            return;
        this.processing = true;
        while (this.processing) {
            try {
                const payload = await reserveAgentQueueJob(30);
                if (!payload) {
                    continue;
                }
                await this.processRedisPayload(payload);
            }
            catch (error) {
                console.error("Redis consumer error:", error);
                await this.delay(2000);
            }
        }
    }
    async processRedisPayload(payload) {
        const jobId = payload.jobId;
        try {
            const { data: job, error } = await supabaseClient_1.supabase
                .from("job_queue")
                .select("*")
                .eq("id", jobId)
                .single();
            if (error || !job) {
                console.error(`Failed to fetch job ${jobId} from queue`, error);
                return;
            }
            await this.processJob(job);
        }
        catch (error) {
            console.error(`Failed to process Redis queue job ${jobId}:`, error);
        }
    }
    async getWaiting() {
        const { data } = await supabaseClient_1.supabase
            .from("job_queue")
            .select("*")
            .eq("status", "queued")
            .order("priority", { ascending: false })
            .order("created_at", { ascending: true });
        return data || [];
    }
    async getActive() {
        const { data } = await supabaseClient_1.supabase
            .from("job_queue")
            .select("*")
            .eq("status", "processing");
        return data || [];
    }
    async getCompleted() {
        const { data } = await supabaseClient_1.supabase
            .from("job_queue")
            .select("*")
            .eq("status", "completed")
            .order("completed_at", { ascending: false });
        return data || [];
    }
    async getFailed() {
        const { data } = await supabaseClient_1.supabase
            .from("job_queue")
            .select("*")
            .eq("status", "failed")
            .order("created_at", { ascending: false });
        return data || [];
    }
    async getDelayed() {
        const { data } = await supabaseClient_1.supabase
            .from("job_queue")
            .select("*")
            .eq("status", "queued")
            .gt("scheduled_at", new Date().toISOString())
            .order("scheduled_at", { ascending: true });
        return data || [];
    }
}
exports.agentRunSchema = zod_1.z
    .object({
    agentId: zod_1.z.string().uuid().optional(),
    nodes: zod_1.z
        .array(zod_1.z.object({
        id: zod_1.z.string().min(1),
        type: zod_1.z.string().min(1),
        config: zod_1.z.record(zod_1.z.any()).optional(),
    }))
        .min(1),
    edges: zod_1.z.array(validation_1.AgentEdgeInputSchema).optional().default([]),
    input: zod_1.z.record(zod_1.z.any()).optional().default({}),
    apiKeys: zod_1.z.record(zod_1.z.any()).optional().default({}),
    agentName: zod_1.z.string().min(1).optional().default("Unnamed Agent"),
})
    .refine((data) => {
    // Validate that all edge endpoints exist in nodes
    const nodeIds = new Set(data.nodes.map((n) => n.id));
    for (const edge of data.edges) {
        if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
            return false;
        }
    }
    return true;
}, {
    message: "Invalid graph: edges reference non-existent nodes",
    path: ["edges"],
});
async function processJobFunction(jobData, jobId) {
    const { agentId, userId, input, config, apiKeys, executionId } = jobData;
    const jobStartTime = Date.now();
    try {
        // Update status to running with start time
        await updateExecutionStatus(executionId, "running", {
            started_at: new Date().toISOString(),
        });
        (0, socket_1.emitSocketEvent)("execution-started", { executionId });
        // Update job status in queue
        await supabaseClient_1.supabase
            .from("job_queue")
            .update({
            status: "processing",
            started_at: new Date().toISOString(),
        })
            .eq("id", jobId);
        // Decrypt API keys
        const decryptedApiKeys = JSON.parse((0, encryption_1.decryptValue)(apiKeys));
        // Execute the agent workflow (default missing input to an empty object)
        const result = await (0, agentEngine_1.executeWorkflow)(config.nodes || [], config.edges || [], input ?? {}, decryptedApiKeys, {
            onNodeStart: (nodeId) => {
                (0, socket_1.emitSocketEvent)("node-started", { executionId, nodeId });
            },
            onNodeComplete: (nodeId, success, error) => {
                (0, socket_1.emitSocketEvent)("node-completed", {
                    executionId,
                    nodeId,
                    success,
                    error,
                });
            },
            onExecutionComplete: (success) => {
                (0, socket_1.emitSocketEvent)("execution-completed", { executionId, success });
            },
        });
        if (!result.success) {
            throw new Error(`Workflow execution failed with errors: ${result.errors.join(", ")}`);
        }
        // Calculate execution time
        const executionTime = Date.now() - jobStartTime;
        // Update execution status to completed
        await updateExecutionStatus(executionId, "completed", {
            result: result.output,
            execution_time_ms: executionTime,
            completed_at: new Date().toISOString(),
            logs: result.logs,
            errors: result.errors,
            tokens_used: 0, // TODO: Add token counting
        });
        // Update job status to completed
        await supabaseClient_1.supabase
            .from("job_queue")
            .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            result: JSON.stringify(result),
        })
            .eq("id", jobId);
        return result;
    }
    catch (error) {
        const executionTime = Date.now() - jobStartTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Job processing failed for ${executionId}:`, error);
        (0, socket_1.emitSocketEvent)("execution-completed", {
            executionId,
            success: false,
            error: errorMessage,
        });
        // Update execution status to failed
        await updateExecutionStatus(executionId, "failed", {
            error_message: errorMessage,
            execution_time_ms: executionTime,
            completed_at: new Date().toISOString(),
        });
        // Update job status to failed
        await supabaseClient_1.supabase
            .from("job_queue")
            .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            error_message: errorMessage,
        })
            .eq("id", jobId);
        // Move to dead letter queue if retry attempts exceeded
        const { data: job } = await supabaseClient_1.supabase
            .from("job_queue")
            .select("attempt_count")
            .eq("id", jobId)
            .single();
        const retryCount = (job?.attempt_count || 0) + 1;
        const maxRetries = 3;
        if (retryCount >= maxRetries) {
            await supabaseClient_1.supabase
                .from("job_queue")
                .update({
                status: "dead_letter",
                attempt_count: retryCount,
            })
                .eq("id", jobId);
        }
        else {
            // Schedule retry with exponential backoff
            const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 300000); // Max 5 minutes
            const retryAt = new Date(Date.now() + backoffDelay);
            await supabaseClient_1.supabase
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
exports.agentQueue = new DatabaseQueue();
// Dead-letter queue (same implementation for now)
exports.deadLetterQueue = {
    async getWaiting() {
        const { data } = await supabaseClient_1.supabase
            .from("job_queue")
            .select("*")
            .eq("status", "dead_letter")
            .order("created_at", { ascending: false });
        return data || [];
    },
    async getJob(jobId) {
        const { data } = await supabaseClient_1.supabase
            .from("job_queue")
            .select("*")
            .eq("id", jobId)
            .eq("status", "dead_letter")
            .single();
        return data;
    },
    async add(jobData) {
        // This is handled by the main queue when jobs fail
        return { id: "dead-letter" };
    },
};
// Queue management utilities
class QueueManager {
    static async getQueueStats() {
        const [waiting, active, completed, failed, delayed, deadLetter] = await Promise.all([
            exports.agentQueue.getWaiting(),
            exports.agentQueue.getActive(),
            exports.agentQueue.getCompleted(),
            exports.agentQueue.getFailed(),
            exports.agentQueue.getDelayed(),
            exports.deadLetterQueue.getWaiting(),
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
    static async retryDeadLetterJob(jobId) {
        // Get the dead-letter job
        const job = await exports.deadLetterQueue.getJob(jobId);
        if (!job) {
            throw new Error(`Dead-letter job ${jobId} not found`);
        }
        // Reset job for retry
        await supabaseClient_1.supabase
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
        const { data: completedJobs } = (await supabaseClient_1.supabase
            .from("job_queue")
            .delete()
            .eq("status", "completed")
            .lt("completed_at", cutoff.toISOString()));
        const { data: failedJobs } = (await supabaseClient_1.supabase
            .from("job_queue")
            .delete()
            .eq("status", "failed")
            .lt("created_at", cutoff.toISOString()));
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
        // For database-backed queue, we can't easily pause
        // This would require additional state management
        return {
            success: false,
            message: "Pause not implemented for database queue",
        };
    }
    static async resumeQueue() {
        // For database-backed queue, processing is always active
        return {
            success: false,
            message: "Resume not implemented for database queue",
        };
    }
}
exports.QueueManager = QueueManager;
