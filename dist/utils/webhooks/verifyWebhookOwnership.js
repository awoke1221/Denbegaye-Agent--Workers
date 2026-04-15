"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookNotFoundError = void 0;
exports.verifyWebhookOwnership = verifyWebhookOwnership;
const supabaseClient_1 = require("@/lib/supabaseClient");
class WebhookNotFoundError extends Error {
    constructor(message = 'Webhook not found') {
        super(message);
        this.name = 'WebhookNotFoundError';
    }
}
exports.WebhookNotFoundError = WebhookNotFoundError;
async function verifyWebhookOwnership(webhookId, userId) {
    const { data: existingWebhook, error: fetchError } = await supabaseClient_1.supabase
        .from('webhookTriggers')
        .select('*')
        .eq('id', webhookId)
        .eq('userId', userId)
        .single();
    if (fetchError || !existingWebhook) {
        throw new WebhookNotFoundError();
    }
    return existingWebhook;
}
