export const logger = {
  info: (message: string, meta?: any) => {
    console.info(`[INFO] ${new Date().toISOString()} - ${message}`, meta || "");
  },
  error: (message: string, meta?: any) => {
    console.error(
      `[ERROR] ${new Date().toISOString()} - ${message}`,
      meta || "",
    );
  },
  debug: (message: string, meta?: any) => {
    console.debug(
      `[DEBUG] ${new Date().toISOString()} - ${message}`,
      meta || "",
    );
  },
};
