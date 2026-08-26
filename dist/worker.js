"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const queue_1 = require("./queue");
const logger_1 = require("./utils/logger");
const config_1 = require("./config");
(0, queue_1.initializeQueue)().catch((error) => {
    logger_1.logger.error("Worker initialization failed.", {
        error: error instanceof Error ? error.message : String(error),
        serviceRole: config_1.SERVICE_ROLE,
        instanceId: config_1.INSTANCE_ID,
    });
});
logger_1.logger.info("Worker running...", {
    serviceRole: config_1.SERVICE_ROLE,
    instanceId: config_1.INSTANCE_ID,
});
