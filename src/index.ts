import dotenv from "dotenv";
import { logger } from "./utils/logger";
import { agentQueue } from "./utils/agentQueue";

dotenv.config({ path: ".env.local" });

export const initializeQueue = async () => {
  await agentQueue.start();
  logger.info("Agent execution queue initialized.");
};
