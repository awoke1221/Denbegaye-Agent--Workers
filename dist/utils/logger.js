"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const LEVELS = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};
const configuredLogLevel = (process.env.LOG_LEVEL ?? "info").toLowerCase();
const currentLogLevel = LEVELS[configuredLogLevel] ?? LEVELS.info;
const formatMeta = (meta) => {
    if (meta === undefined || meta === null) {
        return "";
    }
    if (typeof meta === "string") {
        return ` ${meta}`;
    }
    try {
        return ` ${JSON.stringify(meta)}`;
    }
    catch {
        return ` ${String(meta)}`;
    }
};
const shouldLog = (level) => LEVELS[level] >= currentLogLevel;
exports.logger = {
    info: (message, meta) => {
        if (!shouldLog("info"))
            return;
        console.info(`[INFO] ${new Date().toISOString()} - ${message}${formatMeta(meta)}`);
    },
    error: (message, meta) => {
        if (!shouldLog("error"))
            return;
        console.error(`[ERROR] ${new Date().toISOString()} - ${message}${formatMeta(meta)}`);
    },
    debug: (message, meta) => {
        if (!shouldLog("debug"))
            return;
        console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}${formatMeta(meta)}`);
    },
    warn: (message, meta) => {
        if (!shouldLog("warn"))
            return;
        console.warn(`[WARN] ${new Date().toISOString()} - ${message}${formatMeta(meta)}`);
    },
};
