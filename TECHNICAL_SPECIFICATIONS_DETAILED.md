# 🔧 TECHNICAL SPECIFICATIONS & ACTION ITEMS

## Denbegaye AI Agent Workers - Detailed Implementation Guide

---

## 📝 FILE-BY-FILE ACTION PLAN

### **TIER 1: CRITICAL PATH FILES**

---

### **File: `src/routes/agentRun.ts`** [NEEDS REVIEW]

**Priority:** CRITICAL  
**Status:** Not fully reviewed  
**Required Action:** Validate input handling and error management

**MUST ADD:**

```typescript
import { z } from "zod";
import { sanitizeOutput } from "../utils/sanitization";

// Define strict schema for agent run
const AgentRunRequestSchema = z.object({
  agentId: z.string().uuid().optional(),
  nodes: z.array(NodeSchema).min(1).max(1000),
  edges: z.array(EdgeSchema).optional().default([]),
  input: z.record(z.any()).optional(),
  apiKeys: z.record(z.string()).optional(),
  config: z
    .object({
      timeout: z.number().min(1000).max(600000).default(300000),
      maxRetries: z.number().min(0).max(10).default(3),
      saveAsAgent: z.boolean().default(false),
    })
    .optional(),
});

export const agentRunHandler = async (req, res) => {
  try {
    // 1. Validate input
    const validated = AgentRunRequestSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({
        error: "Invalid request",
        details: validated.error.issues,
      });
    }

    const { nodes, edges, input, config } = validated.data;

    // 2. Check rate limit (add to middleware instead)
    const userId = req.user?.id;
    const rateLimit = await checkRateLimit(userId, "executions");
    if (!rateLimit.allowed) {
      return res.status(429).json({
        error: "Rate limit exceeded",
        retryAfter: rateLimit.resetTime,
      });
    }

    // 3. Validate workflow (DAG check)
    const hasErrors = validateWorkflow(nodes, edges);
    if (hasErrors.length > 0) {
      return res.status(400).json({
        error: "Invalid workflow",
        details: hasErrors,
      });
    }

    // 4. Execute workflow
    const executionId = crypto.randomUUID();
    const result = await executeAgent({
      executionId,
      userId,
      nodes,
      edges,
      input,
      config,
    });

    // 5. Sanitize output before sending
    const sanitized = sanitizeOutput(result);

    // 6. Persist execution
    await logExecution({
      executionId,
      userId,
      agentId: validated.data.agentId,
      status: "completed",
      output: sanitized,
      duration: result.duration,
    });

    // 7. Return result
    return res.json({
      executionId,
      status: "completed",
      output: sanitized,
      duration: result.duration,
    });
  } catch (error) {
    logger.error("Agent run error", { error });

    // Ensure errors are not too verbose
    const message =
      error instanceof Error
        ? error.message.slice(0, 200) // Truncate
        : "Internal server error";

    return res.status(500).json({ error: message });
  }
};

// Helper: Validate workflow DAG
function validateWorkflow(nodes, edges) {
  const errors = [];

  // Check for duplicates
  const nodeIds = new Set();
  nodes.forEach((n) => {
    if (nodeIds.has(n.id)) {
      errors.push(`Duplicate node ID: ${n.id}`);
    }
    nodeIds.add(n.id);
  });

  // Check for cycles
  if (hasCycle(edges)) {
    errors.push("Workflow contains cycles (must be DAG)");
  }

  // Check edge references
  edges.forEach((e) => {
    if (!nodeIds.has(e.source)) {
      errors.push(`Edge references invalid source: ${e.source}`);
    }
    if (!nodeIds.has(e.target)) {
      errors.push(`Edge references invalid target: ${e.target}`);
    }
  });

  // Check node configs
  nodes.forEach((n) => {
    const requirements = NODE_CONFIG_REQUIREMENTS[n.type] || [];
    requirements.forEach((req) => {
      if (!n.config?.[req]) {
        errors.push(`Node ${n.id} missing required config: ${req}`);
      }
    });
  });

  return errors;
}

// Helper: Cycle detection
function hasCycle(edges) {
  // Implementation from earlier in this document
  const adjList = new Map();
  edges.forEach((e) => {
    if (!adjList.has(e.source)) adjList.set(e.source, []);
    adjList.get(e.source).push(e.target);
  });

  const visited = new Set();
  const recStack = new Set();

  const dfs = (node) => {
    visited.add(node);
    recStack.add(node);

    for (const neighbor of adjList.get(node) || []) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recStack.has(neighbor)) {
        return true;
      }
    }
    recStack.delete(node);
    return false;
  };

  for (const node of adjList.keys()) {
    if (!visited.has(node) && dfs(node)) return true;
  }
  return false;
}
```

