import { Counter, Gauge, Histogram } from "prom-client";
import { metricsRegistry } from "../telemetry";
import { INSTANCE_ID } from "../config";

const QUEUE_LABELS = ["queue_name", "instance_id"] as const;

export const bullJobProcessingDuration = new Histogram({
  name: "bull_job_processing_duration_seconds",
  help: "Time spent processing a Bull queue job",
  registers: [metricsRegistry],
  labelNames: QUEUE_LABELS,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
});

export const bullJobsWaiting = new Gauge({
  name: "bull_queue_jobs_waiting",
  help: "Number of jobs currently waiting in the Bull queue",
  registers: [metricsRegistry],
  labelNames: QUEUE_LABELS,
});

export const bullJobsActive = new Gauge({
  name: "bull_queue_jobs_active",
  help: "Number of active jobs currently being processed by the Bull worker",
  registers: [metricsRegistry],
  labelNames: QUEUE_LABELS,
});

export const bullJobsDelayed = new Gauge({
  name: "bull_queue_jobs_delayed",
  help: "Number of delayed jobs in the Bull queue",
  registers: [metricsRegistry],
  labelNames: QUEUE_LABELS,
});

export const bullJobsCompletedTotal = new Counter({
  name: "bull_queue_jobs_completed_total",
  help: "Total number of completed jobs processed by the Bull queue",
  registers: [metricsRegistry],
  labelNames: QUEUE_LABELS,
});

export const bullJobsFailedTotal = new Counter({
  name: "bull_queue_jobs_failed_total",
  help: "Total number of failed jobs processed by the Bull queue",
  registers: [metricsRegistry],
  labelNames: QUEUE_LABELS,
});

export async function refreshBullQueueMetrics(queueName: string, queue: any) {
  try {
    const [waiting, active, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getDelayedCount(),
    ]);
    bullJobsWaiting.labels(queueName, INSTANCE_ID).set(waiting);
    bullJobsActive.labels(queueName, INSTANCE_ID).set(active);
    bullJobsDelayed.labels(queueName, INSTANCE_ID).set(delayed);
  } catch (err) {
    console.warn("Failed to refresh Bull queue metrics", err);
  }
}
