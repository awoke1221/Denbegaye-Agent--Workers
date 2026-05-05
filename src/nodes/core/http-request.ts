import { z } from "zod";
import {
  NodeDefinition,
  NodeExecutionContext,
  NodeExecutionResult,
  nodeRegistry,
} from "../index";
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import { Parser } from "expr-eval";

// Helper function for expression evaluation
function evaluateExpression(
  expression: string,
  variables: Record<string, any>,
): any {
  try {
    const parser = new Parser();
    return parser.evaluate(expression, variables);
  } catch (error) {
    throw new Error(`Expression evaluation failed: ${error}`);
  }
}

// Helper function for template string replacement
function interpolateTemplate(
  template: string,
  variables: Record<string, any>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] !== undefined ? String(variables[key]) : match;
  });
}

// Helper function to build final URL
function buildUrl(
  config: any,
  input: any,
  variables: Record<string, any>,
): string {
  let url = config.url || "";

  if (config.baseUrl && config.path) {
    url = `${config.baseUrl}${config.path}`;
  }

  // Apply data mapping if present
  if (config.dataMapping?.url) {
    url = evaluateExpression(config.dataMapping.url, {
      ...variables,
      ...input.variables,
    });
  }

  // Apply input override
  if (input.url) {
    url = input.url;
  }

  // Interpolate variables in URL
  url = interpolateTemplate(url, variables);

  return url;
}

// Helper function to build headers
function buildHeaders(
  config: any,
  input: any,
  variables: Record<string, any>,
): Record<string, string> {
  let headers = { ...config.headers };

  // Add authentication headers
  if (config.authType && config.authType !== "none") {
    switch (config.authType) {
      case "basic":
        if (config.authConfig?.username && config.authConfig?.password) {
          const credentials = Buffer.from(
            `${config.authConfig.username}:${config.authConfig.password}`,
          ).toString("base64");
          headers["Authorization"] = `Basic ${credentials}`;
        }
        break;
      case "bearer":
        const token = input.authToken || config.authConfig?.token;
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        break;
      case "header":
        if (config.authConfig?.headerName && config.authConfig?.headerValue) {
          headers[config.authConfig.headerName] = config.authConfig.headerValue;
        }
        break;
    }
  }

  // Apply data mapping for headers
  if (config.dataMapping?.headers) {
    const mappedHeaders: Record<string, any> = {};
    for (const [key, expr] of Object.entries(config.dataMapping.headers)) {
      mappedHeaders[key] = evaluateExpression(expr as string, {
        ...variables,
        ...input.variables,
      });
    }
    headers = { ...headers, ...mappedHeaders };
  }

  // Merge input headers
  if (input.headers) {
    headers = { ...headers, ...input.headers };
  }

  // Auto-generate headers
  if (config.autoHeaders) {
    if (!headers["Accept"]) {
      headers["Accept"] = "application/json, text/plain, */*";
    }
    if (!headers["User-Agent"]) {
      headers["User-Agent"] = "Denbegaye-Agent/1.0";
    }
  }

  return headers;
}

// Helper function to build query parameters
function buildQueryParams(
  config: any,
  input: any,
  variables: Record<string, any>,
): Record<string, any> {
  let params = { ...config.queryParams };

  // Apply data mapping for query params
  if (config.dataMapping?.queryParams) {
    const mappedParams: Record<string, any> = {};
    for (const [key, expr] of Object.entries(config.dataMapping.queryParams)) {
      mappedParams[key] = evaluateExpression(expr as string, {
        ...variables,
        ...input.variables,
      });
    }
    params = { ...params, ...mappedParams };
  }

  // Merge input query params
  if (input.queryParams) {
    params = { ...params, ...input.queryParams };
  }

  return params;
}

