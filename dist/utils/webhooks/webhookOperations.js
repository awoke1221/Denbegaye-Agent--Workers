"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookOperationError = void 0;
exports.updateWebhook = updateWebhook;
exports.deleteWebhook = deleteWebhook;
exports.logWebhookEvent = logWebhookEvent;
const supabaseClient_1 = require("@/lib/supabaseClient");
class WebhookOperationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'WebhookOperationError';
    }
}
exports.WebhookOperationError = WebhookOperationError;
async function updateWebhook(webhookId, updateData) {
    // Enforce immutable fields when updating
    const mutableFields = [
        'name',
        'description',
        'enabled',
        'method',
        'headers',
        'secret',
        'workflowId',
    ];
    const sanitized = Object.keys(updateData).reduce((acc, key) => {
        if (mutableFields.includes(key)) {
            acc[key] = updateData[key];
        }
        return acc;
    }, {});
    const { error } = await supabaseClient_1.supabase
        .from('webhookTriggers')
        .update({
        ...sanitized,
        updatedAt: new Date().toISOString(),
    })
        .eq('id', webhookId);
    if (error) {
        throw new WebhookOperationError(`Failed to update webhook: ${error.message}`);
    }
}
async function deleteWebhook(webhookId) {
    const { error } = await supabaseClient_1.supabase.from('webhookTriggers').delete().eq('id', webhookId);
    if (error) {
        throw new WebhookOperationError(`Failed to delete webhook: ${error.message}`);
    }
}
async function logWebhookEvent(webhookId, status, eventType, payload, metadata, errorMessage) {
    const { error } = await supabaseClient_1.supabase.from('webhookEvents').insert({
        id: `we_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        webhookId,
        status,
        eventType,
        payload,
        metadata,
        errorMessage,
        createdAt: new Date().toISOString(),
    });
    if (error) {
        console.error('Failed to log webhook event:', error.message);
    }
}
