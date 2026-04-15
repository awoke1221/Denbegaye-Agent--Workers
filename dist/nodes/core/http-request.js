"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.httpRequestNode = void 0;
const zod_1 = require("zod");
const axios_1 = __importDefault(require("axios"));
// HTTP Request Node
const httpRequestConfigSchema = zod_1.z.object({
    method: zod_1.z
        .enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])
        .default("GET"),
    url: zod_1.z.string().url(),
    headers: zod_1.z.record(zod_1.z.string()).default({}),
    timeout: zod_1.z.number().min(1000).max(300000).default(30000), // 30 seconds
    retries: zod_1.z.number().min(0).max(10).default(0),
    retryDelay: zod_1.z.number().min(100).max(10000).default(1000), // 1 second
    followRedirects: zod_1.z.boolean().default(true),
    validateStatus: zod_1.z.function().optional(), // Custom status validation
});
const httpRequestNode = {
    id: "http-request",
    type: "core-http-request",
    name: "HTTP Request",
    description: "Make HTTP requests to external APIs and services",
    category: "core",
    icon: "🌐",
    color: "#00ACC1",
    configSchema: httpRequestConfigSchema,
    inputs: [
        {
            id: "url",
            label: "URL",
            type: "string",
            required: false,
            description: "The request URL (overrides config if provided)",
        },
        {
            id: "method",
            label: "Method",
            type: "string",
            required: false,
            description: "HTTP method (overrides config if provided)",
        },
        {
            id: "headers",
            label: "Headers",
            type: "object",
            required: false,
            description: "Request headers (merged with config headers)",
        },
        {
            id: "body",
            label: "Request Body",
            type: "any",
            required: false,
            description: "Request body data",
        },
        {
            id: "query",
            label: "Query Parameters",
            type: "object",
            required: false,
            description: "URL query parameters",
        },
    ],
    outputs: [
        {
            id: "response",
            label: "Response",
            type: "object",
            description: "The HTTP response object",
        },
        {
            id: "data",
            label: "Response Data",
            type: "any",
            description: "The response body data",
        },
        {
            id: "status",
            label: "Status Code",
            type: "number",
            description: "HTTP status code",
        },
        {
            id: "headers",
            label: "Response Headers",
            type: "object",
            description: "Response headers",
        },
    ],
    validation: {
        input: zod_1.z.object({
            url: zod_1.z.string().url().optional(),
            method: zod_1.z
                .enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])
                .optional(),
            headers: zod_1.z.record(zod_1.z.string()).optional(),
            body: zod_1.z.any().optional(),
            query: zod_1.z.record(zod_1.z.any()).optional(),
        }),
        output: zod_1.z.object({
            response: zod_1.z.object({
                status: zod_1.z.number(),
                statusText: zod_1.z.string(),
                headers: zod_1.z.record(zod_1.z.string()),
                data: zod_1.z.any(),
                config: zod_1.z.any(),
            }),
            data: zod_1.z.any(),
            status: zod_1.z.number(),
            headers: zod_1.z.record(zod_1.z.string()),
        }),
    },
    handler: async (context) => {
        const startTime = Date.now();
        const logs = [];
        try {
            const config = httpRequestConfigSchema.parse(context.config);
            const input = context.validation.input.parse(context.input);
            // Merge input with config
            const method = input.method || config.method;
            const url = input.url || config.url;
            const headers = { ...config.headers, ...input.headers };
            logs.push(`Making ${method} request to ${url}`);
            const axiosConfig = {
                method,
                url,
                headers,
                timeout: config.timeout,
                maxRedirects: config.followRedirects ? 5 : 0,
                validateStatus: (status) => status < 400,
            };
            // Add body for non-GET requests
            if (method !== "GET" && method !== "HEAD" && input.body !== undefined) {
                axiosConfig.data = input.body;
            }
            // Add query parameters
            if (input.query) {
                axiosConfig.params = input.query;
            }
            let response;
            let lastError = null;
            // Retry logic
            for (let attempt = 0; attempt <= config.retries; attempt++) {
                try {
                    if (attempt > 0) {
                        logs.push(`Retry attempt ${attempt}/${config.retries}`);
                        await new Promise((resolve) => setTimeout(resolve, config.retryDelay));
                    }
                    response = await (0, axios_1.default)(axiosConfig);
                    break;
                }
                catch (error) {
                    lastError = error;
                    logs.push(`Request attempt ${attempt + 1} failed: ${lastError.message}`);
                    if (attempt === config.retries) {
                        throw lastError;
                    }
                }
            }
            logs.push(`Request completed with status ${response.status}`);
            return {
                success: true,
                output: {
                    response: {
                        status: response.status,
                        statusText: response.statusText,
                        headers: response.headers,
                        data: response.data,
                        config: response.config,
                    },
                    data: response.data,
                    status: response.status,
                    headers: response.headers,
                },
                logs,
                executionTime: Date.now() - startTime,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logs.push(`HTTP request failed: ${errorMessage}`);
            return {
                success: false,
                error: errorMessage,
                logs,
                executionTime: Date.now() - startTime,
            };
        }
    },
};
exports.httpRequestNode = httpRequestNode;
