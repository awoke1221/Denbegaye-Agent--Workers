"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.metricsContentType = exports.metricsRegistry = void 0;
const net_1 = __importDefault(require("net"));
const sdk_node_1 = require("@opentelemetry/sdk-node");
const auto_instrumentations_node_1 = require("@opentelemetry/auto-instrumentations-node");
const exporter_trace_otlp_http_1 = require("@opentelemetry/exporter-trace-otlp-http");
const api_1 = require("@opentelemetry/api");
const prom_client_1 = __importDefault(require("prom-client"));
const config_1 = require("./config");
// Initialize diagnostic logger for OpenTelemetry
api_1.diag.setLogger(new api_1.DiagConsoleLogger(), api_1.DiagLogLevel.INFO);
const OTLP_ENDPOINT = process.env.OTLP_ENDPOINT || "";
const otlpEnabled = Boolean(OTLP_ENDPOINT);
async function isOtlpEndpointReachable(urlString, timeoutMs = 1500) {
    try {
        const url = new URL(urlString);
        const port = Number(url.port) || (url.protocol === "https:" ? 443 : 80);
        const host = url.hostname;
        return new Promise((resolve) => {
            const socket = net_1.default.createConnection({ host, port, timeout: timeoutMs }, () => {
                socket.destroy();
                resolve(true);
            });
            socket.on("error", () => {
                socket.destroy();
                resolve(false);
            });
            socket.on("timeout", () => {
                socket.destroy();
                resolve(false);
            });
        });
    }
    catch (error) {
        return false;
    }
}
async function initializeTelemetry() {
    let traceExporter;
    if (otlpEnabled) {
        const reachable = await isOtlpEndpointReachable(OTLP_ENDPOINT);
        if (reachable) {
            traceExporter = new exporter_trace_otlp_http_1.OTLPTraceExporter({ url: OTLP_ENDPOINT });
        }
        else {
            console.warn(`OTLP endpoint ${OTLP_ENDPOINT} is unreachable. OpenTelemetry tracing will be disabled until a valid collector endpoint is configured.`);
        }
    }
    else {
        console.warn("OTLP endpoint is not configured. OpenTelemetry is running without a trace exporter.");
    }
    const sdkConfig = {
        instrumentations: [(0, auto_instrumentations_node_1.getNodeAutoInstrumentations)()],
    };
    if (!traceExporter) {
        console.info("OpenTelemetry disabled because no OTLP exporter is configured.");
        return;
    }
    sdkConfig.traceExporter = traceExporter;
    const sdk = new sdk_node_1.NodeSDK(sdkConfig);
    try {
        await sdk.start();
        console.info("OpenTelemetry initialized");
    }
    catch (err) {
        console.error("OpenTelemetry failed to start", err);
    }
}
void initializeTelemetry();
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
const metricsContentType = metricsRegistry.contentType || "text/plain; version=0.0.4; charset=utf-8";
exports.metricsContentType = metricsContentType;
