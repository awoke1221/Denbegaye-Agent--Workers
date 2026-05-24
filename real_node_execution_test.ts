import { executeWorkflow } from "./src/utils/agentEngine";

const openaiKey = process.env.OPENAI_API_KEY?.trim();
const geminiKey =
  process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
const provider = openaiKey ? "openai" : geminiKey ? "gemini" : null;
const apiKey = provider === "openai" ? openaiKey : geminiKey;

if (!provider || !apiKey) {
  console.error(
    "Missing API key. Set OPENAI_API_KEY or GEMINI_API_KEY/GOOGLE_API_KEY before running this test.",
  );
  process.exit(1);
}

const nodes = [
  {
    id: "search_tool",
    type: "web-search",
    config: {
      query: "Denbegaye Agent Workers",
      provider: "duckduckgo",
      maxResults: 3,
      description: "Search tool for web queries",
    },
  },
  {
    id: "http_tool",
    type: "core-http-request",
    config: {
      url: "https://httpbin.org/get?query=Denbegaye+Agent+Workers",
      method: "GET",
      description: "HTTP request tool",
    },
  },
  {
    id: "agent",
    type: "denbegaye-agent",
    config: {
      provider,
      apiKey,
      model: provider === "openai" ? "gpt-4o-mini" : "gemini-2.5-flash",
      task: "Use the available tools to answer: what can you learn about Denbegaye Agent Workers from the web and from a sample HTTP request? If a tool is useful, use TOOL_CALL to invoke it.",
      systemPrompt:
        "You are a Denbegaye autonomous agent. Use available tools by returning TOOL_CALL JSON when appropriate.",
      temperature: 0.2,
    },
  },
];

const edges = [
  { source: "search_tool", target: "agent" },
  { source: "http_tool", target: "agent" },
];

console.log("Starting real tool-node execution test...");

(async () => {
  const result = await executeWorkflow(
    nodes,
    edges,
    {},
    {},
    `real-tool-exec-${Date.now()}`,
    "test-user",
    "test-agent",
    {
      onNodeStart: (nodeId) => console.log(`[node-start] ${nodeId}`),
      onNodeComplete: (nodeId, success, error) =>
        console.log(
          `[node-complete] ${nodeId} success=${success} error=${error ?? "none"}`,
        ),
      onExecutionComplete: (finalResult) =>
        console.log(
          "[execution-complete]",
          JSON.stringify(finalResult, null, 2),
        ),
    },
  );

  console.log("Final result:", JSON.stringify(result, null, 2));
})();
