import { initializeQueue } from "./index";
import { logger } from "./utils/logger";

initializeQueue().catch((error) => {
  logger.error("Worker initialization failed.", {
    error: error instanceof Error ? error.message : String(error),
  });
});

logger.info("Worker running...");