// Helper function to build request body
function buildRequestBody(
  config: any,
  input: any,
  variables: Record<string, any>,
): any {
  let body = input.body;

  // Apply data mapping for body
  if (config.dataMapping?.body) {
    body = evaluateExpression(config.dataMapping.body, {
      ...variables,
      ...input.variables,
    });
  }

  // Process based on body mode
  if (config.bodyMode && config.bodyMode !== "none") {
    switch (config.bodyMode) {
      case "json":
        return config.bodyConfig?.json || body;
      case "raw":
        return config.bodyConfig?.raw?.content || body;
      case "form-data":
        // For form-data, we'll handle this in the axios config
        return body;
      case "urlencoded":
        return config.bodyConfig?.urlencoded || body;
      case "binary":
        // For binary, we'll handle this in the axios config
        return body;
    }
  }

  return body;
}

// Helper function to check if error should trigger retry
function shouldRetry(error: any, config: any): boolean {
  if (!config.retryCondition || config.retryCondition === "always") {
    return true;
  }

  if (config.retryCondition === "5xx") {
    return error.response?.status >= 500;
  }

  if (config.retryCondition === "network") {
    return !error.response;
  }

  if (config.retryCondition === "timeout") {
    return error.code === "ECONNABORTED";
  }

  return false;
}

// Helper function to check fail conditions
function checkFailConditions(response: AxiosResponse, config: any): boolean {
  if (!config.failConditions || config.failConditions.length === 0) {
    return false;
  }

  for (const condition of config.failConditions) {
    switch (condition.condition) {
      case "status":
        if (response.status.toString() === condition.value) {
          return true;
        }
        break;
      case "contains":
        const responseText =
          typeof response.data === "string"
            ? response.data
            : JSON.stringify(response.data);
        if (responseText.includes(condition.value)) {
          return true;
        }
        break;
      case "not-contains":
        const responseText2 =
          typeof response.data === "string"
            ? response.data
            : JSON.stringify(response.data);
        if (!responseText2.includes(condition.value)) {
          return true;
        }
        break;
    }
  }

  return false;
}

// Helper function to extract pagination info
function extractPaginationInfo(response: AxiosResponse, config: any): any {
  if (!config.pagination?.enabled) {
    return null;
  }

  const pagination = config.pagination;
  const data = response.data;

  switch (pagination.type) {
    case "offset":
      return {
        hasNext: true, // Assume more data unless specified
        nextParams: {
          [pagination.config.offsetParam]:
            (data.offset || 0) + (data.limit || 10),
          [pagination.config.limitParam]: data.limit || 10,
        },
      };
    case "cursor":
      return {
        hasNext: data[pagination.config.hasNextPath] !== false,
        nextParams: {
          [pagination.config.cursorParam]: data.nextCursor || data.cursor,
        },
      };
    case "page":
      const currentPage = data.currentPage || data.page || 1;
      const totalPages = data.totalPages || data.pages;
      return {
        hasNext: currentPage < totalPages,
        nextParams: {
          [pagination.config.pageParam]: currentPage + 1,
        },
        currentPage,
        totalPages,
      };
    case "link":
      return {
        hasNext: !!data[pagination.config.nextLinkPath],
        nextUrl: data[pagination.config.nextLinkPath],
      };
  }

  return null;
}