---

### **File: `src/utils/encryption.ts`** [EXCELLENT - Minor Improvements]

**Priority:** LOW  
**Current Status:** ✅ BEST IN CLASS  
**Recommended Enhancements:**

```typescript
// ADD: Encryption key rotation
export interface EncryptionKeyVersion {
  version: number;
  key: Buffer;
  createdAt: Date;
  rotatedAt?: Date;
  deprecated: boolean;
}

const keyVersions: Map<number, EncryptionKeyVersion> = new Map();
let currentKeyVersion = 0;

export function rotateEncryptionKey(newKeyHex: string) {
  const newKey = validateEncryptionKey(newKeyHex);
  const version = currentKeyVersion + 1;

  keyVersions.set(version, {
    version,
    key: newKey,
    createdAt: new Date(),
    deprecated: false,
  });

  currentKeyVersion = version;

  // Log rotation event
  logger.info("Encryption key rotated", {
    newVersion: version,
    timestamp: new Date().toISOString(),
  });
}

export function encryptValue(value: string): string {
  // Include version in output: version:iv:authTag:encryptedData
  const version = currentKeyVersion;
  const key = keyVersions.get(version)?.key || encryptionKey;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(value, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return `${version}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decryptValue(cipher: string): string {
  const parts = cipher.split(":");

  if (parts.length === 3) {
    // Legacy format (no version)
    logger.warn("Decrypting legacy cipher without version");
    return decryptWithKey(cipher, encryptionKey);
  }

  if (parts.length === 4) {
    const [versionStr, ...rest] = parts;
    const version = parseInt(versionStr, 10);

    if (!keyVersions.has(version)) {
      throw new Error(`Unknown encryption key version: ${version}`);
    }

    const key = keyVersions.get(version)!.key;
    return decryptWithKey(rest.join(":"), key);
  }

  throw new Error("Invalid cipher format");
}

