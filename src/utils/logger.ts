const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
} as const;

type LogLevel = keyof typeof LEVELS;

const configuredLogLevel = (
  process.env.LOG_LEVEL ?? "info"
).toLowerCase() as LogLevel;
const currentLogLevel = LEVELS[configuredLogLevel] ?? LEVELS.info;

const formatMeta = (meta?: any) => {
  if (meta === undefined || meta === null) {
    return "";
  }
  if (typeof meta === "string") {
    return ` ${meta}`;
  }
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return ` ${String(meta)}`;
  }
};

const shouldLog = (level: LogLevel) => LEVELS[level] >= currentLogLevel;

export const logger = {
  info: (message: string, meta?: any) => {
    if (!shouldLog("info")) return;
    console.info(
      `[INFO] ${new Date().toISOString()} - ${message}${formatMeta(meta)}`,
    );
  },
  error: (message: string, meta?: any) => {
    if (!shouldLog("error")) return;
    console.error(
      `[ERROR] ${new Date().toISOString()} - ${message}${formatMeta(meta)}`,
    );
  },
  debug: (message: string, meta?: any) => {
    if (!shouldLog("debug")) return;
    console.debug(
      `[DEBUG] ${new Date().toISOString()} - ${message}${formatMeta(meta)}`,
    );
  },
  warn: (message: string, meta?: any) => {
    if (!shouldLog("warn")) return;
    console.warn(
      `[WARN] ${new Date().toISOString()} - ${message}${formatMeta(meta)}`,
    );
  },
};
