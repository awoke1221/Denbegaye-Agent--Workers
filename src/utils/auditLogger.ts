import { supabase } from "./supabaseClient";
import { logger } from "./logger";

export const logWorkflowAudit = async (
  executionId: string,
  event: string,
  details: Record<string, any> = {},
) => {
  try {
    await supabase.from("workflow_audit_logs").insert({
      execution_id: executionId,
      event,
      details,
      created_at: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error("Failed to persist workflow audit log.", {
      executionId,
      event,
      error: error?.message || error,
    });
  }
};
