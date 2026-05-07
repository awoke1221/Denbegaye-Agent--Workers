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
    if (!executionId) {
        console.error("Missing execution ID for status update");
        return;
    }
    const { data: execution, error } = await supabaseClient_1.supabase
        .from("agent_executions")
        .select("status")
        .eq("id", executionId)
        .single();
    if (error || !execution) {
        console.error(`Execution ${executionId} not found`, error);
        return;
    }
    if (!isValidStatusTransition(execution.status, newStatus)) {
        console.error(`Invalid status transition from ${execution.status} to ${newStatus} for execution ${executionId}`);
        return;
    }
    const updateData = {
        status: newStatus,
        ...additionalData,
    };
    if (newStatus === "completed" || newStatus === "failed") {
        updateData.completed_at = new Date().toISOString();
    }
    await supabaseClient_1.supabase
        .from("agent_executions")
        .update(updateData)
        .eq("id", executionId);
}
class DatabaseQueue {
    constructor() {
        this.processing = false;
        this.dbProcessing = false;
        this.redisProcessing = false;
        this.maxConcurrency = 5;
        this.processingJobs = new Set();
        this.started = false;
    }
    async add(jobData, options = {}) {
        const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
        void this.start().catch((queueError) => {
            console.error("Failed to ensure queue processing started:", queueError);
        });
        if (redisClient) {
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
            void this.startProcessing();
        }
        else {
            void this.startProcessing();
        }
    }
    async startProcessing() {
        if (this.dbProcessing)
            return;
        this.dbProcessing = true;
        this.processing = true;
        while (this.processing) {
            try {
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
                    await this.delay(5000);
                    continue;
                }
                if (!jobs || jobs.length === 0) {
                    await this.delay(1000);
                    continue;
                }
                const processingPromises = jobs.map((job) => this.processJob(job));
                await Promise.allSettled(processingPromises);
            }
            catch (error) {
                console.error("Queue processing error:", error);
                await this.delay(5000);
            }
        }
    }
    async claimJob(job) {
        const { data: claimedJob, error } = await supabaseClient_1.supabase
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
            return false;
        }
        return true;
    }
    async processJob(job) {
        if (this.processingJobs.has(job.id))
            return;
        this.processingJobs.add(job.id);
        try {
            const claimed = await this.claimJob(job);
            if (!claimed) {
                return;
            }
            await processJobFunction(job.payload, job.id);
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
                await supabaseClient_1.supabase
                    .from("job_queue")
                    .update({
                    status: "dead_letter",
                    error_message: error instanceof Error ? error.message : "Unknown error",
                    failed_at: new Date().toISOString(),
                })
                    .eq("id", job.id);
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
                const delay = Math.min(1000 * Math.pow(2, attemptCount - 1), 300000);
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
        if (this.redisProcessing)
            return;
        this.redisProcessing = true;
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
            const jobRow = job;
            if (jobRow.status !== "queued") {
                return;
            }
            await this.processJob(jobRow);
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
    saveAsAgent: zod_1.z.boolean().optional().default(false), // NEW: Only save as agent if explicitly requested
    isTemporary: zod_1.z.boolean().optional().default(true), // NEW: Mark execution as temporary
})
    .refine((data) => {
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
    if (!executionId) {
        throw new Error("Missing executionId");
    }
    if (!userId) {
        throw new Error("Missing userId");
    }
    const jobStartTime = Date.now();
    try {
        await updateExecutionStatus(executionId, "running", {
            started_at: new Date().toISOString(),
        });
        (0, socket_1.emitSocketEvent)("execution-started", { executionId });
        await supabaseClient_1.supabase
            .from("job_queue")
            .update({
            status: "processing",
            started_at: new Date().toISOString(),
        })
            .eq("id", jobId);
        const decryptedApiKeys = JSON.parse((0, encryption_1.decryptValue)(apiKeys));
        const result = await (0, agentEngine_1.executeWorkflow)(config?.nodes || [], config?.edges || [], input ?? {}, decryptedApiKeys, executionId, userId, {
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
            onExecutionComplete: (result) => {
                const success = typeof result === 'boolean' ? result : result?.success || false;
                const partialSuccess = typeof result === 'object' ? result?.partialSuccess || false : false;
                (0, socket_1.emitSocketEvent)("execution-completed", {
                    executionId,
                    success,
                    partialSuccess,
                });
            },
            onCompensationStart: (nodeId) => {
                (0, socket_1.emitSocketEvent)("compensation-started", { executionId, nodeId });
            },
            onCompensationComplete: (nodeId, success) => {
                (0, socket_1.emitSocketEvent)("compensation-completed", {
                    executionId,
                    nodeId,
                    success,
                });
            },
        });
        const executionTime = Date.now() - jobStartTime;
        // Determine final status based on advanced execution result
        let finalStatus;
        let finalResult = result;
        if (result.success) {
            finalStatus = "completed";
        }
        else if (result.partialSuccess) {
            // Partial success - workflow had some successful nodes but overall failed
            finalStatus = "partial_success";
            finalResult = {
                ...result,
                partialSuccess: true,
                compensatedNodes: result.compensatedNodes || [],
                failedNodes: result.failedNodes || [],
            };
        }
        else {
            finalStatus = "failed";
        }
        await updateExecutionStatus(executionId, finalStatus, {
            result: finalResult,
            execution_time_ms: executionTime,
            completed_at: new Date().toISOString(),
            logs: result.logs,
            errors: result.errors,
            tokens_used: 0,
            partial_success: result.partialSuccess || false,
            compensated_nodes: result.compensatedNodes || [],
            failed_nodes: result.failedNodes || [],
            circuit_breaker_tripped: result.circuitBreakerTripped || false,
        });
        await supabaseClient_1.supabase
            .from("job_queue")
            .update({
            status: finalStatus === "completed" ? "completed" : "failed",
            completed_at: new Date().toISOString(),
            result: JSON.stringify(finalResult),
        })
            .eq("id", jobId);
        return finalResult;
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
        await updateExecutionStatus(executionId, "failed", {
            error_message: errorMessage,
            execution_time_ms: executionTime,
            completed_at: new Date().toISOString(),
        });
        await supabaseClient_1.supabase
            .from("job_queue")
            .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            error_message: errorMessage,
        })
            .eq("id", jobId);
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
            const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 300000);
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
        return { id: "dead-letter" };
    },
};
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
        const job = await exports.deadLetterQueue.getJob(jobId);
        if (!job) {
            throw new Error(`Dead-letter job ${jobId} not found`);
        }
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
        const completedResponse = await supabaseClient_1.supabase
            .from("job_queue")
            .delete()
            .eq("status", "completed")
            .lt("completed_at", cutoff.toISOString());
        const failedResponse = await supabaseClient_1.supabase
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
exports.QueueManager = QueueManager;
