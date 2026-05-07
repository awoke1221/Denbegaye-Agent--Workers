# LangGraph Quick Start Guide

## Installation & Setup

### 1. Install Dependencies

```bash
# Backend
cd "C:\Users\hp\Documents\Denbegaye Agent  Workers"
npm install

# Frontend
cd "C:\Users\hp\Documents\Denbegaye Agent"
npm install socket.io-client
```

### 2. Environment Setup

**Backend (.env.local)**

```env
# Existing variables...
PORT=3001
FRONTEND_URL=http://localhost:3000

# LLM API Keys
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
ANTHROPIC_API_KEY=...
```

**Frontend (.env.local)**

```env
NEXT_PUBLIC_WORKERS_URL=http://localhost:3001
```

### 3. Start Services

```bash
# Terminal 1: Backend
cd "C:\Users\hp\Documents\Denbegaye Agent  Workers"
npm run dev

# Terminal 2: Frontend
cd "C:\Users\hp\Documents\Denbegaye Agent"
npm run dev
```

## Basic Usage

### Backend: Execute a Workflow

```typescript
import { createWorkflowBuilder } from "@/utils/langgraphWorkflowBuilder";

// Create builder
const builder = createWorkflowBuilder({
  workflowId: "wf_001",
  executionId: "exec_001",
  userId: "user_001",
  nodes: [
    {
      id: "ai_chat",
      type: "ai-chat",
      config: { model: "gpt-4", temperature: 0.7 },
    },
  ],
  edges: [],
  apiKeys: { openai_api_key: process.env.OPENAI_API_KEY },
  enableStreaming: true,
});

// Subscribe to events
builder.onStream((event) => {
  console.log("Stream event:", event.type, event.data);
});

// Execute
const result = await builder.execute({ query: "Hello" });
console.log("Result:", result);
```

### Frontend: Execute a Workflow

```typescript
import { useLangGraphExecution, useLangGraphConnection } from "@/hooks/use-langgraph";
import { useSession } from "next-auth/react";

export function MyAgentComponent() {
  const { data: session } = useSession();
  const { connect, isConnected } = useLangGraphConnection();
  const { state, executeAgent } = useLangGraphExecution();

  // Connect on mount
  useEffect(() => {
    if (session?.user) {
      connect(session.user.id);
    }
  }, [session]);

  // Execute agent
  const handleExecute = async () => {
    await executeAgent({
      nodes: [
        {
          id: "node1",
          type: "ai-chat",
          config: { model: "gpt-4" }
        }
      ],
      edges: [],
      input: { query: "test" },
      apiKeys: { openai_api_key: "sk-..." },
    });
  };

  return (
    <div>
      <button
        onClick={handleExecute}
        disabled={!isConnected || state.status === "running"}
      >
        Execute
      </button>
      <p>Status: {state.status}</p>
      <p>Progress: {state.progress}%</p>
      {state.logs.map((log, i) => <p key={i}>{log}</p>)}
    </div>
  );
}
```

### With Agent Execution Monitor Component

```typescript
import { AgentExecutionMonitor } from "@/components/AgentExecutionMonitor";

export function AgentBuilder() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [input, setInput] = useState({});
  const [apiKeys, setApiKeys] = useState({});

  return (
    <div>
      {/* Your graph canvas */}
      <div>Graph Builder UI</div>

      {/* Execution Monitor */}
      <AgentExecutionMonitor
        nodes={nodes}
        edges={edges}
        input={input}
        apiKeys={apiKeys}
      />
    </div>
  );
}
```

## Key APIs

### REST Endpoints

```bash
# Execute workflow
curl -X POST http://localhost:3001/api/langgraph/execute \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{
    "nodes": [...],
    "edges": [...],
    "input": {...},
    "apiKeys": {...}
  }'

# Get execution status
curl http://localhost:3001/api/langgraph/status/exec_001 \
  -H "Authorization: Bearer token"

# Cancel execution
curl -X POST http://localhost:3001/api/langgraph/cancel/exec_001 \
  -H "Authorization: Bearer token"

# Validate workflow
curl -X POST http://localhost:3001/api/langgraph/validate \
  -H "Authorization: Bearer token" \
  -d '{"nodes": [...], "edges": [...]}'
```

### WebSocket Events

```typescript
// Connect
const socket = io("http://localhost:3001", {
  auth: { token: "your-token" },
});

// Subscribe to execution
socket.emit("subscribe:execution", "exec_001");

// Listen to updates
socket.on("execution:update", (event) => {
  console.log("Stream event:", event);
});

// Cancel execution
socket.emit("cancel:execution", "exec_001");

// Get status
socket.emit("get:execution-status", "exec_001");
socket.on("execution:status", (data) => {
  console.log("Status:", data);
});
```

