import { initializeQueue } from "./queue";
import { logger } from "./utils/logger";
import { SERVICE_ROLE, INSTANCE_ID } from "./config";

initializeQueue().catch((error) => {
  logger.error("Worker initialization failed.", {
    error: error instanceof Error ? error.message : String(error),
    serviceRole: SERVICE_ROLE,
    instanceId: INSTANCE_ID,
  });
});

logger.info("Worker running...", {
  serviceRole: SERVICE_ROLE,
  instanceId: INSTANCE_ID,
});
