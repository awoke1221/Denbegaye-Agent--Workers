"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
// Base node types and registry
__exportStar(require("./types"), exports);
const types_1 = require("./types");
// AI Nodes
__exportStar(require("./ai"), exports);
// Trigger Nodes
__exportStar(require("./triggers"), exports);
// Core Nodes
__exportStar(require("./core"), exports);
// Social Media Nodes
__exportStar(require("./social"), exports);
// Calendar Nodes
__exportStar(require("./calendars"), exports);
// Data & Storage Nodes
__exportStar(require("./data"), exports);
// Import all nodes to register them
require("./ai");
require("./triggers");
require("./core");
require("./social");
require("./calendars");
require("./data");
// Ensure all nodes are registered
const gemini_1 = require("./ai/gemini");
const deepseek_1 = require("./ai/deepseek");
const openai_1 = require("./ai/openai");
const webhook_1 = require("./triggers/webhook");
const email_1 = require("./triggers/email");
const http_request_1 = require("./core/http-request");
const telegram_1 = require("./social/telegram");
const whatsapp_1 = require("./social/whatsapp");
const linkedin_1 = require("./social/linkedin");
const youtube_1 = require("./social/youtube");
const facebook_1 = require("./social/facebook");
const google_calendar_1 = require("./calendars/google-calendar");
const google_sheets_1 = require("./data/google-sheets");
const google_docs_1 = require("./data/google-docs");
const gmail_1 = require("./data/gmail");
const gmail_2 = require("./triggers/gmail");
// Register all nodes explicitly
types_1.nodeRegistry.register(gemini_1.geminiNode);
types_1.nodeRegistry.register(deepseek_1.deepseekNode);
types_1.nodeRegistry.register(openai_1.openaiNode);
types_1.nodeRegistry.register(webhook_1.webhookNode);
types_1.nodeRegistry.register(email_1.emailNode);
types_1.nodeRegistry.register(http_request_1.httpRequestNode);
types_1.nodeRegistry.register(telegram_1.telegramNode);
types_1.nodeRegistry.register(whatsapp_1.whatsappNode);
types_1.nodeRegistry.register(linkedin_1.linkedinNode);
types_1.nodeRegistry.register(youtube_1.youtubeNode);
types_1.nodeRegistry.register(facebook_1.facebookNode);
types_1.nodeRegistry.register(google_calendar_1.googleCalendarNode);
types_1.nodeRegistry.register(google_sheets_1.googleSheetsNode);
types_1.nodeRegistry.register(google_docs_1.googleDocsNode);
types_1.nodeRegistry.register(gmail_1.gmailNode);
types_1.nodeRegistry.register(gmail_2.gmailTriggerNode);
// Test nodes for compatibility
const zod_1 = require("zod");
const memoryNode = {
    id: "memory",
    type: "memory",
    name: "Memory",
    description: "Store and retrieve data",
    category: "core",
    icon: "💾",
    color: "#9C27B0",
    configSchema: zod_1.z.object({
        data: zod_1.z.any(),
    }),
    inputs: [],
    outputs: [
        {
            id: "output",
            label: "Output",
            type: "any",
        },
    ],
    validation: {
        input: zod_1.z.object({}),
        output: zod_1.z.any(),
    },
    handler: async (context) => {
        const startTime = Date.now();
        const logs = [];
        logs.push("Memory node executed");
        // Add small delay for testing
        await new Promise((resolve) => setTimeout(resolve, 1));
        return {
            success: true,
            output: context.config.data,
            logs,
            executionTime: Date.now() - startTime,
        };
    },
};
const apiNode = {
    id: "api",
    type: "api",
    name: "API Call",
    description: "Make HTTP API calls",
    category: "core",
    icon: "🌐",
    color: "#2196F3",
    configSchema: zod_1.z.object({
        endpoint: zod_1.z.string(),
        params: zod_1.z.record(zod_1.z.any()).optional(),
    }),
    inputs: [],
    outputs: [
        {
            id: "response",
            label: "Response",
            type: "any",
        },
    ],
    validation: {
        input: zod_1.z.object({}),
        output: zod_1.z.any(),
    },
    handler: async (context) => {
        const startTime = Date.now();
        const logs = [];
        // Mock API call for testing
        logs.push(`API call to ${context.config.endpoint}`);
        // Add small delay for testing
        await new Promise((resolve) => setTimeout(resolve, 1));
        return {
            success: true,
            output: {
                endpoint: context.config.endpoint,
                result: 4, // Mock result
            },
            logs,
            executionTime: Date.now() - startTime,
        };
    },
};
const coreSetNode = {
    id: "core-set",
    type: "core-set",
    name: "Set Value",
    description: "Set a value using expression",
    category: "core",
    icon: "🔧",
    color: "#4CAF50",
    configSchema: zod_1.z.object({
        expression: zod_1.z.string(),
    }),
    inputs: [
        {
            id: "input",
            label: "Input",
            type: "any",
        },
    ],
    outputs: [
        {
            id: "output",
            label: "Output",
            type: "any",
        },
    ],
    validation: {
        input: zod_1.z.any(),
        output: zod_1.z.any(),
    },
    handler: async (context) => {
        const startTime = Date.now();
        const logs = [];
        // Simple expression evaluation for testing
        const input = context.input;
        let result;
        if (context.config.expression === "input.value * 2") {
            result = input.value * 2;
        }
        else {
            result = input;
        }
        logs.push(`Set value: ${result}`);
        // Add small delay for testing
        await new Promise((resolve) => setTimeout(resolve, 1));
        return {
            success: true,
            output: result,
            logs,
            executionTime: Date.now() - startTime,
        };
    },
};
types_1.nodeRegistry.register(memoryNode);
types_1.nodeRegistry.register(apiNode);
types_1.nodeRegistry.register(coreSetNode);
