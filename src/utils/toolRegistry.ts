// Type definitions
export interface ToolDefinition {
  id?: string;
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute?: (params: Record<string, any>) => Promise<any>;
  implementation?: string;
  category?: string;
  permissions?: string[];
}

export interface ToolRegistry {
  register(tool: ToolDefinition): Promise<string>;
  get(toolId: string): Promise<ToolDefinition | null>;
  list(): Promise<ToolDefinition[]>;
  update(toolId: string, tool: Partial<ToolDefinition>): Promise<void>;
  delete(toolId: string): Promise<void>;
}

import { supabase } from "./supabaseClient";

import { ToolRegistry as ExecutionEngineToolRegistry } from "./executionEngine";

export class SupabaseToolRegistry implements ExecutionEngineToolRegistry {
  private tableName = "tools";

  async unregister(toolId: string): Promise<boolean> {
    const { error } = await supabase
      .from(this.tableName)
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("id", toolId);

    return !error;
  }

  async getToolById(toolId: string): Promise<ToolDefinition | null> {
    const { data, error } = await supabase
      .from(this.tableName)
      .select("*")
      .eq("id", toolId)
      .eq("active", true)
      .single();

    if (error) {
      console.error("Supabase getTool error:", error);
      return null;
    }

    if (!data) {
      return null;
    }

    return {
      name: data.name,
      description: data.description,
      parameters: data.parameters,
      implementation: data.implementation,
      category: data.category,
      permissions: data.permissions,
    };
  }

  async listTools(category?: string): Promise<ToolDefinition[]> {
    let query = supabase.from(this.tableName).select("*").eq("active", true);

    if (category) {
      query = query.eq("category", category);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Supabase listTools error:", error);
      return [];
    }

    return (data || []).map((item: any) => ({
      name: item.name,
      description: item.description,
      parameters: item.parameters,
      implementation: item.implementation,
      category: item.category,
      permissions: item.permissions,
    }));
  }

  async executeToolById(
    toolId: string,
    parameters: Record<string, any>,
  ): Promise<any> {
    const tool = await this.getTool(toolId);
    if (!tool) {
      throw new Error(`Tool ${toolId} not found or inactive`);
    }

    // Validate parameters
    const validation = this.validateParameters(parameters, tool.parameters);
    if (!validation.valid) {
      throw new Error(
        `Parameter validation failed: ${validation.errors.join(", ")}`,
      );
    }

    // Execute tool based on implementation
    return await this.executeToolImplementation(tool, parameters);
  }

