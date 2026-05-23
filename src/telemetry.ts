import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import client, { Registry } from "prom-client";
import { INSTANCE_ID, SERVICE_NAME, SERVICE_ROLE } from "./config";

// Initialize diagnostic logger for OpenTelemetry
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

const OTLP_ENDPOINT = process.env.OTLP_ENDPOINT || "";
const otlpEnabled = Boolean(OTLP_ENDPOINT);

// Trace exporter (OTLP HTTP) - suitable for sending traces to a collector/Jaeger
const traceExporter = otlpEnabled
  ? new OTLPTraceExporter({ url: OTLP_ENDPOINT })
  : undefined;

const sdkConfig: any = {
  instrumentations: [getNodeAutoInstrumentations()],
};
if (traceExporter) {
  sdkConfig.traceExporter = traceExporter;
} else {
  console.warn(
    "OTLP endpoint is not configured. OpenTelemetry is running without a trace exporter.",
  );
}

// Create and start the OpenTelemetry Node SDK with auto-instrumentation
const sdk = new NodeSDK(sdkConfig);

try {
  sdk.start();
  console.info(
    `OpenTelemetry initialized${traceExporter ? "" : " (no OTLP exporter configured)"}`,
  );
} catch (err: unknown) {
  console.error("OpenTelemetry failed to start", err);
}

// Prometheus / metrics setup using prom-client
const metricsRegistry: Registry = new client.Registry();
metricsRegistry.setDefaultLabels({
  service_name: SERVICE_NAME,
  service_role: SERVICE_ROLE,
  instance_id: INSTANCE_ID,
});

// Collect default Node.js metrics (CPU, heap, event loop, etc.)
client.collectDefaultMetrics({ register: metricsRegistry });

const metricsContentType =
  metricsRegistry.contentType || "text/plain; version=0.0.4; charset=utf-8";

export { metricsRegistry, metricsContentType };
