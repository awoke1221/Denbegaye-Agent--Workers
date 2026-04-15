import { z } from "zod";
import {
  NodeDefinition,
  NodeExecutionContext,
  NodeExecutionResult,
  nodeRegistry,
} from "../index";
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

// HTTP Request Node
const httpRequestConfigSchema = z.object({
  method: z
    .enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])
    .default("GET"),
  url: z.string().url(),
  headers: z.record(z.string()).default({}),
  timeout: z.number().min(1000).max(300000).default(30000), // 30 seconds
  retries: z.number().min(0).max(10).default(0),
  retryDelay: z.number().min(100).max(10000).default(1000), // 1 second
  followRedirects: z.boolean().default(true),
  validateStatus: z.function().optional(), // Custom status validation
});

const httpRequestNode: NodeDefinition = {
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
    input: z.object({
      url: z.string().url().optional(),
      method: z
        .enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])
        .optional(),
      headers: z.record(z.string()).optional(),
      body: z.any().optional(),
      query: z.record(z.any()).optional(),
    }),
    output: z.object({
      response: z.object({
        status: z.number(),
        statusText: z.string(),
        headers: z.record(z.string()),
        data: z.any(),
        config: z.any(),
      }),
      data: z.any(),
      status: z.number(),
      headers: z.record(z.string()),
    }),
  },

  handler: async (
    context: NodeExecutionContext,
  ): Promise<NodeExecutionResult> => {
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      const config = httpRequestConfigSchema.parse(context.config);
      const input = context.validation.input.parse(context.input);

      // Merge input with config
      const method = input.method || config.method;
      const url = input.url || config.url;
      const headers = { ...config.headers, ...input.headers };

      logs.push(`Making ${method} request to ${url}`);

      const axiosConfig: AxiosRequestConfig = {
        method,
        url,
        headers,
        timeout: config.timeout,
        maxRedirects: config.followRedirects ? 5 : 0,
        validateStatus: (status: number) => status < 400,
      };

      // Add body for non-GET requests
      if (method !== "GET" && method !== "HEAD" && input.body !== undefined) {
        axiosConfig.data = input.body;
      }

      // Add query parameters
      if (input.query) {
        axiosConfig.params = input.query;
      }

      let response: AxiosResponse;
      let lastError: Error | null = null;

      // Retry logic
      for (let attempt = 0; attempt <= config.retries; attempt++) {
        try {
          if (attempt > 0) {
            logs.push(`Retry attempt ${attempt}/${config.retries}`);
            await new Promise((resolve) =>
              setTimeout(resolve, config.retryDelay),
            );
          }

          response = await axios(axiosConfig);
          break;
        } catch (error) {
          lastError = error as Error;
          logs.push(
            `Request attempt ${attempt + 1} failed: ${lastError.message}`,
          );

          if (attempt === config.retries) {
            throw lastError;
          }
        }
      }

      logs.push(`Request completed with status ${response!.status}`);

      return {
        success: true,
        output: {
          response: {
            status: response!.status,
            statusText: response!.statusText,
            headers: response!.headers,
            data: response!.data,
            config: response!.config,
          },
          data: response!.data,
          status: response!.status,
          headers: response!.headers,
        },
        logs,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
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

export { httpRequestNode };
