"use strict";
// Dummy WebhookHandler to fix import errors
// TODO: Implement proper webhook handling
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookHandler = void 0;
class WebhookHandler {
    constructor(app) {
        // Dummy constructor
    }
    handle(req, res) {
        res.json({ message: "Webhook received" });
    }
}
exports.WebhookHandler = WebhookHandler;
