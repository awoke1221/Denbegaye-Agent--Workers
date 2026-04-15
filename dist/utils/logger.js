"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.logger = {
    info: (message, meta) => {
        console.info(`[INFO] ${new Date().toISOString()} - ${message}`, meta || "");
    },
    error: (message, meta) => {
        console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, meta || "");
    },
    debug: (message, meta) => {
        console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`, meta || "");
    },
};
