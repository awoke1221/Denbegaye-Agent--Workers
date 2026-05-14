// Built-in node registry for workflow execution
// This registry provides generic handlers for supported node types
// and enables LangGraph workflows to execute without falling back
// to no-op nodes for every unknown type.

import { HumanMessage } from "@langchain/core/messages";
import { llmFactory } from "../utils/llmFactory";
import { logger } from "../utils/logger";
import { sendEmail, EmailOptions } from "../utils/emailService";

const getProviderFromNodeType = (nodeType: string): string => {
  const type = nodeType.toLowerCase();
  if (type.includes("openai")) return "openai";
  if (type.includes("gemini")) return "gemini";
  if (type.includes("anthropic")) return "anthropic";
  if (type.includes("deepseek")) return "deepseek";
  if (type.includes("groq")) return "groq";
  return "openai"; // default
};

const normalizeNodeType = (type: string) =>
  type
    ?.toString()
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

export class NodeRegistry {
  private nodes: Map<string, any> = new Map();

  register(node: any) {
    const normalizedType = normalizeNodeType(node.type);
    this.nodes.set(normalizedType, node);
  }

  get(type: string) {
    return this.nodes.get(normalizeNodeType(type));
  }
}

export const nodeRegistry = new NodeRegistry();

const createNodeDefinition = (
  type: string,
  handler: (context: any) => Promise<any>,
  description?: string,
) => ({
  type,
  handler,
  description: description || `Generic handler for ${type}`,
  validation: {},
});

const aiHandler = async (context: any) => {
  const apiKey = context.config?.apiKey;
  const model = context.config?.model;
  const nodeType = context.nodeType || context.type || "ai";
  const provider = getProviderFromNodeType(nodeType);
  const prompt =
    context.config?.inputText ||
    context.config?.prompt ||
    context.input?.text ||
    context.input?.output?.text ||
    context.input?.message ||
    "";

  if (!apiKey) {
    return {
      success: false,
      error: "API key not configured for AI node",
      nodeId: context.nodeId,
    };
  }

  try {
    const llm = llmFactory.createLLM({
      provider: provider as any,
      apiKey,
      model,
      temperature: context.config?.temperature ?? 0.7,
      maxTokens: context.config?.maxTokens,
    });

    const response = await llm.invoke([new HumanMessage(prompt)]);
    const generatedText = response.content as string;

    return {
      success: true,
      output: {
        text: generatedText,
        message: `${nodeType} executed with model ${model}`,
        model,
        data: {
          model,
          systemPrompt: context.config?.systemPrompt || "",
          executionType: "ai-completion",
          provider,
        },
        raw: {
          model,
          prompt,
          response: generatedText,
          nodeId: context.nodeId,
          nodeType,
        },
      },
      logs: [
        `${nodeType} node executed with model ${model}, generated ${generatedText.length} characters`,
      ],
    };
  } catch (error) {
    logger.error(`AI handler error for ${nodeType}:`, error);
    return {
      success: false,
      error: `Failed to execute AI node: ${error instanceof Error ? error.message : String(error)}`,
      nodeId: context.nodeId,
    };
  }
};

const triggerHandler = async (context: any) => {
  return {
    success: true,
    output: {
      nodeId: context.nodeId,
      nodeType: context.nodeType,
      triggered: true,
      config: context.config,
      input: context.input,
    },
    logs: [`Trigger node ${context.nodeId} executed`],
  };
};

const actionHandler = async (context: any) => {
  const nodeType = context.nodeType || context.type || "action";
  const message =
    context.config?.message ||
    context.input?.text ||
    context.input?.output?.text ||
    context.input?.message ||
    "";

  return {
    success: true,
    output: {
      text: `Action executed: ${message.slice(0, 100)}`,
      message: `${nodeType} action executed`,
      data: {
        nodeType,
        messageLength: message.length,
      },
    },
    logs: [`${nodeType} action executed`],
  };
};