// HTTP Request Node - Advanced Configuration
const httpRequestConfigSchema = z.object({
  // Request Core
  method: z
    .enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])
    .default("GET"),
  baseUrl: z.string().url().optional(),
  path: z.string().default(""),
  url: z.string().url().optional(), // For backward compatibility
  queryParams: z.record(z.string()).default({}),

  // Authentication
  authType: z
    .enum(["none", "basic", "bearer", "header", "oauth2"])
    .default("none"),
  authConfig: z
    .object({
      username: z.string().optional(),
      password: z.string().optional(),
      token: z.string().optional(),
      headerName: z.string().optional(),
      headerValue: z.string().optional(),
      oauth2Config: z
        .object({
          clientId: z.string().optional(),
          clientSecret: z.string().optional(),
          tokenUrl: z.string().url().optional(),
          scope: z.string().optional(),
        })
        .optional(),
    })
    .optional(),

  // Headers
  headers: z.record(z.string()).default({}),
  autoHeaders: z.boolean().default(true), // Auto-generate Content-Type, Accept, etc.

  // Body Configuration
  bodyMode: z
    .enum(["json", "raw", "form-data", "urlencoded", "binary", "none"])
    .default("json"),
  bodyConfig: z
    .object({
      json: z.any().optional(),
      raw: z
        .object({
          content: z.string(),
          contentType: z.string().default("text/plain"),
        })
        .optional(),
      formData: z
        .array(
          z.object({
            key: z.string(),
            value: z.string(),
            type: z.enum(["text", "file"]).default("text"),
            filename: z.string().optional(),
          }),
        )
        .optional(),
      urlencoded: z.record(z.string()).optional(),
      binary: z
        .object({
          data: z.string(), // base64 encoded
          filename: z.string().optional(),
          contentType: z.string().optional(),
        })
        .optional(),
    })
    .optional(),

  // Data Mapping
  dataMapping: z
    .object({
      url: z.string().optional(), // Expression for URL
      headers: z.record(z.string()).optional(), // Expressions for headers
      body: z.any().optional(), // Expression for body
      queryParams: z.record(z.string()).optional(), // Expressions for query params
    })
    .optional(),

  // Response Handling
  responseFormat: z.enum(["json", "string", "binary"]).default("json"),
  responseMode: z.enum(["full", "body-only"]).default("full"),
  responseMapping: z.record(z.string()).optional(), // Map response fields to variables

  // Error Handling
  continueOnFail: z.boolean().default(false),
  retryCount: z.number().min(0).max(10).default(0),
  retryDelay: z.number().min(100).max(60000).default(1000), // ms
  retryCondition: z
    .enum(["always", "5xx", "network", "timeout"])
    .default("always"),
  failConditions: z
    .array(
      z.object({
        condition: z.enum(["status", "contains", "not-contains"]),
        value: z.string(),
      }),
    )
    .default([]),

  // Pagination Support
  pagination: z
    .object({
      enabled: z.boolean().default(false),
      type: z.enum(["offset", "cursor", "page", "link"]).default("offset"),
      config: z
        .object({
          offsetParam: z.string().default("offset"),
          limitParam: z.string().default("limit"),
          cursorParam: z.string().default("cursor"),
          pageParam: z.string().default("page"),
          nextLinkPath: z.string().default("next"),
          hasNextPath: z.string().default("hasNext"),
          maxPages: z.number().min(1).max(1000).default(100),
        })
        .default({}),
    })
    .optional(),

  // Timeouts and Networking
  timeout: z.number().min(1000).max(300000).default(30000), // 30 seconds
  followRedirects: z.boolean().default(true),
  maxRedirects: z.number().min(0).max(10).default(5),
  proxy: z
    .object({
      host: z.string(),
      port: z.number(),
      auth: z
        .object({
          username: z.string(),
          password: z.string(),
        })
        .optional(),
    })
    .optional(),
  sslIgnore: z.boolean().default(false),

  // Execution Options
  batching: z
    .object({
      enabled: z.boolean().default(false),
      size: z.number().min(1).max(100).default(10),
      delay: z.number().min(0).max(10000).default(0),
    })
    .optional(),
  rateLimit: z
    .object({
      enabled: z.boolean().default(false),
      requests: z.number().min(1).max(1000).default(10),
      period: z.number().min(1).max(3600).default(60), // seconds
    })
    .optional(),
  concurrency: z
    .object({
      enabled: z.boolean().default(false),
      limit: z.number().min(1).max(50).default(5),
    })
    .optional(),
});