  private validateParameters(
    params: Record<string, any>,
    schema: any,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const required = schema.required || [];

    // Check required parameters
    for (const req of required) {
      if (!(req in params)) {
        errors.push(`Missing required parameter: ${req}`);
      }
    }

    // Check parameter types (basic validation)
    if (schema.properties) {
      for (const [key, value] of Object.entries(params)) {
        const propSchema = schema.properties[key];
        if (propSchema && propSchema.type) {
          const actualType = typeof value;
          const expectedType = propSchema.type;

          if (expectedType === "string" && actualType !== "string") {
            errors.push(`Parameter ${key} must be a string`);
          } else if (expectedType === "number" && actualType !== "number") {
            errors.push(`Parameter ${key} must be a number`);
          } else if (expectedType === "boolean" && actualType !== "boolean") {
            errors.push(`Parameter ${key} must be a boolean`);
          } else if (expectedType === "array" && !Array.isArray(value)) {
            errors.push(`Parameter ${key} must be an array`);
          } else if (
            expectedType === "object" &&
            (actualType !== "object" || Array.isArray(value))
          ) {
            errors.push(`Parameter ${key} must be an object`);
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private async executeToolImplementation(
    tool: ToolDefinition,
    parameters: Record<string, any>,
  ): Promise<any> {
    // This is where you would implement the actual tool execution
    // For now, we'll have some built-in tools and a way to extend

    switch (tool.implementation) {
      case "http_request":
        return await this.executeHttpRequest(parameters);

      case "database_query":
        return await this.executeDatabaseQuery(parameters);

      case "email_send":
        return await this.executeEmailSend(parameters);

      case "social_post":
        return await this.executeSocialPost(parameters);

      case "file_operation":
        return await this.executeFileOperation(parameters);

      case "custom_function":
        return await this.executeCustomFunction(tool.name, parameters);

      default:
        throw new Error(`Unknown tool implementation: ${tool.implementation}`);
    }
  }

  private async executeHttpRequest(params: any): Promise<any> {
    const { method = "GET", url, headers = {}, body } = params;

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(
        `HTTP request failed: ${response.status} ${response.statusText}`,
      );
    }

    return await response.json();
  }

  private async executeDatabaseQuery(params: any): Promise<any> {
    // This would integrate with actual database
    // For now, return mock data
    const { query: sqlQuery, database } = params;
    return {
      success: true,
      query: sqlQuery,
      database,
      mockResult: `Mock result for query: ${sqlQuery}`,
    };
  }

  private async executeEmailSend(params: any): Promise<any> {
    // This would integrate with email service
    const { to, subject, body } = params;
    return {
      success: true,
      to,
      subject,
      sentAt: new Date().toISOString(),
      mock: true,
    };
  }

  private async executeSocialPost(params: any): Promise<any> {
    // This would integrate with social media APIs
    const { platform, content, media } = params;
    return {
      success: true,
      platform,
      postId: `post_${Date.now()}`,
      postedAt: new Date().toISOString(),
      mock: true,
    };
  }

  private async executeFileOperation(params: any): Promise<any> {
    // This would handle file operations
    const { operation, path, content } = params;
    return {
      success: true,
      operation,
      path,
      mock: true,
    };
  }

  private async executeCustomFunction(
    functionName: string,
    params: any,
  ): Promise<any> {
    // This would execute custom functions registered by users
    // For security, this should be sandboxed
    return {
      success: true,
      function: functionName,
      params,
      result: `Mock result for custom function: ${functionName}`,
      mock: true,
    };
  }

  // Built-in tools
  async getBuiltInTools(): Promise<ToolDefinition[]> {
    return [
      {
        name: "web_scraper",
        description: "Scrape content from web pages",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "URL to scrape" },
            selector: {
              type: "string",
              description: "CSS selector for content",
            },
          },
          required: ["url"],
        },
        implementation: "http_request",
        category: "web",
        permissions: ["web_access"],
      },
      {
        name: "email_sender",
        description: "Send emails via SMTP",
        parameters: {
          type: "object",
          properties: {
            to: { type: "string", description: "Recipient email" },
            subject: { type: "string", description: "Email subject" },
            body: { type: "string", description: "Email body" },
          },
          required: ["to", "subject", "body"],
        },
        implementation: "email_send",
        category: "communication",
        permissions: ["email_send"],
      },
      {
        name: "social_poster",
        description: "Post to social media platforms",
        parameters: {
          type: "object",
          properties: {
            platform: {
              type: "string",
              enum: ["twitter", "facebook", "linkedin"],
            },
            content: { type: "string", description: "Post content" },
            media: {
              type: "array",
              items: { type: "string" },
              description: "Media URLs",
            },
          },
          required: ["platform", "content"],
        },
        implementation: "social_post",
        category: "social",
        permissions: ["social_post"],
      },
      {
        name: "database_reader",
        description: "Execute database queries",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "SQL query" },
            database: { type: "string", description: "Database connection" },
          },
          required: ["query"],
        },
        implementation: "database_query",
        category: "database",
        permissions: ["database_read"],
      },
    ];
  }

  async initializeBuiltInTools(): Promise<void> {
    const builtInTools = await this.getBuiltInTools();

    for (const tool of builtInTools) {
      const existing = await this.getToolByName(tool.name);
      if (!existing) {
        await this.register(tool.name, tool);
      }
    }
  }

  private async getToolByName(name: string): Promise<ToolDefinition | null> {
    const { data, error } = await supabase
      .from(this.tableName)
      .select("*")
      .eq("name", name)
      .eq("active", true)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      name: data.name,
      description: data.description,
      parameters: data.parameters,
      implementation: data.implementation,
      category: data.category,
      permissions: data.permissions,
    };
  }

  // Methods required by the ToolRegistry interface from executionEngine.ts
  async getTool(name: string): Promise<any> {
    return await this.getToolByName(name);
  }

  async executeTool(tool: any, params: Record<string, any>): Promise<any> {
    if (typeof tool === "string") {
      // If tool is a string name, get the tool definition first
      const toolDef = await this.getToolByName(tool);
      if (!toolDef) {
        throw new Error(`Tool ${tool} not found`);
      }
      return await this.executeToolImplementation(toolDef, params);
    } else {
      // If tool is already a ToolDefinition object
      return await this.executeToolImplementation(tool, params);
    }
  }

  // Methods required by ExecutionEngineToolRegistry
  register(name: string, tool: any): void {
    // For now, just store in memory or handle registration
    console.log(`Registering tool: ${name}`);
  }

  get(name: string): any {
    // Return tool by name - simplified implementation
    return { name };
  }

  list(): string[] {
    // Return list of tool names - simplified implementation
    return ["http_request", "database_query", "email_send", "social_post"];
  }

  async execute(name: string, params: Record<string, any>): Promise<any> {
    return await this.executeTool(name, params);
  }
}
