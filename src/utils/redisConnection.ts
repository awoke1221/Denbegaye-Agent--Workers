import Redis, { ClusterNode, RedisOptions } from "ioredis";
import {
  REDIS_URL,
  REDIS_CLUSTER_NODES,
  REDIS_PASSWORD,
  REDIS_TLS,
  INSTANCE_ID,
} from "../config";
import { logger } from "./logger";

const parseClusterNodes = (): ClusterNode[] => {
  return REDIS_CLUSTER_NODES.split(",")
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

const getBaseOptions = (): RedisOptions => {
  const options: RedisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    reconnectOnError: (err: Error) => {
      const message = err?.message?.toString?.() ?? "";
      return !message.includes("READONLY");
    },
    retryStrategy: (times: number) => Math.min(1000 + times * 200, 3000),
    lazyConnect: false,
    connectionName: INSTANCE_ID,
  };

  if (REDIS_PASSWORD) {
    options.password = REDIS_PASSWORD;
  }

  if (REDIS_TLS) {
    options.tls = {};
  }

  return options;
};

export const createRedisConnection = () => {
  if (REDIS_CLUSTER_NODES) {
    const nodes = parseClusterNodes();
    if (!nodes.length) {
      throw new Error(
        "REDIS_CLUSTER_NODES is set but no valid nodes could be parsed.",
      );
    }
    return new Redis.Cluster(nodes, { redisOptions: getBaseOptions() });
  }

  if (!REDIS_URL) {
    throw new Error("REDIS_URL is not configured.");
  }

  return new Redis(REDIS_URL, getBaseOptions());
};

export const attachRedisEventHandlers = (
  client: Redis.Redis | Redis.Cluster,
  name: string,
) => {
  client.on("connect", () => {
    logger.info(`${name}: Redis connecting...`);
  });

  client.on("ready", () => {
    logger.info(`${name}: Redis connection ready`);
  });

  client.on("error", (error) => {
    logger.error(`${name}: Redis error`, { error });
  });

  client.on("close", () => {
    logger.warn(`${name}: Redis connection closed`);
  });

  client.on("end", () => {
    logger.warn(`${name}: Redis connection ended`);
  });

  client.on("reconnecting", (delay: number) => {
    logger.warn(`${name}: Redis reconnecting in ${delay}ms`);
  });
};
