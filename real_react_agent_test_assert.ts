import { executeWorkflow } from "./src/utils/agentEngine";

const openaiKey = process.env.OPENAI_API_KEY?.trim();
const geminiKey = (
  process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
)?.trim();
const provider = openaiKey ? "openai" : geminiKey ? "gemini" : null;
const apiKey = provider === "openai" ? openaiKey : geminiKey;

if (!provider || !apiKey) {
  console.error(
    "Missing API key. Set OPENAI_API_KEY or GEMINI_API_KEY/GOOGLE_API_KEY before running this test.",
  );
  process.exit(2);
}

const nodes = [
  {
    id: "search_tool",
    type: "web-search",
    config: {
      query: "Denbegaye Agent Workers",
      provider: "duckduckgo",
      maxResults: 3,
    },
  },
  {
    id: "http_tool",
    type: "core-http-request",
    config: {
      url: "https://httpbin.org/get?query=Denbegaye+Agent+Workers",
      method: "GET",
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
        process.env.REACT_AGENT_TASK ||
        "Use available tools to gather factual information about Denbegaye Agent Workers.",
      systemPrompt:
        "You are a ReAct agent. Respond only with a JSON object containing keys: thought, action, actionInput, finalAnswer.",
      maxIterations: 5,
      temperature: 0.2,
    },
  },
];

const edges = [
  { source: "search_tool", target: "react_agent" },
  { source: "http_tool", target: "react_agent" },
];

(async () => {
  try {
    const result = await executeWorkflow(
      nodes,
      edges,
      {},
      {},
      `react-agent-assert-${Date.now()}`,
      "test-user",
      "test-agent",
    );
    console.log(
      "Execution result summary:",
      JSON.stringify(
        { success: result.success, nodeStatuses: result.nodeStatuses },
        null,
        2,
      ),
    );

    if (!result.success) {
      console.error("Workflow reported failure");
      process.exit(3);
    }

    const reactNode = result.output?.react_agent;
    const httpNode = result.output?.http_tool;
    const searchNode = result.output?.search_tool;

    const errors: string[] = [];

    if (!reactNode || reactNode.success !== true)
      errors.push("react_agent did not succeed");
    if (!httpNode || httpNode.success !== true)
      errors.push("http_tool did not succeed");
    if (!searchNode || searchNode.success !== true)
      errors.push("search_tool did not succeed");

    // Check for finalAnswer presence
    const finalAnswer =
      reactNode?.output?.data?.finalAnswer || reactNode?.output?.text;
    if (!finalAnswer || String(finalAnswer).trim().length === 0)
      errors.push("react_agent finalAnswer missing or empty");

    if (errors.length > 0) {
      console.error("Assertions failed:", errors.join("; "));
      console.error("Full output:", JSON.stringify(result, null, 2));
      process.exit(4);
    }

    console.log("All assertions passed.");
    process.exit(0);
  } catch (err: any) {
    console.error("Test run error:", err?.message || err);
    process.exit(5);
  }
})();
