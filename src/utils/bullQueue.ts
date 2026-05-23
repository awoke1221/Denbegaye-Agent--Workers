import { Queue, Worker, QueueEvents, JobScheduler } from "bullmq";
import { logger } from "./logger";
import {
  bullJobProcessingDuration,
  bullJobsCompletedTotal,
  bullJobsFailedTotal,
  bullJobsWaiting,
  bullJobsActive,
  bullJobsDelayed,
  refreshBullQueueMetrics,
} from "./queueMetrics";
import {
  createRedisConnection,
  attachRedisEventHandlers,
} from "./redisConnection";

const QUEUE_NAME = process.env.BULL_QUEUE_NAME || "agent-execution-queue";
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || "4");

let queue: Queue | null = null;
let worker: Worker | null = null;
let scheduler: JobScheduler | null = null;
let queueEvents: QueueEvents | null = null;

export async function initBullQueue() {
  let redisConnection;
  try {
    redisConnection = createRedisConnection();
    attachRedisEventHandlers(redisConnection, "BullQueue");
  } catch (error) {
    logger.info(
      "BULL: Redis connection could not be created — skipping Bull initialization",
      { error },
    );
    return;
  }

  queue = new Queue(QUEUE_NAME, { connection: redisConnection as any });
  scheduler = new JobScheduler(QUEUE_NAME, {
    connection: redisConnection as any,
  });
  queueEvents = new QueueEvents(QUEUE_NAME, {
    connection: redisConnection as any,
  });

  // Graceful event listeners
  queue.on("error", (err) => logger.error("Bull queue error", { err }));
  if (queueEvents) {
    await queueEvents.waitUntilReady();
    queueEvents.on("waiting", async ({ jobId }) => {
      logger.debug("Bull job waiting", { jobId });
      await refreshBullQueueMetrics(QUEUE_NAME, queue!);
    });
    queueEvents.on("active", async ({ jobId }) => {
      logger.info("Bull job active", { jobId });
      await refreshBullQueueMetrics(QUEUE_NAME, queue!);
    });
    queueEvents.on("completed", async ({ jobId }) => {
      logger.info("Bull job completed", { jobId });
      bullJobsCompletedTotal
        .labels(QUEUE_NAME, process.env.INSTANCE_ID || "unknown")
        .inc();
      await refreshBullQueueMetrics(QUEUE_NAME, queue!);
    });
    queueEvents.on("failed", async ({ jobId, failedReason }) => {
      logger.error("Bull job failed", { jobId, failedReason });
      bullJobsFailedTotal
        .labels(QUEUE_NAME, process.env.INSTANCE_ID || "unknown")
        .inc();
      await refreshBullQueueMetrics(QUEUE_NAME, queue!);
    });
  }

  logger.info("Bull queue initialized", { queue: QUEUE_NAME });
  await refreshBullQueueMetrics(QUEUE_NAME, queue);
}

export async function addBullJob(jobId: string, payload: any, opts: any = {}) {
  if (!queue) {
    logger.warn("BULL: queue not initialized, cannot add job");
    return null;
  }
  const job = await queue.add(
    { jobId, ...payload },
    {
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      ...opts,
    },
  );
  logger.info("Bull job added", { jobId: job.id });
  await refreshBullQueueMetrics(QUEUE_NAME, queue);
  return job.id;
}

export async function startBullWorker() {
  if (!REDIS_URL) {
    logger.info("BULL: REDIS_URL not set — skipping worker startup");
    return;
  }
  if (!queue) await initBullQueue();
  if (!queue) return;

  worker = new Worker(
    QUEUE_NAME,
    async (job: any) => {
      const { jobId, ...payload } = job.data;
      logger.info("Bull worker processing job", { jobId, id: job.id });
      const timer = bullJobProcessingDuration
        .labels(QUEUE_NAME, process.env.INSTANCE_ID || "unknown")
        .startTimer();
      try {
        // dynamic import to avoid circular dependency at module init
        const mod = await import("./agentQueue");
        const fn = mod.processJobFunction;
        if (!fn) throw new Error("processJobFunction not available");
        await fn(payload as any, jobId as string);
      } catch (e) {
        logger.error("Bull worker failed executing job", { err: e });
        throw e;
      } finally {
        timer();
      }
    },
    { connection: { url: REDIS_URL } as any, concurrency: CONCURRENCY },
  );

  worker.on("completed", (job: any) => {
    logger.info("Bull job completed", { jobId: job.id });
  });
  worker.on("failed", (job: any, err: any) => {
    logger.error("Bull job failed", { jobId: job?.id, err });
  });

  logger.info("Bull worker started", { concurrency: CONCURRENCY });
}

export async function closeBull() {
  try {
    await worker?.close();
    await scheduler?.close();
    await queue?.close();
  } catch (e) {
    logger.warn("Error closing Bull resources", { e });
  }
}