const httpRequestNode: NodeDefinition = {
  id: "http-request",
  type: "core-http-request",
  name: "HTTP Request",
  description:
    "Make advanced HTTP requests with authentication, data mapping, pagination, and error handling",
  category: "core",
  icon: "🌐",
  color: "#00ACC1",

  configSchema: httpRequestConfigSchema,

  inputs: [
    {
      id: "url",
      label: "URL Override",
      type: "string",
      required: false,
      description: "Override the configured URL",
    },
    {
      id: "method",
      label: "Method Override",
      type: "string",
      required: false,
      description: "Override the HTTP method",
    },
    {
      id: "headers",
      label: "Additional Headers",
      type: "object",
      required: false,
      description: "Additional headers to merge with config",
    },
    {
      id: "body",
      label: "Request Body",
      type: "any",
      required: false,
      description: "Request body data (JSON, form data, etc.)",
    },
    {
      id: "queryParams",
      label: "Query Parameters",
      type: "object",
      required: false,
      description: "Additional query parameters",
    },
    {
      id: "authToken",
      label: "Auth Token",
      type: "string",
      required: false,
      description: "Dynamic authentication token",
    },
    {
      id: "variables",
      label: "Variables",
      type: "object",
      required: false,
      description: "Variables for expression evaluation in data mapping",
    },
  ],

  outputs: [
    {
      id: "response",
      label: "Full Response",
      type: "object",
      description: "Complete HTTP response object",
    },
    {
      id: "data",
      label: "Response Data",
      type: "any",
      description: "Response body data",
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
    {
      id: "pagination",
      label: "Pagination Info",
      type: "object",
      description: "Pagination metadata for subsequent requests",
    },
    {
      id: "error",
      label: "Error Info",
      type: "object",
      description: "Error details if request failed",
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
      queryParams: z.record(z.any()).optional(),
      authToken: z.string().optional(),
      variables: z.record(z.any()).optional(),
    }),
    output: z.object({
      response: z
        .object({
          status: z.number(),
          statusText: z.string(),
          headers: z.record(z.string()),
          data: z.any(),
          config: z.any(),
        })
        .optional(),
      data: z.any().optional(),
      status: z.number().optional(),
      headers: z.record(z.string()).optional(),
      pagination: z
        .object({
          hasNext: z.boolean(),
          nextUrl: z.string().optional(),
          nextParams: z.record(z.any()).optional(),
          currentPage: z.number().optional(),
          totalPages: z.number().optional(),
        })
        .optional(),
      error: z
        .object({
          message: z.string(),
          code: z.string().optional(),
          status: z.number().optional(),
          details: z.any().optional(),
        })
        .optional(),
    }),
  },

  handler: async (
    context: NodeExecutionContext,
  ): Promise<NodeExecutionResult> => {
    const startTime = Date.now();
    const logs: string[] = [];

    const config = httpRequestConfigSchema.parse(context.config);
    const input = context.validation.input.parse(context.input);
    const variables = { ...context.variables, ...input.variables };

    try {
      // Build request components
      const url = buildUrl(config, input, variables);
      const method = input.method || config.method;
      const headers = buildHeaders(config, input, variables);
      const params = buildQueryParams(config, input, variables);
      const data = buildRequestBody(config, input, variables);

      logs.push(`Making ${method} request to ${url}`);

      // Prepare axios configuration
      const axiosConfig: AxiosRequestConfig = {
        method,
        url,
        headers: { ...headers }, // Ensure headers is always an object
        timeout: config.timeout,
        maxRedirects: config.followRedirects ? config.maxRedirects : 0,
        validateStatus: (status: number) => status < 400,
      };

      // Add proxy configuration
      if (config.proxy) {
        axiosConfig.proxy = {
          host: config.proxy.host,
          port: config.proxy.port,
          auth: config.proxy.auth
            ? {
                username: config.proxy.auth.username,
                password: config.proxy.auth.password,
              }
            : undefined,
        };
      }

      // Add SSL ignore
      if (config.sslIgnore) {
        axiosConfig.httpsAgent = new (require("https").Agent)({
          rejectUnauthorized: false,
        });
      }

      // Handle different body modes
      if (config.bodyMode === "form-data" && config.bodyConfig?.formData) {
        const FormData = require("form-data");
        const form = new FormData();

        for (const field of config.bodyConfig.formData) {
          if (field.type === "file") {
            // Handle file uploads - assume base64 encoded content
            const buffer = Buffer.from(field.value, "base64");
            form.append(field.key, buffer, field.filename || "file");
          } else {
            form.append(field.key, field.value);
          }
        }

        axiosConfig.data = form;
        axiosConfig.headers = { ...headers, ...form.getHeaders() };
      } else if (config.bodyMode === "binary" && config.bodyConfig?.binary) {
        axiosConfig.data = Buffer.from(config.bodyConfig.binary.data, "base64");
        if (config.bodyConfig.binary.contentType) {
          axiosConfig.headers!["Content-Type"] =
            config.bodyConfig.binary.contentType;
        }
      } else if (data !== undefined && method !== "GET" && method !== "HEAD") {
        axiosConfig.data = data;
        if (
          config.bodyMode === "json" &&
          !axiosConfig.headers!["Content-Type"]
        ) {
          axiosConfig.headers!["Content-Type"] = "application/json";
        } else if (
          config.bodyMode === "urlencoded" &&
          !axiosConfig.headers!["Content-Type"]
        ) {
          axiosConfig.headers!["Content-Type"] =
            "application/x-www-form-urlencoded";
        } else if (
          config.bodyMode === "raw" &&
          config.bodyConfig?.raw?.contentType
        ) {
          axiosConfig.headers!["Content-Type"] =
            config.bodyConfig.raw.contentType;
        }
      }

      // Add query parameters
      if (Object.keys(params).length > 0) {
        axiosConfig.params = params;
      }

      let response: AxiosResponse;
      let lastError: Error | null = null;

      // Retry logic with advanced conditions
      for (let attempt = 0; attempt <= config.retryCount; attempt++) {
        try {
          if (attempt > 0) {
            logs.push(
              `Retry attempt ${attempt}/${config.retryCount} after ${config.retryDelay}ms delay`,
            );
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

          if (attempt === config.retryCount || !shouldRetry(error, config)) {
            throw lastError;
          }
        }
      }

      // Check custom fail conditions
      if (checkFailConditions(response!, config)) {
        const errorMsg = `Request failed due to custom fail condition`;
        logs.push(errorMsg);

        if (!config.continueOnFail) {
          return {
            success: false,
            error: errorMsg,
            logs,
            executionTime: Date.now() - startTime,
            output: {
              error: {
                message: errorMsg,
                code: "FAIL_CONDITION",
                status: response!.status,
              },
            },
          };
        }
      }

      logs.push(`Request completed with status ${response!.status}`);

      // Process response based on format
      let processedData = response!.data;
      if (config.responseFormat === "string") {
        processedData =
          typeof response!.data === "string"
            ? response!.data
            : JSON.stringify(response!.data);
      } else if (config.responseFormat === "binary") {
        processedData = Buffer.isBuffer(response!.data)
          ? response!.data.toString("base64")
          : response!.data;
      }

      // Extract pagination info
      const pagination = extractPaginationInfo(response!, config);

      // Prepare output
      const output: any = {};

      if (config.responseMode === "full") {
        output.response = {
          status: response!.status,
          statusText: response!.statusText,
          headers: response!.headers,
          data: processedData,
          config: response!.config,
        };
      }

      output.data = processedData;
      output.status = response!.status;
      output.headers = response!.headers;

      if (pagination) {
        output.pagination = pagination;
      }

      return {
        success: true,
        output,
        logs,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logs.push(`HTTP request failed: ${errorMessage}`);

      const errorOutput = {
        error: {
          message: errorMessage,
          code: (error as any).code || "UNKNOWN_ERROR",
          status: (error as any).response?.status,
          details: (error as any).response?.data,
        },
      };

      if (config.continueOnFail) {
        return {
          success: true, // Continue on fail means success with error info
          output: errorOutput,
          logs,
          executionTime: Date.now() - startTime,
        };
      }

      return {
        success: false,
        error: errorMessage,
        output: errorOutput,
        logs,
        executionTime: Date.now() - startTime,
      };
    }
  },
};

export { httpRequestNode };
