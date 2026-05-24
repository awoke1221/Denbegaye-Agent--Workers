import net from "net";
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

async function isOtlpEndpointReachable(
  urlString: string,
  timeoutMs = 1500,
): Promise<boolean> {
  try {
    const url = new URL(urlString);
    const port = Number(url.port) || (url.protocol === "https:" ? 443 : 80);
    const host = url.hostname;

    return new Promise((resolve) => {
      const socket = net.createConnection(
        { host, port, timeout: timeoutMs },
        () => {
          socket.destroy();
          resolve(true);
        },
      );

      socket.on("error", () => {
        socket.destroy();
        resolve(false);
      });

      socket.on("timeout", () => {
        socket.destroy();
        resolve(false);
      });
    });
  } catch (error) {
    return false;
  }
}

async function initializeTelemetry() {
  let traceExporter;

  if (otlpEnabled) {
    const reachable = await isOtlpEndpointReachable(OTLP_ENDPOINT);
    if (reachable) {
      traceExporter = new OTLPTraceExporter({ url: OTLP_ENDPOINT });
    } else {
      console.warn(
        `OTLP endpoint ${OTLP_ENDPOINT} is unreachable. OpenTelemetry tracing will be disabled until a valid collector endpoint is configured.`,
      );
    }
  } else {
    console.warn(
      "OTLP endpoint is not configured. OpenTelemetry is running without a trace exporter.",
    );
  }

  const sdkConfig: any = {
    instrumentations: [getNodeAutoInstrumentations()],
  };

  if (!traceExporter) {
    console.info(
      "OpenTelemetry disabled because no OTLP exporter is configured.",
    );
    return;
  }

  sdkConfig.traceExporter = traceExporter;
  const sdk = new NodeSDK(sdkConfig);

  try {
    await sdk.start();
    console.info("OpenTelemetry initialized");
  } catch (err: unknown) {
    console.error("OpenTelemetry failed to start", err);
  }
}

void initializeTelemetry();

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