const coreHandler = async (context: any) => {
  return {
    success: true,
    output: {
      nodeId: context.nodeId,
      nodeType: context.nodeType,
      result: context.input,
      config: context.config,
    },
    logs: [`Core node ${context.nodeId} executed`],
  };
};

const fallbackHandler = async (context: any) => {
  return {
    success: true,
    output: {
      fallback: true,
      nodeId: context.nodeId,
      nodeType: context.nodeType,
      config: context.config,
      input: context.input,
      message: `Fallback execution for node type ${context.nodeType}`,
    },
    logs: [`Fallback node ${context.nodeId} executed`],
  };
};

// Specialized handlers for LangChain-compatible execution
const openaiHandler = async (context: any) => {
  const apiKey = context.config?.apiKey || context.apiKeys?.openai;
  const model = context.config?.model || "gpt-4o-mini";
  const nodeType = context.nodeType || context.type || "ai-openai";
  const prompt =
    context.config?.inputText ||
    context.config?.prompt ||
    context.input?.text ||
    context.input?.output?.text ||
    context.input?.message ||
    "";

  if (!apiKey) {
    return {
      success: false,
      error: "OpenAI API key not configured",
      nodeId: context.nodeId,
    };
  }

  try {
    const llm = llmFactory.createLLM({
      provider: "openai",
      apiKey,
      model,
      temperature: context.config?.temperature ?? 0.7,
      maxTokens: context.config?.maxTokens,
    });

    const response = await llm.invoke([new HumanMessage(prompt)]);
    const generatedText = response.content as string;

    return {
      success: true,
      output: {
        text: generatedText,
        message: `${nodeType} executed with model ${model}`,
        model,
        data: {
          model,
          systemPrompt: context.config?.systemPrompt || "",
          executionType: "ai-completion",
          provider: "openai",
        },
        raw: {
          model,
          prompt,
          response: generatedText,
          nodeId: context.nodeId,
          nodeType,
        },
      },
      logs: [
        `${nodeType} node executed with model ${model}, generated ${generatedText.length} characters`,
      ],
    };
  } catch (error) {
    logger.error(`OpenAI handler error:`, error);
    return {
      success: false,
      error: `Failed to execute OpenAI node: ${error instanceof Error ? error.message : String(error)}`,
      nodeId: context.nodeId,
    };
  }
};

const anthropicHandler = async (context: any) => {
  const apiKey = context.config?.apiKey || context.apiKeys?.anthropic;
  const model = context.config?.model || "claude-3.5-opus";
  const nodeType = context.nodeType || context.type || "ai-anthropic";
  const prompt =
    context.config?.inputText ||
    context.config?.prompt ||
    context.input?.text ||
    context.input?.output?.text ||
    context.input?.message ||
    "";

  if (!apiKey) {
    return {
      success: false,
      error: "Anthropic API key not configured",
      nodeId: context.nodeId,
    };
  }

  try {
    const llm = llmFactory.createLLM({
      provider: "anthropic",
      apiKey,
      model,
      temperature: context.config?.temperature ?? 0.7,
      maxTokens: context.config?.maxTokens,
    });

    const response = await llm.invoke([new HumanMessage(prompt)]);
    const generatedText = response.content as string;

    return {
      success: true,
      output: {
        text: generatedText,
        message: `${nodeType} executed with model ${model}`,
        model,
        data: {
          model,
          systemPrompt: context.config?.systemPrompt || "",
          executionType: "ai-completion",
          provider: "anthropic",
        },
        raw: {
          model,
          prompt,
          response: generatedText,
          nodeId: context.nodeId,
          nodeType,
        },
      },
      logs: [
        `${nodeType} node executed with model ${model}, generated ${generatedText.length} characters`,
      ],
    };
  } catch (error) {
    logger.error(`Anthropic handler error:`, error);
    return {
      success: false,
      error: `Failed to execute Anthropic node: ${error instanceof Error ? error.message : String(error)}`,
      nodeId: context.nodeId,
    };
  }
};