function decryptWithKey(cipher: string, key: Buffer): string {
  const [ivHex, authTagHex, encryptedData] = cipher.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

// ADD: Metrics for decryption failures
let decryptionFailures = 0;
export function getDecryptionFailureCount() {
  return decryptionFailures;
}

// Update decryptWithKey to track failures
```

---

### **File: `src/utils/auditLogger.ts`** [CRITICAL - Rewrite Required]

**Priority:** CRITICAL  
**Current Status:** ⚠️ INCOMPLETE  
**Required Action:** Complete rewrite with enterprise audit events

```typescript
import { supabase } from "./supabaseClient";
import { logger } from "./logger";
import { hmac } from "crypto";
import crypto from "crypto";

export enum AuditEventType {
  // Authentication events
  USER_LOGIN = "auth.login",
  USER_LOGOUT = "auth.logout",
  USER_SIGNUP = "auth.signup",
  USER_PASSWORD_CHANGED = "auth.password_changed",
  USER_MFA_ENABLED = "auth.mfa_enabled",
  USER_MFA_DISABLED = "auth.mfa_disabled",

  // Agent events
  AGENT_CREATED = "agent.created",
  AGENT_UPDATED = "agent.updated",
  AGENT_DELETED = "agent.deleted",
  AGENT_PUBLISHED = "agent.published",
  AGENT_ARCHIVED = "agent.archived",

  // Execution events
  EXECUTION_STARTED = "execution.started",
  EXECUTION_COMPLETED = "execution.completed",
  EXECUTION_FAILED = "execution.failed",
  EXECUTION_CANCELLED = "execution.cancelled",
  EXECUTION_RETRIED = "execution.retried",

  // API Key events
  API_KEY_CREATED = "apikey.created",
  API_KEY_ROTATED = "apikey.rotated",
  API_KEY_DELETED = "apikey.deleted",
  API_KEY_ACCESSED = "apikey.accessed",
  API_KEY_EXPIRED = "apikey.expired",

  // Security events
  UNAUTHORIZED_ACCESS = "security.unauthorized_access",
  RATE_LIMIT_EXCEEDED = "security.rate_limit_exceeded",
  SUSPICIOUS_ACTIVITY = "security.suspicious_activity",
  DATA_EXPORT_REQUESTED = "security.data_export_requested",

  // Admin events
  SETTINGS_CHANGED = "admin.settings_changed",
  USER_ROLE_CHANGED = "admin.user_role_changed",
  PERMISSION_GRANTED = "admin.permission_granted",
  PERMISSION_REVOKED = "admin.permission_revoked",
}

export interface AuditLogEntry {
  id?: string;
  userId: string;
  event: AuditEventType;
  resourceType?: string;
  resourceId?: string;
  action?: string;
  status: "success" | "failure";
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  signature?: string;
  timestamp: string;
}

const AUDIT_LOG_KEY =
  process.env.AUDIT_LOG_KEY || crypto.randomBytes(32).toString("hex");

export const logAudit = async (
  userId: string,
  event: AuditEventType,
  options: {
    resourceType?: string;
    resourceId?: string;
    action?: string;
    status?: "success" | "failure";
    details?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
  } = {},
): Promise<string | null> => {
  try {
    const timestamp = new Date().toISOString();

    // Create signature for tamper detection
    const signatureData = `${userId}:${event}:${timestamp}`;
    const signature = hmac("sha256", AUDIT_LOG_KEY, signatureData).toString(
      "hex",
    );

    // Filter sensitive data from details
    const sanitizedDetails = sanitizeAuditDetails(options.details);

    const entry: AuditLogEntry = {
      userId,
      event,
      resourceType: options.resourceType,
      resourceId: options.resourceId,
      action: options.action,
      status: options.status || "success",
      details: sanitizedDetails,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      signature,
      timestamp,
    };

    // Try to insert into audit_logs table
    const { data, error } = await supabase
      .from("audit_logs")
      .insert(entry)
      .select("id")
      .single();

    if (error) {
      // CRITICAL: Log to stderr if audit fails
      console.error("CRITICAL: Audit log failed to persist", {
        error: error.message,
        entry: entry,
      });

      // Notify operations team
      await notifyOpsTeam("Audit logging failure", {
        error: error.message,
        event,
        userId,
      });

      return null;
    }

    logger.info(`Audit event logged: ${event}`, {
      auditId: data?.id,
      userId,
      resourceId: options.resourceId,
    });

    return data?.id || null;
  } catch (error) {
    // Double fallback: log to stderr
    console.error("FATAL: Audit logging crashed", {
      error: error instanceof Error ? error.message : String(error),
    });

    // Alert ops immediately
    await notifyOpsTeamCritical("Audit system failure", { error });

    return null;
  }
};

// Helper: Remove sensitive data
function sanitizeAuditDetails(details?: Record<string, any>) {
  if (!details) return undefined;

  const sanitized = { ...details };

  // Redact known sensitive fields
  const sensitiveFields = [
    "password",
    "token",
    "secret",
    "key",
    "apiKey",
    "creditCard",
    "ssn",
    "privateKey",
    "apiSecret",
  ];

  sensitiveFields.forEach((field) => {
    if (field in sanitized) {
      sanitized[field] = "[REDACTED]";
    }
  });

  // Recursively sanitize nested objects
  Object.keys(sanitized).forEach((key) => {
    if (typeof sanitized[key] === "object" && sanitized[key] !== null) {
      sanitized[key] = sanitizeAuditDetails(sanitized[key]);
    }
  });

  return sanitized;
}

// Helper: Notify operations team
async function notifyOpsTeam(title: string, details: any) {
  try {
    // Send to monitoring system (Slack, PagerDuty, etc)
    if (process.env.OPS_WEBHOOK_URL) {
      await fetch(process.env.OPS_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          severity: "warning",
          details,
          timestamp: new Date().toISOString(),
        }),
      });
    }
  } catch (err) {
    console.error("Failed to notify ops team", err);
  }
}

