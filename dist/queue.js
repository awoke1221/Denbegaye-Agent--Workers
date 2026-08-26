"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeQueue = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const logger_1 = require("./utils/logger");
const agentQueue_1 = require("./utils/agentQueue");
const envPath = process.env.NODE_ENV === "production" ? ".env" : ".env.local";
dotenv_1.default.config({ path: envPath });
const initializeQueue = async () => {
    await agentQueue_1.agentQueue.start();
    logger_1.logger.info("Agent execution queue initialized.");
};
exports.initializeQueue = initializeQueue;
