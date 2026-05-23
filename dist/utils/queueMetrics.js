"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bullJobsFailedTotal = exports.bullJobsCompletedTotal = exports.bullJobsDelayed = exports.bullJobsActive = exports.bullJobsWaiting = exports.bullJobProcessingDuration = void 0;
exports.refreshBullQueueMetrics = refreshBullQueueMetrics;
const prom_client_1 = require("prom-client");
const telemetry_1 = require("../telemetry");
const config_1 = require("../config");
const QUEUE_LABELS = ['queue_name', 'instance_id'];
exports.bullJobProcessingDuration = new prom_client_1.Histogram({
    name: 'bull_job_processing_duration_seconds',
    help: 'Time spent processing a Bull queue job',
    registers: [telemetry_1.metricsRegistry],
    labelNames: QUEUE_LABELS,
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
});
exports.bullJobsWaiting = new prom_client_1.Gauge({
    name: 'bull_queue_jobs_waiting',
    help: 'Number of jobs currently waiting in the Bull queue',
    registers: [telemetry_1.metricsRegistry],
    labelNames: QUEUE_LABELS,
});
exports.bullJobsActive = new prom_client_1.Gauge({
    name: 'bull_queue_jobs_active',
    help: 'Number of active jobs currently being processed by the Bull worker',
    registers: [telemetry_1.metricsRegistry],
    labelNames: QUEUE_LABELS,
});
exports.bullJobsDelayed = new prom_client_1.Gauge({
    name: 'bull_queue_jobs_delayed',
    help: 'Number of delayed jobs in the Bull queue',
    registers: [telemetry_1.metricsRegistry],
    labelNames: QUEUE_LABELS,
});
exports.bullJobsCompletedTotal = new prom_client_1.Counter({
    name: 'bull_queue_jobs_completed_total',
    help: 'Total number of completed jobs processed by the Bull queue',
    registers: [telemetry_1.metricsRegistry],
    labelNames: QUEUE_LABELS,
});
exports.bullJobsFailedTotal = new prom_client_1.Counter({
    name: 'bull_queue_jobs_failed_total',
    help: 'Total number of failed jobs processed by the Bull queue',
    registers: [telemetry_1.metricsRegistry],
    labelNames: QUEUE_LABELS,
});
async function refreshBullQueueMetrics(queueName, queue) {
    try {
        const [waiting, active, delayed] = await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getDelayedCount(),
        ]);
        exports.bullJobsWaiting.labels(queueName, config_1.INSTANCE_ID).set(waiting);
        exports.bullJobsActive.labels(queueName, config_1.INSTANCE_ID).set(active);
        exports.bullJobsDelayed.labels(queueName, config_1.INSTANCE_ID).set(delayed);
    }
    catch (err) {
        console.warn('Failed to refresh Bull queue metrics', err);
    }
}