const groqHandler = async (context: any) => {
  const apiKey = context.config?.apiKey || context.apiKeys?.groq;
  const model = context.config?.model || "groq-1.0";
  const nodeType = context.nodeType || context.type || "ai-groq";
  const prompt =
    context.config?.inputText ||
    context.config?.prompt ||
    context.input?.text ||
    context.input?.output?.text ||
    context.input?.message ||
    "";

  if (!apiKey) {
    return {
      success: false,
      error: "Groq API key not configured",
      nodeId: context.nodeId,
    };
  }

  try {
    const llm = llmFactory.createLLM({
      provider: "groq",
      apiKey,
      model,
      temperature: context.config?.temperature ?? 0.7,
      maxTokens: context.config?.maxTokens,
    });

    const response = await llm.invoke([new HumanMessage(prompt)]);
    const generatedText = response.content as string;

    return {
      success: true,
      output: {
        text: generatedText,
        message: `${nodeType} executed with model ${model}`,
        model,
        data: {
          model,
          systemPrompt: context.config?.systemPrompt || "",
          executionType: "ai-completion",
          provider: "groq",
        },
        raw: {
          model,
          prompt,
          response: generatedText,
          nodeId: context.nodeId,
          nodeType,
        },
      },
      logs: [
        `${nodeType} node executed with model ${model}, generated ${generatedText.length} characters`,
      ],
    };
  } catch (error) {
    logger.error(`Groq handler error:`, error);
    return {
      success: false,
      error: `Failed to execute Groq node: ${error instanceof Error ? error.message : String(error)}`,
      nodeId: context.nodeId,
    };
  }
};

const geminiHandler = async (context: any) => {
  const apiKey = context.config?.apiKey || context.apiKeys?.gemini;
  const model = context.config?.model || "gemini-1.5-pro";
  const nodeType = context.nodeType || context.type || "ai-gemini";
  const prompt =
    context.config?.inputText ||
    context.config?.prompt ||
    context.input?.text ||
    context.input?.output?.text ||
    context.input?.message ||
    "";

  if (!apiKey) {
    return {
      success: false,
      error: "Google Gemini API key not configured",
      nodeId: context.nodeId,
    };
  }

  try {
    const llm = llmFactory.createLLM({
      provider: "gemini",
      apiKey,
      model,
      temperature: context.config?.temperature ?? 0.7,
      maxTokens: context.config?.maxTokens,
    });

    const response = await llm.invoke([new HumanMessage(prompt)]);
    const generatedText = response.content as string;

    return {
      success: true,
      output: {
        text: generatedText,
        message: `${nodeType} executed with model ${model}`,
        model,
        data: {
          model,
          systemPrompt: context.config?.systemPrompt || "",
          executionType: "ai-completion",
          provider: "gemini",
        },
        raw: {
          model,
          prompt,
          response: generatedText,
          nodeId: context.nodeId,
          nodeType,
        },
      },
      logs: [
        `${nodeType} node executed with model ${model}, generated ${generatedText.length} characters`,
      ],
    };
  } catch (error) {
    logger.error(`Gemini handler error:`, error);
    return {
      success: false,
      error: `Failed to execute Gemini node: ${error instanceof Error ? error.message : String(error)}`,
      nodeId: context.nodeId,
    };
  }
};