## Common Patterns

### 1. Sequential Execution

```typescript
const nodes = [
  { id: "step1", type: "ai-chat", config: {...} },
  { id: "step2", type: "http-request", config: {...} },
  { id: "step3", type: "ai-chat", config: {...} },
];

const edges = [
  { source: "step1", target: "step2" },
  { source: "step2", target: "step3" },
];
```

### 2. Conditional Branching

```typescript
const edges = [
  {
    source: "decision",
    target: "branch_yes",
    condition: (state) => state.nodeResults.decision.result === true,
  },
  {
    source: "decision",
    target: "branch_no",
    condition: (state) => state.nodeResults.decision.result === false,
  },
];
```

### 3. Real-time Monitoring

```typescript
const { state, executeAgent } = useLangGraphExecution();

useEffect(() => {
  // Log when nodes complete
  state.logs.forEach((log) => console.log(log));
}, [state.logs]);

useEffect(() => {
  // Show errors in UI
  if (state.errors.length > 0) {
    showErrorNotification(state.errors[0]);
  }
}, [state.errors]);

useEffect(() => {
  // Update progress bar
  updateProgressBar(state.progress);
}, [state.progress]);
```

### 4. Error Handling

```typescript
const handleExecute = async () => {
  try {
    await executeAgent(config);
  } catch (error) {
    console.error("Execution failed:", error);
    showErrorToast(error.message);
  }
};

// Or via state
useEffect(() => {
  if (state.status === "failed" && state.errors.length > 0) {
    handleExecutionError(state.errors);
  }
}, [state.status, state.errors]);
```

### 5. Tool Integration

```typescript
// Tools are automatically available to LLMs
// Nodes become tools automatically

// In a workflow with AI nodes:
const nodes = [
  {
    id: "ai_agent",
    type: "ai-chat",
    config: {
      model: "gpt-4",
      // Can use tools: ["http-request", "email", "webhook", etc.]
      tools: ["http-request", "search"],
    },
  },
];
```

## Debugging

### Enable Debug Logging

```typescript
// Backend
process.env.DEBUG = "langgraph:*";

// Frontend
localStorage.setItem("debug", "langgraph:*");
```

### Inspect Stream Events

```typescript
builder.onStream((event) => {
  console.log(`[${event.type}]`, {
    nodeId: event.nodeId,
    data: event.data,
    timestamp: event.timestamp,
  });
});
```

### Check Execution State

```typescript
// Get current state during/after execution
const { state } = useLangGraphExecution();

console.log({
  executionId: state.executionId,
  status: state.status,
  progress: state.progress,
  currentNode: state.currentNode,
  logs: state.logs.length,
  errors: state.errors.length,
  output: state.output,
});
```

## Troubleshooting

### WebSocket Connection Failed

```typescript
// Check connection
const { isConnected, error } = useLangGraphConnection();

if (!isConnected) {
  console.error("Connection failed:", error);
  // Reconnect
  await connect(token);
}
```

### Execution Timeout

```typescript
// Increase timeout
const result = await streamingExecutionEngine.waitForCompletion(
  executionId,
  120000, // 2 minutes
);
```

### Tool Not Found

```typescript
// Ensure tool is registered
const { valid, errors } = await langGraphClient.validateWorkflow(nodes, edges);

if (!valid) {
  console.error("Validation errors:", errors);
}
```

## Performance Tips

1. **Enable Streaming**: Real-time updates without waiting
2. **Use WebSocket**: More efficient than polling
3. **Batch Requests**: Group multiple operations
4. **Cache LLM Instances**: Avoid recreating
5. **Monitor Memory**: Check long-term memory size
6. **Parallel Execution**: Configure concurrent nodes

## Next Steps

1. Read [LANGGRAPH_IMPLEMENTATION.md](./LANGGRAPH_IMPLEMENTATION.md) for architecture details
2. Check example components in `/components`
3. Review test files in `/tests` (if available)
4. Integrate with your existing workflows
5. Deploy to staging for testing
6. Migrate from old system gradually

## Support & Resources

- [LangChain Docs](https://js.langchain.com/)
- [LangGraph Docs](https://github.com/langchain-ai/langgraphjs)
- [Socket.IO Docs](https://socket.io/docs/v4/client-api/)
- Project Documentation: [LANGGRAPH_IMPLEMENTATION.md](./LANGGRAPH_IMPLEMENTATION.md)