async function notifyOpsTeamCritical(title: string, details: any) {
  try {
    if (process.env.OPS_CRITICAL_WEBHOOK_URL) {
      await fetch(process.env.OPS_CRITICAL_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          severity: "critical",
          details,
          timestamp: new Date().toISOString(),
        }),
      });
    }
  } catch (err) {
    console.error("Failed to notify ops team of critical event", err);
  }
}

// Helper: Verify audit log integrity
export const verifyAuditLog = (entry: AuditLogEntry): boolean => {
  try {
    if (!entry.signature) return false;

    const signatureData = `${entry.userId}:${entry.event}:${entry.timestamp}`;
    const expectedSignature = hmac(
      "sha256",
      AUDIT_LOG_KEY,
      signatureData,
    ).toString("hex");

    return crypto.timingSafeEqual(
      Buffer.from(entry.signature),
      Buffer.from(expectedSignature),
    );
  } catch {
    return false;
  }
};

// Export audit logs (GDPR)
export const exportAuditLogs = async (userId: string) => {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("userId", userId)
    .order("timestamp", { ascending: false });

  if (error) throw error;

  // Log the export itself
  await logAudit(userId, AuditEventType.DATA_EXPORT_REQUESTED, {
    action: "Full audit log export",
    status: "success",
  });

  return data;
};
```

---

### **File: `src/utils/rateLimitMiddleware.ts`** [REWRITE REQUIRED]

**Priority:** CRITICAL  
**Current Status:** 🔴 INCOMPLETE  
**Required Action:** Add global and endpoint-specific limits

```typescript
import { Request, Response, NextFunction } from "express";
import { supabase } from "./supabaseClient";
import { checkRateLimit, incrementUsage } from "./rateLimiting";
import { logger } from "./logger";
import Redis from "ioredis";

// Initialize Redis for rate limiting
const redis = new Redis(process.env.REDIS_URL);

// Rate limit configurations
const RATE_LIMITS = {
  global: { windowMs: 60000, maxRequests: 10000 }, // Global: 10k/min
  perUser: { windowMs: 60000, maxRequests: 1000 }, // Per user: 1k/min
  perIp: { windowMs: 60000, maxRequests: 5000 }, // Per IP: 5k/min
  api: { windowMs: 60000, maxRequests: 100 }, // API calls: 100/min
  agentExecution: { windowMs: 60000, maxRequests: 50 }, // Executions: 50/min
  auth: { windowMs: 15 * 60000, maxRequests: 5 }, // Login: 5 attempts/15min
};

export async function globalRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const ip = req.ip || req.connection.remoteAddress || "unknown";
    const key = `rate_limit:global:${ip}`;

    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, Math.ceil(RATE_LIMITS.global.windowMs / 1000));
    }

    // Send rate limit headers
    res.set({
      "X-RateLimit-Limit": String(RATE_LIMITS.global.maxRequests),
      "X-RateLimit-Remaining": String(
        Math.max(0, RATE_LIMITS.global.maxRequests - count),
      ),
    });

    if (count > RATE_LIMITS.global.maxRequests) {
      logger.warn("Global rate limit exceeded", { ip, count });
      return res.status(429).json({
        error: "Too many requests (global)",
        retryAfter: RATE_LIMITS.global.windowMs / 1000,
      });
    }

    next();
  } catch (error) {
    // On error, log but DO NOT bypass
    logger.error("Rate limit check error", { error });
    // Fail secure: deny request
    return res.status(503).json({ error: "Rate limit service unavailable" });
  }
}