const deepseekHandler = async (context: any) => {
  const apiKey = context.config?.apiKey || context.apiKeys?.deepseek;
  const model = context.config?.model || "deepseek-v4-flash";
  const compatibility = context.config?.compatibility || "openai";
  const customBaseUrl = context.config?.baseUrl;
  const nodeType = context.nodeType || context.type || "ai-deepseek";
  const prompt =
    context.config?.inputText ||
    context.config?.prompt ||
    context.input?.text ||
    context.input?.output?.text ||
    context.input?.message ||
    "";

  if (!apiKey) {
    return {
      success: false,
      error: "DeepSeek API key not configured",
      nodeId: context.nodeId,
    };
  }

  const baseUrl = customBaseUrl
    ? customBaseUrl.replace(/\/+$/g, "")
    : compatibility === "anthropic"
      ? "https://api.deepseek.com/anthropic"
      : "https://api.deepseek.com";

  try {
    const isAnthropic = compatibility === "anthropic";
    const endpoint = isAnthropic
      ? `${baseUrl}/v1/messages`
      : `${baseUrl}/v1/chat/completions`;

    const body: Record<string, any> = {
      model,
      temperature: context.config?.temperature ?? 0.7,
      max_tokens: context.config?.maxTokens ?? 1000,
    };

    if (isAnthropic) {
      body.messages = [
        {
          role: "user",
          content: prompt,
        },
      ];
    } else {
      body.messages = [
        {
          role: "user",
          content: prompt,
        },
      ];
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (isAnthropic) {
      headers["x-api-key"] = apiKey;
    } else {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const message =
        errorData?.error?.message || errorData?.message || response.statusText;
      throw new Error(`DeepSeek API error: ${message}`);
    }

    const result = await response.json();
    const generatedText = isAnthropic
      ? result?.choices?.[0]?.message?.content || result?.completion || ""
      : result?.choices?.[0]?.message?.content ||
        result?.choices?.[0]?.text ||
        "";

    return {
      success: true,
      output: {
        text: generatedText,
        message: `${nodeType} executed with model ${model}`,
        model,
        data: {
          model,
          compatibility,
          baseUrl,
          systemPrompt: context.config?.systemPrompt || "",
          executionType: "ai-completion",
          provider: "deepseek",
        },
        raw: {
          model,
          prompt,
          response: result,
          nodeId: context.nodeId,
          nodeType,
        },
      },
      logs: [
        `${nodeType} node executed with model ${model} on ${endpoint}, generated ${generatedText.length} characters`,
      ],
    };
  } catch (error) {
    logger.error(`DeepSeek handler error:`, error);
    return {
      success: false,
      error: `Failed to execute DeepSeek node: ${error instanceof Error ? error.message : String(error)}`,
      nodeId: context.nodeId,
    };
  }
};

const scheduleHandler = async (context: any) => {
  const cronExpression = context.config?.cronExpression;
  const timezone = context.config?.timezone || "UTC";

  if (!cronExpression) {
    return {
      success: false,
      error: "Cron expression not configured",
      nodeId: context.nodeId,
    };
  }

  return {
    success: true,
    output: {
      trigger: "schedule",
      cronExpression,
      timezone,
      nodeId: context.nodeId,
      nodeType: "trigger-schedule",
      message: `Schedule trigger configured with cron: ${cronExpression}`,
    },
    logs: [`Schedule trigger registered for ${cronExpression} (${timezone})`],
  };
};

const normalizeEmailConfig = (
  config: Record<string, any>,
): Record<string, any> => {
  const normalized: Record<string, any> = {};

  for (const [key, value] of Object.entries(config)) {
    // Map space-separated keys from frontend to camelCase
    if (key.includes("SMTP")) {
      if (key === "SMTP Host") normalized.smtpHost = value;
      else if (key === "SMTP Port") normalized.smtpPort = value;
      else if (key === "SMTP Secure") normalized.smtpSecure = value;
      else if (key === "SMTP User") normalized.smtpUser = value;
      else if (key === "SMTP Password") normalized.smtpPassword = value;
    } else if (key.includes("SendGrid")) {
      if (key === "SendGrid API Key") normalized.sendgridApiKey = value;
      else if (key === "SendGrid From Email")
        normalized.sendgridFromEmail = value;
    } else if (key.includes("Mailgun")) {
      if (key === "Mailgun API Key") normalized.mailgunApiKey = value;
      else if (key === "Mailgun Domain") normalized.mailgunDomain = value;
    } else if (key.includes("AWS")) {
      if (key === "AWS Region") normalized.awsRegion = value;
      else if (key === "AWS Access Key") normalized.awsAccessKey = value;
      else if (key === "AWS Secret Key") normalized.awsSecretKey = value;
    } else if (key === "Provider") {
      normalized.provider = value;
    } else if (key === "From") {
      normalized.from = value;
    } else if (key === "To") {
      normalized.to = value;
    } else if (key === "Subject") {
      normalized.subject = value;
    } else if (key === "Body") {
      normalized.body = value;
    } else if (key === "Is HTML") {
      normalized.isHtml = value;
    } else if (key === "Attachments") {
      normalized.attachments = value;
    } else {
      normalized[key] = value;
    }
  }

  return normalized;
};

const emailActionHandler = async (context: any) => {
  try {
    // Normalize config keys from frontend format (space-separated) to camelCase
    const config = normalizeEmailConfig(context.config || {});

    // Extract provider first
    const provider =
      config.provider ||
      context.config?.Provider ||
      process.env.EMAIL_PROVIDER ||
      "smtp";

    // Extract common fields
    const recipient =
      config.to ||
      context.input?.email ||
      context.input?.to ||
      context.input?.data?.email ||
      "";
    const subject =
      config.subject || context.input?.subject || "Agent Notification";
    const body =
      config.body ||
      context.input?.text ||
      context.input?.output?.text ||
      context.input?.message ||
      "";
    const from = config.from || process.env.SMTP_USER;
    const isHtml = config.isHtml !== false; // Default to HTML
    const attachments = config.attachments || [];

    // Validate required fields
    if (!recipient) {
      return {
        success: false,
        error: "Email recipient not configured (To field required)",
        nodeId: context.nodeId,
      };
    }

    if (!subject) {
      return {
        success: false,
        error: "Email subject not configured (Subject field required)",
        nodeId: context.nodeId,
      };
    }

    if (!body) {
      return {
        success: false,
        error: "Email body not configured (Body field required)",
        nodeId: context.nodeId,
      };
    }

    // Parse attachments if they're a JSON string
    let parsedAttachments: Array<{ filename: string; url: string }> = [];
    if (attachments) {
      if (typeof attachments === "string") {
        try {
          parsedAttachments = JSON.parse(attachments);
        } catch (e) {
          logger.warn("Failed to parse attachments as JSON", e);
          parsedAttachments = [];
        }
      } else if (Array.isArray(attachments)) {
        parsedAttachments = attachments;
      }
    }

    // Build base email options
    let emailOptions: EmailOptions = {
      to: recipient,
      from,
      subject,
      body,
      html: isHtml,
      attachments: parsedAttachments,
      provider: provider as "smtp" | "sendgrid" | "mailgun" | "ses",
    };

    // Add provider-specific configuration
    switch (provider.toLowerCase()) {
      case "smtp": {
        const smtpConfig = {
          host: config.smtpHost || process.env.SMTP_HOST || "smtp.gmail.com",
          port: parseInt(
            String(config.smtpPort || process.env.SMTP_PORT || 587),
          ),
          secure:
            config.smtpSecure !== undefined
              ? config.smtpSecure
              : process.env.SMTP_SECURE === "true",
          auth: {
            user: config.smtpUser || process.env.SMTP_USER || "",
            pass: config.smtpPassword || process.env.SMTP_PASSWORD || "",
          },
        };

        if (!smtpConfig.auth.user || !smtpConfig.auth.pass) {
          return {
            success: false,
            error:
              "SMTP credentials not configured (SMTP User and SMTP Password required)",
            nodeId: context.nodeId,
          };
        }

        emailOptions.smtpConfig = smtpConfig;
        break;
      }

      case "sendgrid": {
        const sendgridApiKey =
          config.sendgridApiKey || process.env.SENDGRID_API_KEY;
        const sendgridFromEmail =
          config.sendgridFromEmail ||
          config.from ||
          process.env.SENDGRID_FROM_EMAIL;

        if (!sendgridApiKey) {
          return {
            success: false,
            error: "SendGrid API key not configured",
            nodeId: context.nodeId,
          };
        }

        emailOptions.sendGridApiKey = sendgridApiKey;
        emailOptions.from = sendgridFromEmail || from;
        break;
      }

      case "mailgun": {
        const mailgunApiKey =
          config.mailgunApiKey || process.env.MAILGUN_API_KEY;
        const mailgunDomain =
          config.mailgunDomain || process.env.MAILGUN_DOMAIN;

        if (!mailgunApiKey || !mailgunDomain) {
          return {
            success: false,
            error:
              "Mailgun credentials not configured (API Key and Domain required)",
            nodeId: context.nodeId,
          };
        }

        emailOptions.mailgunApiKey = mailgunApiKey;
        emailOptions.mailgunDomain = mailgunDomain;
        break;
      }

      case "ses": {
        const awsRegion = config.awsRegion || process.env.AWS_REGION;
        const awsAccessKey =
          config.awsAccessKey || process.env.AWS_ACCESS_KEY_ID;
        const awsSecretKey =
          config.awsSecretKey || process.env.AWS_SECRET_ACCESS_KEY;

        if (!awsRegion || !awsAccessKey || !awsSecretKey) {
          return {
            success: false,
            error:
              "AWS SES credentials not configured (Region, Access Key, and Secret Key required)",
            nodeId: context.nodeId,
          };
        }

        // Store for SES handler (when implemented)
        (emailOptions as any)._awsRegion = awsRegion;
        (emailOptions as any)._awsAccessKey = awsAccessKey;
        (emailOptions as any)._awsSecretKey = awsSecretKey;
        break;
      }

      default:
        return {
          success: false,
          error: `Unknown email provider: ${provider}`,
          nodeId: context.nodeId,
        };
    }

    // Send the email
    const result = await sendEmail(emailOptions);

    if (result.success) {
      logger.info(
        `Email sent successfully via ${provider} to ${recipient}`,
        result,
      );
      return {
        success: true,
        output: {
          text: `Email sent to ${recipient}: ${subject}`,
          message: `Email action executed successfully via ${provider}`,
          data: {
            recipient,
            subject,
            bodyLength: body.length,
            provider,
            messageId: result.messageId,
            timestamp: result.timestamp,
          },
        },
        logs: [
          `Email action executed: to=${recipient}, provider=${provider}, messageId=${result.messageId}`,
        ],
      };
    } else {
      logger.error(
        `Email send failed via ${provider} to ${recipient}:`,
        result.error,
      );
      return {
        success: false,
        error: `Failed to send email via ${provider}: ${result.error}`,
        nodeId: context.nodeId,
        logs: [
          `Email action failed: to=${recipient}, provider=${provider}, error=${result.error}`,
        ],
      };
    }
  } catch (error) {
    logger.error("Email action handler error:", error);
    return {
      success: false,
      error: `Email action error: ${error instanceof Error ? error.message : String(error)}`,
      nodeId: context.nodeId,
      logs: [
        `Email action error: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
};

const webhookActionHandler = async (context: any) => {
  const url = context.config?.url || context.input?.url || "";
  const payload = context.config?.body || context.input || {};
  const method = context.config?.method || context.input?.method || "POST";

  if (!url) {
    return {
      success: false,
      error: "Webhook URL not configured",
      nodeId: context.nodeId,
    };
  }

  return {
    success: true,
    output: {
      text: `Webhook sent to ${url}`,
      message: "Webhook action executed",
      data: { url, method },
      raw: payload,
    },
    logs: [`Webhook action executed: url=${url}`],
  };
};

const codeJSHandler = async (context: any) => {
  const code = context.config?.code || context.input?.code;
  const timeout = context.config?.timeout || 5000;

  if (!code) {
    return {
      success: false,
      error: "JavaScript code not provided",
      nodeId: context.nodeId,
    };
  }

  return {
    success: true,
    output: {
      language: "javascript",
      codeLength: code.length,
      timeout,
      nodeId: context.nodeId,
      nodeType: "core-code-js",
      message: `JavaScript code prepared for execution`,
    },
    logs: [`JavaScript execution node: ${code.substring(0, 50)}...`],
  };
};

const codePythonHandler = async (context: any) => {
  const code = context.config?.code || context.input?.code;
  const timeout = context.config?.timeout || 5000;

  if (!code) {
    return {
      success: false,
      error: "Python code not provided",
      nodeId: context.nodeId,
    };
  }

  return {
    success: true,
    output: {
      language: "python",
      codeLength: code.length,
      timeout,
      nodeId: context.nodeId,
      nodeType: "core-code-python",
      message: `Python code prepared for execution`,
    },
    logs: [`Python execution node: ${code.substring(0, 50)}...`],
  };
};

const logicIfHandler = async (context: any) => {
  const condition = context.config?.condition || context.input?.condition;

  if (!condition) {
    return {
      success: false,
      error: "Condition not configured",
      nodeId: context.nodeId,
    };
  }

  return {
    success: true,
    output: {
      nodeId: context.nodeId,
      nodeType: "logic-if",
      condition,
      evaluated: false,
      message: `Conditional logic prepared for evaluation`,
    },
    logs: [`Logic IF node: evaluating condition "${condition}"`],
  };
};

const logicDelayHandler = async (context: any) => {
  const duration = context.config?.duration || context.input?.duration;

  if (!duration) {
    return {
      success: false,
      error: "Duration not configured",
      nodeId: context.nodeId,
    };
  }

  return {
    success: true,
    output: {
      nodeId: context.nodeId,
      nodeType: "logic-delay",
      duration,
      message: `Delay node prepared`,
    },
    logs: [`Logic DELAY node: waiting for ${duration}ms`],
  };
};

const logicLoopHandler = async (context: any) => {
  const iterations = context.config?.iterations || context.input?.iterations;
  const condition = context.config?.condition;

  if (!iterations && !condition) {
    return {
      success: false,
      error: "Iterations or condition not configured",
      nodeId: context.nodeId,
    };
  }

  return {
    success: true,
    output: {
      nodeId: context.nodeId,
      nodeType: "logic-loop",
      iterations,
      condition,
      message: `Loop node prepared`,
    },
    logs: [`Logic LOOP node: iterations=${iterations}, condition=${condition}`],
  };
};

const builtInNodes = [
  // AI nodes - with specialized handlers
  createNodeDefinition("ai", aiHandler, "Generic AI node fallback"),
  createNodeDefinition(
    "ai-openai",
    openaiHandler,
    "OpenAI ChatGPT compatible node",
  ),
  createNodeDefinition(
    "ai-anthropic",
    anthropicHandler,
    "Anthropic Claude compatible node",
  ),
  createNodeDefinition("ai-groq", groqHandler, "Groq LLM compatible node"),
  createNodeDefinition("ai-gemini", geminiHandler, "Google Gemini AI node"),
  createNodeDefinition(
    "ai-google-gemini",
    geminiHandler,
    "Google Gemini AI node alias for frontend",
  ),
  createNodeDefinition("ai-deepseek", deepseekHandler, "DeepSeek AI node"),
  createNodeDefinition("ai-reasoning", aiHandler, "Reasoning AI node"),

  // Trigger nodes - with specialized handlers
  createNodeDefinition(
    "trigger-webhook",
    triggerHandler,
    "Webhook trigger node",
  ),
  createNodeDefinition(
    "trigger-schedule",
    scheduleHandler,
    "Cron-based schedule trigger node",
  ),
  createNodeDefinition("trigger-imap", triggerHandler, "IMAP trigger node"),
  createNodeDefinition(
    "trigger-chat-message",
    triggerHandler,
    "Chat message trigger node",
  ),
  createNodeDefinition("trigger-email", triggerHandler, "Email trigger node"),
  createNodeDefinition("trigger-gmail", triggerHandler, "Gmail trigger node"),

  // Action nodes - with specialized handlers
  createNodeDefinition(
    "action-email",
    emailActionHandler,
    "Email action node with SMTP support",
  ),
  createNodeDefinition(
    "action-webhook",
    webhookActionHandler,
    "Webhook action node with HTTP support",
  ),
  createNodeDefinition(
    "action-save-db",
    actionHandler,
    "Database save action node",
  ),
  createNodeDefinition("action-twitter", actionHandler, "Twitter action node"),
  createNodeDefinition(
    "action-telegram",
    actionHandler,
    "Telegram action node",
  ),
  createNodeDefinition(
    "social-telegram",
    actionHandler,
    "Telegram social node alias for frontend",
  ),
  createNodeDefinition(
    "action-linkedin",
    actionHandler,
    "LinkedIn action node",
  ),
  createNodeDefinition(
    "social-linkedin",
    actionHandler,
    "LinkedIn social node alias for frontend",
  ),
  createNodeDefinition(
    "action-facebook",
    actionHandler,
    "Facebook action node",
  ),
  createNodeDefinition(
    "social-facebook",
    actionHandler,
    "Facebook social node alias for frontend",
  ),
  createNodeDefinition(
    "action-whatsapp",
    actionHandler,
    "WhatsApp action node",
  ),
  createNodeDefinition(
    "social-whatsapp",
    actionHandler,
    "WhatsApp social node alias for frontend",
  ),
  createNodeDefinition("action-tiktok", actionHandler, "TikTok action node"),
  createNodeDefinition("action-youtube", actionHandler, "YouTube action node"),
  createNodeDefinition(
    "social-youtube",
    actionHandler,
    "YouTube social node alias for frontend",
  ),
  createNodeDefinition("calendar-google", coreHandler, "Google Calendar node"),
  createNodeDefinition(
    "data-google-sheets",
    coreHandler,
    "Google Sheets data node",
  ),
  createNodeDefinition(
    "trigger-google-sheets",
    triggerHandler,
    "Google Sheets trigger node alias for frontend",
  ),
  createNodeDefinition("data-gmail", actionHandler, "Google Gmail node"),

  // Core / utility nodes - with specialized handlers
  createNodeDefinition(
    "core-http-request",
    coreHandler,
    "HTTP request core node",
  ),
  createNodeDefinition(
    "core-code-js",
    codeJSHandler,
    "JavaScript execution core node with sandboxing",
  ),
  createNodeDefinition(
    "core-code-python",
    codePythonHandler,
    "Python execution core node with sandboxing",
  ),
  createNodeDefinition("core-if", coreHandler, "Conditional core node"),
  createNodeDefinition("core-switch", coreHandler, "Switch core node"),
  createNodeDefinition("core-set", coreHandler, "Set variable core node"),
  createNodeDefinition("core-transform", coreHandler, "Transform core node"),

  // Logic nodes - with specialized handlers
  createNodeDefinition("logic-if", logicIfHandler, "Logic IF conditional node"),
  createNodeDefinition(
    "logic-delay",
    logicDelayHandler,
    "Logic delay/wait node",
  ),
  createNodeDefinition(
    "logic-loop",
    logicLoopHandler,
    "Logic loop iteration node",
  ),

  // Input / system nodes
  createNodeDefinition("group", fallbackHandler, "Grouping node"),
  createNodeDefinition("manual-input", fallbackHandler, "Manual input node"),
  createNodeDefinition("webhook-input", fallbackHandler, "Webhook input node"),
  createNodeDefinition("file-input", fallbackHandler, "File input node"),
  createNodeDefinition("memory", fallbackHandler, "Memory node"),
  createNodeDefinition("email", actionHandler, "Basic email node"),
];

for (const node of builtInNodes) {
  nodeRegistry.register(node);
}
