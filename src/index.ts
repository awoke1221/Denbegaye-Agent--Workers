import dotenv from "dotenv";
import { logger } from "./utils/logger";
import { agentQueue } from "./utils/agentQueue";

const envPath = process.env.NODE_ENV === "production" ? ".env" : ".env.local";
dotenv.config({ path: envPath });

export const initializeQueue = async () => {
  await agentQueue.start();
  logger.info("Agent execution queue initialized.");
};