export async function userRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.substring(7);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    // Check per-user rate limit
    const key = `rate_limit:user:${user.id}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, Math.ceil(RATE_LIMITS.perUser.windowMs / 1000));
    }

    // Set rate limit response headers
    const remaining = Math.max(0, RATE_LIMITS.perUser.maxRequests - count);
    res.set({
      "X-RateLimit-Limit": String(RATE_LIMITS.perUser.maxRequests),
      "X-RateLimit-Remaining": String(remaining),
      "X-RateLimit-Reset": String(
        Math.floor(Date.now() / 1000) +
          Math.ceil(RATE_LIMITS.perUser.windowMs / 1000),
      ),
    });

    if (count > RATE_LIMITS.perUser.maxRequests) {
      logger.warn("Per-user rate limit exceeded", { userId: user.id, count });

      // Log security event
      await logAudit(user.id, AuditEventType.RATE_LIMIT_EXCEEDED, {
        resourceType: "api",
        status: "failure",
        details: { endpoint: req.path, method: req.method },
      });

      return res.status(429).json({
        error: "Rate limit exceeded",
        retryAfter: RATE_LIMITS.perUser.windowMs / 1000,
        remaining,
      });
    }

    (req as any).user = user;
    next();
  } catch (error) {
    logger.error("User rate limit check error", { error });
    return res.status(503).json({ error: "Rate limit service unavailable" });
  }
}

export async function endpointRateLimitMiddleware(endpoint: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return next(); // Skip if not authenticated

      const limit = RATE_LIMITS[endpoint as keyof typeof RATE_LIMITS] || {
        windowMs: 60000,
        maxRequests: 100,
      };

      const key = `rate_limit:endpoint:${endpoint}:${userId}`;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, Math.ceil(limit.windowMs / 1000));
      }

      res.set(
        "X-RateLimit-Remaining",
        String(Math.max(0, limit.maxRequests - count)),
      );

      if (count > limit.maxRequests) {
        logger.warn(`Rate limit exceeded for ${endpoint}`, { userId, count });
        return res
          .status(429)
          .json({ error: `Rate limit exceeded for ${endpoint}` });
      }

      next();
    } catch (error) {
      logger.error(`Endpoint rate limit error for ${endpoint}`, { error });
      next(); // Allow on error (fail open for availability)
    }
  };
}

// Apply to routes
// app.post('/api/agent-run', endpointRateLimitMiddleware('agentExecution'), handler);
// app.post('/api/login', endpointRateLimitMiddleware('auth'), loginHandler);
```

---

### **File: `src/utils/sanitization.ts`** [NEW - Must Create]

**Priority:** CRITICAL  
**Current Status:** 🔴 MISSING  
**Required Action:** Create output sanitization utility

```typescript
import sanitizeHtml from "sanitize-html";
import xss from "xss";

/**
 * Sanitize output from agent execution to prevent XSS
 */
export function sanitizeOutput(data: any, depth = 0): any {
  if (depth > 10) {
    throw new Error("Sanitization depth exceeded (circular reference)");
  }

  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === "string") {
    // Remove potential XSS vectors
    return xss(data, {
      whiteList: {}, // No HTML tags allowed
      stripIgnoredTag: true,
    });
  }

  if (typeof data === "object") {
    if (Array.isArray(data)) {
      return data.map((item) => sanitizeOutput(item, depth + 1));
    }

    if (data instanceof Date) {
      return data.toISOString();
    }

    // Object - recursively sanitize
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      // Skip suspicious keys
      if (SUSPICIOUS_KEYS.includes(key.toLowerCase())) {
        continue;
      }

      sanitized[key] = sanitizeOutput(value, depth + 1);
    }
    return sanitized;
  }

  // Return primitives as-is
  return data;
}

const SUSPICIOUS_KEYS = [
  "password",
  "token",
  "secret",
  "key",
  "apikey",
  "privatekey",
  "apisecret",
  "credential",
  "auth",
  "session",
  "cookie",
  "jwt",
  "__proto__",
  "constructor",
];

/**
 * Sanitize HTML content for email templates
 */
export function sanitizeEmailTemplate(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "p",
      "br",
      "strong",
      "em",
      "u",
      "i",
      "b",
      "ul",
      "ol",
      "li",
      "a",
      "table",
      "tr",
      "td",
      "th",
    ],
    allowedAttributes: {
      a: ["href", "title"],
      img: ["src", "alt"],
    },
    disallowedTagsMode: "discard",
  });
}

/**
 * Escape SQL-like strings (defense in depth)
 */
export function escapeSqlString(str: string): string {
  return str.replace(/'/g, "''").replace(/;/g, "");
}

/**
 * Escape JSON for safe embedding
 */
export function escapeJson(obj: any): string {
  return JSON.stringify(obj)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/\//g, "\\/")
    .replace(/\b/g, "\\b")
    .replace(/\f/g, "\\f");
}
```

