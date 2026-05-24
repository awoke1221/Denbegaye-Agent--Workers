import { executeWorkflow } from "./src/utils/agentEngine";

const openaiKey = process.env.OPENAI_API_KEY?.trim();
const geminiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
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
    id: "react_agent",
    type: "react-agent",
    config: {
      provider,
      apiKey,
      model: provider === "openai" ? "gpt-4o-mini" : "gemini-2.5-flash",
      allowedTools: [
        "web-search",
        "core-http-request",
        "core-code-js",
        "core-code-python",
        "core-set",
        "core-transform",
        "data-supabase",
        "data-gmail",
        "calendar-google",
        "action-twitter",
        "action-youtube",
        "email",
      ],
      task:
        "Use available tools to gather factual information about Denbegaye Agent Workers. If a tool is useful, call it. Return your reasoning and the final summary in the required JSON ReAct format (thought, action, actionInput, finalAnswer).",
      systemPrompt:
        "You are a ReAct agent. Reason and act using available tools. Respond only with a JSON object containing keys: thought, action, actionInput, finalAnswer. Use TOOL calls when appropriate.",
      maxIterations: 5,
      temperature: 0.2,
          model: provider === "openai" ? "gpt-4o-mini" : "gemini-2.5-flash",
          allowedTools: ["web-search", "core-http-request"],
          task: process.env.REACT_AGENT_TASK ||
            "Use available tools to gather factual information about Denbegaye Agent Workers. If a tool is useful, call it. Return your reasoning and the final summary in the required JSON ReAct format (thought, action, actionInput, finalAnswer).",
const edges = [
  { source: "search_tool", target: "react_agent" },
  { source: "http_tool", target: "react_agent" },
];

console.log("Starting end-to-end React agent test...");

(async () => {
  const result = await executeWorkflow(
    nodes,
    edges,
    {},
    {},
    `react-agent-test-${Date.now()}`,
    "test-user",
    "test-agent",
    {
      onNodeStart: (nodeId) => console.log(`[node-start] ${nodeId}`),
      onNodeComplete: (nodeId, success, error) =>
        console.log(
          `[node-complete] ${nodeId} success=${success} error=${error ?? "none"}`,
        ),
      onExecutionComplete: (finalResult) =>
        console.log("[execution-complete]", JSON.stringify(finalResult, null, 2)),
    },
  );

  console.log("Final result:", JSON.stringify(result, null, 2));
})();
