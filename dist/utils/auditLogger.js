"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logWorkflowAudit = void 0;
const supabaseClient_1 = require("./supabaseClient");
const logger_1 = require("./logger");
const logWorkflowAudit = async (executionId, event, details = {}) => {
    try {
        await supabaseClient_1.supabase.from("workflow_audit_logs").insert({
            execution_id: executionId,
            event,
            details,
            created_at: new Date().toISOString(),
        });
    }
    catch (error) {
        logger_1.logger.error("Failed to persist workflow audit log.", {
            executionId,
            event,
            error: error?.message || error,
        });
    }
};
exports.logWorkflowAudit = logWorkflowAudit;