---

### **File: `src/config.ts`** [Needs Enhancement]

**Priority:** HIGH  
**Current Status:** ⚠️ PARTIAL  
**Required Action:** Add validation and structured config

```typescript
import dotenv from "dotenv";
import os from "os";
import { z } from "zod";

const envPath = process.env.NODE_ENV === "production" ? ".env" : ".env.local";
dotenv.config({ path: envPath });

// Define configuration schema
const ConfigSchema = z.object({
  NODE_ENV: z
    .enum(["development", "staging", "production"])
    .default("development"),
  SERVICE_ROLE: z.enum(["api", "worker", "all"]).default("all"),
  INSTANCE_ID: z.string().default(() => process.env.HOSTNAME || os.hostname()),
  REDIS_URL: z.string().url().optional(),
  REDIS_CLUSTER_NODES: z.string().optional(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_TLS: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .default("false"),
  USE_BULL_QUEUE: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .default("false"),
  BULL_QUEUE_NAME: z.string().default("agent-execution-queue"),
  WORKER_CONCURRENCY: z.coerce.number().min(1).max(64).default(4),
  FRONTEND_URL: z.string().url(),
  PORT: z.coerce.number().min(1024).max(65535).default(3001),
  OTLP_ENDPOINT: z.string().url().optional(),
  SERVICE_NAME: z.string().default("denbegaye-agent-workers"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // Database
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Encryption
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i),

  // Email (optional)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
});

type Config = z.infer<typeof ConfigSchema>;

// Validate configuration
let config: Config;

try {
  config = ConfigSchema.parse(process.env);

  // Additional validations
  if (config.SERVICE_ROLE === "worker" || config.SERVICE_ROLE === "all") {
    if (!config.REDIS_URL) {
      throw new Error(
        'REDIS_URL is required when SERVICE_ROLE is "worker" or "all"',
      );
    }
  }

  // Validate FRONTEND_URL is not localhost in production
  if (config.NODE_ENV === "production") {
    const url = new URL(config.FRONTEND_URL);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      throw new Error("FRONTEND_URL cannot be localhost in production");
    }

    if (!url.protocol.startsWith("https")) {
      throw new Error("FRONTEND_URL must use HTTPS in production");
    }
  }

  console.log("✅ Configuration validated successfully");
} catch (error) {
  console.error("❌ Configuration validation failed:");
  if (error instanceof z.ZodError) {
    error.errors.forEach((e) => {
      console.error(`  ${e.path.join(".")}: ${e.message}`);
    });
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exit(1);
}

// Export typed configuration
export const NODE_ENV = config.NODE_ENV;
export const SERVICE_ROLE = config.SERVICE_ROLE;
export const INSTANCE_ID = config.INSTANCE_ID;
export const REDIS_URL = config.REDIS_URL;
export const FRONTEND_URL = config.FRONTEND_URL;
export const PORT = config.PORT;
export const OTLP_ENDPOINT = config.OTLP_ENDPOINT;
export const SERVICE_NAME = config.SERVICE_NAME;
export const LOG_LEVEL = config.LOG_LEVEL;

// Derived configurations
export const IS_PRODUCTION = NODE_ENV === "production";
export const IS_API_ONLY = SERVICE_ROLE === "api";
export const IS_WORKER_ONLY = SERVICE_ROLE === "worker";
export const IS_ALL = SERVICE_ROLE === "all";
export const ENABLE_QUEUE_PROCESSING = IS_WORKER_ONLY || IS_ALL;

// Export full config for access to all values
export const CONFIG = config;
```

