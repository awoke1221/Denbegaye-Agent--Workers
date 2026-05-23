"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.metricsContentType = exports.metricsRegistry = void 0;
const sdk_node_1 = require("@opentelemetry/sdk-node");
const auto_instrumentations_node_1 = require("@opentelemetry/auto-instrumentations-node");
const exporter_trace_otlp_http_1 = require("@opentelemetry/exporter-trace-otlp-http");
const api_1 = require("@opentelemetry/api");
const prom_client_1 = __importDefault(require("prom-client"));
const config_1 = require("./config");
// Initialize diagnostic logger for OpenTelemetry
api_1.diag.setLogger(new api_1.DiagConsoleLogger(), api_1.DiagLogLevel.INFO);
const OTLP_ENDPOINT = process.env.OTLP_ENDPOINT || '';
const otlpEnabled = Boolean(OTLP_ENDPOINT);
// Trace exporter (OTLP HTTP) - suitable for sending traces to a collector/Jaeger
const traceExporter = otlpEnabled
    ? new exporter_trace_otlp_http_1.OTLPTraceExporter({ url: OTLP_ENDPOINT })
    : undefined;
const sdkConfig = {
    instrumentations: [(0, auto_instrumentations_node_1.getNodeAutoInstrumentations)()],
};
if (traceExporter) {
    sdkConfig.traceExporter = traceExporter;
}
else {
    console.warn('OTLP endpoint is not configured. OpenTelemetry is running without a trace exporter.');
}
// Create and start the OpenTelemetry Node SDK with auto-instrumentation
const sdk = new sdk_node_1.NodeSDK(sdkConfig);
try {
    sdk.start();
    console.info(`OpenTelemetry initialized${traceExporter ? '' : ' (no OTLP exporter configured)'}`);
}
catch (err) {
    console.error('OpenTelemetry failed to start', err);
}
// Prometheus / metrics setup using prom-client
const metricsRegistry = new prom_client_1.default.Registry();
exports.metricsRegistry = metricsRegistry;
metricsRegistry.setDefaultLabels({
    service_name: config_1.SERVICE_NAME,
    service_role: config_1.SERVICE_ROLE,
    instance_id: config_1.INSTANCE_ID,
});
// Collect default Node.js metrics (CPU, heap, event loop, etc.)
prom_client_1.default.collectDefaultMetrics({ register: metricsRegistry });
const metricsContentType = metricsRegistry.contentType ||
    'text/plain; version=0.0.4; charset=utf-8';
exports.metricsContentType = metricsContentType;
