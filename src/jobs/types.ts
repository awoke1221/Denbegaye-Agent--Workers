export type AgentNodeType =
  | "ai"
  | "api"
  | "email"
  | "memory"
  | "manual-input"
  | "webhook-input"
  | "file-input"
  | "ai-openai"
  | "ai-gemini"
  | "ai-deepseek"
  | "ai-google-gemini"
  | "logic-if"
  | "logic-delay"
  | "logic-loop"
  | "action-twitter"
  | "action-email"
  | "action-save-db"
  | "action-webhook"
  | "action-telegram"
  | "action-linkedin"
  | "action-facebook"
  | "action-tiktok"
  | "action-youtube"
  | "social-telegram"
  | "social-whatsapp"
  | "social-linkedin"
  | "social-facebook"
  | "social-youtube"
  | "ai-reasoning"
  | "ai-anthropic"
  | "ai-groq"
  | "trigger-webhook"
  | "trigger-schedule"
  | "trigger-imap"
  | "trigger-chat-message"
  | "trigger-google-sheets"
  | "core-http-request"
  | "core-code-js"
  | "core-code-python"
  | "core-if"
  | "core-switch"
  | "core-set"
  | "core-transform";

export interface AgentNode {
  id: string;
  type: AgentNodeType;
  config: Record<string, any>;
}

export interface AgentEdge {
  from: string;
  to: string;
}

export interface AgentExecutionJobData {
  executionId: string;
}

export interface ExecutionResult {
  success: boolean;
  output: any;
  logs: string[];
  errors?: string[];
}