---

## 🗄️ DATABASE MIGRATION SCRIPTS

### **File: `src/migrations/001_create_core_tables.sql`** [NEW - CRITICAL]

**Priority:** CRITICAL  
**Status:** 🔴 MISSING

```sql
-- Migration: 001_create_core_tables.sql
-- Created: 2026-05-25
-- Description: Create core tables for user agents and executions

BEGIN;

-- User agents table
CREATE TABLE IF NOT EXISTS user_agents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  config jsonb NOT NULL,  -- Contains nodes and edges
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived', 'error')),
  version text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  modified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_user_agents_user_id ON user_agents(user_id);
CREATE INDEX idx_user_agents_status ON user_agents(user_id, status);
CREATE INDEX idx_user_agents_created_at ON user_agents(created_at DESC);

-- RLS for user agents
ALTER TABLE user_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own agents" ON user_agents;
CREATE POLICY "Users can manage own agents" ON user_agents
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Agent executions table
CREATE TABLE IF NOT EXISTS agent_executions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id uuid REFERENCES user_agents(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  execution_id text UNIQUE NOT NULL,
  workflow_id text,  -- For LangGraph workflows
  status text NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'running', 'completed', 'failed', 'cancelled', 'timeout')
  ),

  -- Input and output
  input jsonb,
  output jsonb,
  error_message text,

  -- Timing
  start_time timestamptz,
  end_time timestamptz,
  duration_ms integer,

  -- Execution metadata
  is_temporary boolean DEFAULT false,
  attempt_number integer DEFAULT 1,
  max_attempts integer DEFAULT 3,

  -- Node tracking
  node_statuses jsonb DEFAULT '{}'::jsonb,  -- { nodeId: status }
  node_attempt_counts jsonb DEFAULT '{}'::jsonb,  -- { nodeId: attempts }

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_agent_executions_user_id ON agent_executions(user_id);
CREATE INDEX idx_agent_executions_agent_id ON agent_executions(agent_id);
CREATE INDEX idx_agent_executions_status ON agent_executions(status, created_at DESC);
CREATE INDEX idx_agent_executions_user_status ON agent_executions(user_id, status);
CREATE INDEX idx_agent_executions_created_at ON agent_executions(created_at DESC);
CREATE INDEX idx_agent_executions_execution_id ON agent_executions(execution_id);

-- RLS for agent executions
ALTER TABLE agent_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own executions" ON agent_executions;
CREATE POLICY "Users can view own executions" ON agent_executions
  USING (user_id = auth.uid());

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event text NOT NULL,
  resource_type text,
  resource_id text,
  action text,
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failure')),
  details jsonb,
  ip_address inet,
  user_agent text,
  signature text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_event ON audit_logs(event);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- RLS for audit logs (users can only view their own)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own audit logs" ON audit_logs;
CREATE POLICY "Users can view own audit logs" ON audit_logs
  USING (user_id = auth.uid());

COMMIT;
```

---

### **File: `src/migrations/002_create_rate_limit_tables.sql`** [NEW]

```sql
-- Migration: 002_create_rate_limit_tables.sql
-- Description: Create tables for rate limiting and usage tracking

BEGIN;

-- Usage tracking for rate limiting
CREATE TABLE IF NOT EXISTS usage_tracking (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metric_type text NOT NULL,  -- 'api_calls', 'executions', 'tokens', etc.
  count integer DEFAULT 1,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_usage_tracking_user_metric ON usage_tracking(user_id, metric_type, window_start);

COMMIT;
```

---

## 🧪 TESTING RECOMMENDATIONS

