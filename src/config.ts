import dotenv from "dotenv";
import os from "os";

const envPath = process.env.NODE_ENV === "production" ? ".env" : ".env.local";
dotenv.config({ path: envPath });

export const NODE_ENV = process.env.NODE_ENV || "development";
export const SERVICE_ROLE = (process.env.SERVICE_ROLE || "all").toLowerCase();
export const INSTANCE_ID =
  process.env.INSTANCE_ID || process.env.HOSTNAME || os.hostname();
export const REDIS_URL = process.env.REDIS_URL || "";
export const USE_BULL_QUEUE = process.env.USE_BULL_QUEUE === "true";
export const BULL_QUEUE_NAME =
  process.env.BULL_QUEUE_NAME || "agent-execution-queue";
export const WORKER_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || "4");
export const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
export const PORT = Number(process.env.PORT || "3001");
export const OTLP_ENDPOINT = process.env.OTLP_ENDPOINT || "";
export const SERVICE_NAME =
  process.env.SERVICE_NAME || "denbegaye-agent-workers";
export const LOG_LEVEL = process.env.LOG_LEVEL || "info";
