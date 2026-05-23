"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.initBullQueue = initBullQueue;
exports.addBullJob = addBullJob;
exports.startBullWorker = startBullWorker;
exports.closeBull = closeBull;
const bullmq_1 = require("bullmq");
const logger_1 = require("./logger");
const queueMetrics_1 = require("./queueMetrics");
const REDIS_URL = process.env.REDIS_URL;
const QUEUE_NAME = process.env.BULL_QUEUE_NAME || "agent-execution-queue";
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || "4");
let queue = null;
let worker = null;
let scheduler = null;
let queueEvents = null;
async function initBullQueue() {
    if (!REDIS_URL) {
        logger_1.logger.info("BULL: REDIS_URL not set — skipping Bull initialization");
        return;
    }
    const redisOpts = { url: REDIS_URL };
    queue = new bullmq_1.Queue(QUEUE_NAME, { connection: redisOpts });
    scheduler = new bullmq_1.JobScheduler(QUEUE_NAME, { connection: redisOpts });
    queueEvents = new bullmq_1.QueueEvents(QUEUE_NAME, { connection: redisOpts });
    // Graceful event listeners
    queue.on("error", (err) => logger_1.logger.error("Bull queue error", { err }));
    if (queueEvents) {
        await queueEvents.waitUntilReady();
        queueEvents.on("waiting", async ({ jobId }) => {
            logger_1.logger.debug("Bull job waiting", { jobId });
            await (0, queueMetrics_1.refreshBullQueueMetrics)(QUEUE_NAME, queue);
        });
        queueEvents.on("active", async ({ jobId }) => {
            logger_1.logger.info("Bull job active", { jobId });
            await (0, queueMetrics_1.refreshBullQueueMetrics)(QUEUE_NAME, queue);
        });
        queueEvents.on("completed", async ({ jobId }) => {
            logger_1.logger.info("Bull job completed", { jobId });
            queueMetrics_1.bullJobsCompletedTotal
                .labels(QUEUE_NAME, process.env.INSTANCE_ID || "unknown")
                .inc();
            await (0, queueMetrics_1.refreshBullQueueMetrics)(QUEUE_NAME, queue);
        });
        queueEvents.on("failed", async ({ jobId, failedReason }) => {
            logger_1.logger.error("Bull job failed", { jobId, failedReason });
            queueMetrics_1.bullJobsFailedTotal
                .labels(QUEUE_NAME, process.env.INSTANCE_ID || "unknown")
                .inc();
            await (0, queueMetrics_1.refreshBullQueueMetrics)(QUEUE_NAME, queue);
        });
    }
    logger_1.logger.info("Bull queue initialized", { queue: QUEUE_NAME });
    await (0, queueMetrics_1.refreshBullQueueMetrics)(QUEUE_NAME, queue);
}
async function addBullJob(jobId, payload, opts = {}) {
    if (!queue) {
        logger_1.logger.warn("BULL: queue not initialized, cannot add job");
        return null;
    }
    const job = await queue.add({ jobId, ...payload }, {
        removeOnComplete: true,
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        ...opts,
    });
    logger_1.logger.info("Bull job added", { jobId: job.id });
    await (0, queueMetrics_1.refreshBullQueueMetrics)(QUEUE_NAME, queue);
    return job.id;
}
async function startBullWorker() {
    if (!REDIS_URL) {
        logger_1.logger.info("BULL: REDIS_URL not set — skipping worker startup");
        return;
    }
    if (!queue)
        await initBullQueue();
    if (!queue)
        return;
    worker = new bullmq_1.Worker(QUEUE_NAME, async (job) => {
        const { jobId, ...payload } = job.data;
        logger_1.logger.info("Bull worker processing job", { jobId, id: job.id });
        const timer = queueMetrics_1.bullJobProcessingDuration
            .labels(QUEUE_NAME, process.env.INSTANCE_ID || "unknown")
            .startTimer();
        try {
            // dynamic import to avoid circular dependency at module init
            const mod = await Promise.resolve().then(() => __importStar(require("./agentQueue")));
            const fn = mod.processJobFunction;
            if (!fn)
                throw new Error("processJobFunction not available");
            await fn(payload, jobId);
        }
        catch (e) {
            logger_1.logger.error("Bull worker failed executing job", { err: e });
            throw e;
        }
        finally {
            timer();
        }
    }, { connection: { url: REDIS_URL }, concurrency: CONCURRENCY });
    worker.on("completed", (job) => {
        logger_1.logger.info("Bull job completed", { jobId: job.id });
    });
    worker.on("failed", (job, err) => {
        logger_1.logger.error("Bull job failed", { jobId: job?.id, err });
    });
    logger_1.logger.info("Bull worker started", { concurrency: CONCURRENCY });
}
async function closeBull() {
    try {
        await worker?.close();
        await scheduler?.close();
        await queue?.close();
    }
    catch (e) {
        logger_1.logger.warn("Error closing Bull resources", { e });
    }
}
