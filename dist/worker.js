"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
const logger_1 = require("./utils/logger");
(0, index_1.initializeQueue)().catch((error) => {
    logger_1.logger.error("Worker initialization failed.", {
        error: error instanceof Error ? error.message : String(error),
    });
});
logger_1.logger.info("Worker running...");