### **Create: `src/routes/agentRun.test.ts`** [NEW]

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import app from "../server";
import { supabase } from "../utils/supabaseClient";

describe("POST /api/agent-run", () => {
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    // Create test user
    const { data } = await supabase.auth.admin.createUser({
      email: `test-${Date.now()}@example.com`,
      password: "TestPassword123!",
      email_confirm: true,
    });
    userId = data.user?.id!;

    // Get session
    const { data: signInData } = await supabase.auth.signInWithPassword({
      email: `test-${Date.now()}@example.com`,
      password: "TestPassword123!",
    });
    authToken = signInData.session?.access_token!;
  });

  afterAll(async () => {
    // Clean up test user
    await supabase.auth.admin.deleteUser(userId);
  });

  describe("Input validation", () => {
    it("should reject missing nodes", async () => {
      const res = await request(app)
        .post("/api/agent-run")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          edges: [],
          input: {},
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid request");
    });

    it("should reject empty nodes array", async () => {
      const res = await request(app)
        .post("/api/agent-run")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          nodes: [],
          edges: [],
        });

      expect(res.status).toBe(400);
    });

    it("should reject missing required config", async () => {
      const res = await request(app)
        .post("/api/agent-run")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          nodes: [
            {
              id: "node1",
              type: "ai-openai",
              config: {
                // Missing apiKey and model
              },
            },
          ],
          edges: [],
        });

      expect(res.status).toBe(400);
    });

    it("should reject oversized payload", async () => {
      const largePayload = "x".repeat(100 * 1024 * 1024); // 100MB

      const res = await request(app)
        .post("/api/agent-run")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          nodes: [{ id: "n1", type: "api", config: { data: largePayload } }],
        });

      expect(res.status).toBe(413); // Payload Too Large
    });
  });

  describe("Workflow validation", () => {
    it("should reject workflows with cycles", async () => {
      const res = await request(app)
        .post("/api/agent-run")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          nodes: [
            {
              id: "n1",
              type: "ai-openai",
              config: { apiKey: "key", model: "gpt-4" },
            },
            {
              id: "n2",
              type: "ai-openai",
              config: { apiKey: "key", model: "gpt-4" },
            },
          ],
          edges: [
            { source: "n1", target: "n2" },
            { source: "n2", target: "n1" }, // Creates cycle
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("cycle");
    });

    it("should reject invalid edge references", async () => {
      const res = await request(app)
        .post("/api/agent-run")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          nodes: [
            {
              id: "n1",
              type: "ai-openai",
              config: { apiKey: "key", model: "gpt-4" },
            },
          ],
          edges: [
            { source: "n1", target: "n999" }, // n999 doesn't exist
          ],
        });

      expect(res.status).toBe(400);
    });
  });

  describe("Rate limiting", () => {
    it("should enforce per-user rate limit", async () => {
      const requests = [];
      for (let i = 0; i < 101; i++) {
        requests.push(
          request(app)
            .post("/api/agent-run")
            .set("Authorization", `Bearer ${authToken}`)
            .send({
              nodes: [
                {
                  id: "n1",
                  type: "ai-openai",
                  config: { apiKey: "key", model: "gpt-4" },
                },
              ],
            }),
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter((r) => r.status === 429);

      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });
});
```

---

## 📋 DEPLOYMENT CHECKLIST ITEMS

**Must Complete Before Production:**

- [ ] Add comprehensive Zod validation to all routes
- [ ] Implement audit logging for all events
- [ ] Create missing database migrations
- [ ] Add output sanitization
- [ ] Fix rate limiter bypass vulnerability
- [ ] Add health check endpoints
- [ ] Implement graceful shutdown
- [ ] Create Dockerfile and docker-compose
- [ ] Create Kubernetes manifests
- [ ] Add 60%+ test coverage
- [ ] Run security audit (SAST)
- [ ] Load test for 1000+ req/s
- [ ] Test disaster recovery
- [ ] Complete documentation
- [ ] Third-party security review

---

**Total Estimated Effort: 120-160 hours**  
**Timeline: 6-8 weeks with 2-3 engineers**
