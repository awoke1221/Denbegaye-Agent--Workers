"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachRedisEventHandlers = exports.createRedisConnection = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = require("../config");
const logger_1 = require("./logger");
const parseClusterNodes = () => {
    return config_1.REDIS_CLUSTER_NODES.split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
        const [host, port] = entry.split(":");
        return {
            host,
            port: Number(port || 6379),
        };
    });
};
const getBaseOptions = () => {
    const options = {
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
        reconnectOnError: (err) => {
            const message = err?.message?.toString?.() ?? "";
            return !message.includes("READONLY");
        },
        retryStrategy: (times) => Math.min(1000 + times * 200, 3000),
        lazyConnect: false,
        connectionName: config_1.INSTANCE_ID,
    };
    if (config_1.REDIS_PASSWORD) {
        options.password = config_1.REDIS_PASSWORD;
    }
    if (config_1.REDIS_TLS) {
        options.tls = {};
    }
    return options;
};
const createRedisConnection = () => {
    if (config_1.REDIS_CLUSTER_NODES) {
        const nodes = parseClusterNodes();
        if (!nodes.length) {
            throw new Error("REDIS_CLUSTER_NODES is set but no valid nodes could be parsed.");
        }
        return new ioredis_1.default.Cluster(nodes, { redisOptions: getBaseOptions() });
    }
    if (!config_1.REDIS_URL) {
        throw new Error("REDIS_URL is not configured.");
    }
    return new ioredis_1.default(config_1.REDIS_URL, getBaseOptions());
};
exports.createRedisConnection = createRedisConnection;
const attachRedisEventHandlers = (client, name) => {
    client.on("connect", () => {
        logger_1.logger.info(`${name}: Redis connecting...`);
    });
    client.on("ready", () => {
        logger_1.logger.info(`${name}: Redis connection ready`);
    });
    client.on("error", (error) => {
        logger_1.logger.error(`${name}: Redis error`, { error });
    });
    client.on("close", () => {
        logger_1.logger.warn(`${name}: Redis connection closed`);
    });
    client.on("end", () => {
        logger_1.logger.warn(`${name}: Redis connection ended`);
    });
    client.on("reconnecting", (delay) => {
        logger_1.logger.warn(`${name}: Redis reconnecting in ${delay}ms`);
    });
};
exports.attachRedisEventHandlers = attachRedisEventHandlers;
