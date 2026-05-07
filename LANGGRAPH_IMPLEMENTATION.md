# LangChain LangGraph Migration - Advanced Implementation Guide

## Overview

This document describes the advanced conversion of the Denbegaye agent execution system from custom topological sorting to **LangChain LangGraph** with streaming execution, memory integration, and real-time frontend updates.

## Architecture

### Backend Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Express Server                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │          LangGraph Routes (/api/langgraph)           │   │
│  │  - POST /execute (RESTful execution)                 │   │
│  │  - GET /status/:id (get execution status)            │   │
│  │  - POST /cancel/:id (cancel execution)               │   │
│  │  - POST /validate (validate workflow)                │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │          WebSocket Handler                            │   │
│  │  (Real-time streaming with Socket.IO)                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         ↓                                        ↓
┌──────────────────────┐         ┌──────────────────────────┐
│  Advanced Workflow   │         │ Streaming Execution      │
│  Builder             │         │ Engine                   │
│                      │         │                          │
│ - Graph Topology     │         │ - Stream Event Management│
│ - Node Execution     │         │ - Active Execution Track│
│ - Conditional Routes │         │ - Subscription System    │
└──────────────────────┘         └──────────────────────────┘
         ↓                                        ↓
┌──────────────────────────────────────────────────────────────┐
│               LangGraph State System                          │
│                                                               │
│  AgentState (Annotation-based state management)              │
│  - Messages                                                  │
│  - Variables & Configuration                                │
│  - Memory (Short & Long-term)                                │
│  - Node Results & Execution Tracking                         │
│  - Logs, Errors & Metrics                                    │
└──────────────────────────────────────────────────────────────┘
         ↓                                        ↓
┌─────────────────────────────────────┐  ┌──────────────────┐
│   Advanced Tool Registry            │  │  LLM Factory     │
│                                     │  │                  │
│ - Node-as-Tools Conversion          │  │ - OpenAI         │
│ - LangChain Tool Wrapping           │  │ - Gemini         │
│ - Tool Execution with Streaming     │  │ - Anthropic      │
│ - Context & Error Handling          │  │ - Deepseek       │
└─────────────────────────────────────┘  └──────────────────┘
         ↓                                        ↓
┌──────────────────────────────────────────────────────────────┐
│                    Node Registry                             │
│  (Existing node implementations with enhanced support)       │
└──────────────────────────────────────────────────────────────┘
```

### Frontend Architecture

```
┌─────────────────────────────────────────────────────────┐
│           Next.js Application (/agent-builder)          │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Agent Builder Components                         │  │
│  │  - Graph Canvas (existing)                        │  │
│  │  - Execution Monitor (new)                        │  │
│  │  - Real-time Logs (new)                           │  │
│  │  - Stream Events Panel (new)                      │  │
│  └───────────────────────────────────────────────────┘  │
│                                                           │
│  ┌───────────────────────────────────────────────────┐  │
│  │  React Hooks (new)                                │  │
│  │  - useLangGraphExecution()                        │  │
│  │  - useLangGraphConnection()                       │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│      Advanced LangGraph Client Library                   │
│                                                           │
│  AdvancedLangGraphClient                                 │
│  - WebSocket Connection Management                       │
│  - REST API Integration                                  │
│  - Stream Event Handling                                 │
│  - Execution Lifecycle Management                        │
│  - Real-time Progress Tracking                           │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│      Backend (LangGraph Routes & WebSocket)             │
└─────────────────────────────────────────────────────────┘
```

## Core Components

### 1. LangGraph State System (`langgraphState.ts`)

**Key Features:**

- Annotation-based state management with LangGraph
- Reducer functions for state aggregation
- Comprehensive state tracking:
  - Execution context (workflow ID, user, execution ID)
  - Variables and configuration
  - Memory systems (short-term and long-term)
  - Node results and execution history
  - Logs, errors, and metrics
  - Streaming events
  - Tool calls and results

**Key Types:**

- `AgentState`: Core state annotation
- `AgentStateType`: Type-safe state interface
- `ExtendedAgentState`: Enhanced state with streaming config
- `NodeExecutionContext`: Context for node handlers
- `StreamEvent`: Stream event types for real-time updates

**Utilities:**

- `StateUtils`: Helper functions for state manipulation
  - `addMessage()`, `addLog()`, `addError()`
  - `updateNodeResult()`, `updateShortTermMemory()`
  - `addToLongTermMemory()` (for vector embeddings)
  - `getNodeExecutionTime()`, `getTotalExecutionTime()`
  - `canRetry()`: Check retry eligibility

### 2. Advanced Tool Registry (`langgraphToolRegistry.ts`)

**Key Features:**

- Converts all node types to LangChain tools
- Wraps nodes as `StructuredTool` instances
- Manages tool lifecycle and registry

**Classes:**

- `LangGraphNodeTool`: Node wrapper as LangChain tool
- `AdvancedToolRegistry`: Central tool management
- `AdvancedToolExecutor`: Tool execution with streaming support

**Key Methods:**

```typescript
registry.registerNodeTool(nodeId, nodeType, nodeConfig, apiKeys);
executor.executeTool(toolName, input, state);
executor.executeNodeTool(nodeId, input, state);
```

### 3. Advanced Workflow Builder (`langgraphWorkflowBuilder.ts`)

**Key Features:**

- Creates LangGraph state graphs from workflow config
- Handles node execution with streaming
- Conditional routing between nodes
- Error handling with retry logic
- Event emission for real-time updates

**Classes:**

- `AdvancedWorkflowBuilder`: Main workflow orchestrator

**Key Methods:**

```typescript
builder.execute(input); // Execute synchronously
builder.streamExecute(input); // Execute with streaming
builder.compile(); // Compile graph topology
builder.onStream(callback); // Subscribe to stream events
```

### 4. LLM Factory (`llmFactory.ts`)

**Key Features:**

- Factory pattern for LLM instance creation
- Support for multiple providers:
  - OpenAI (GPT-4, GPT-3.5)
  - Gemini (Google's generative AI)
  - Anthropic (Claude models)
  - DeepSeek (compatible)
  - Groq (compatible)
- Caching for performance

**Key Methods:**

```typescript
llmFactory.createLLM(config);
llmFactory.getLLMFromApiKeys(apiKeys, provider);
```

### 5. Streaming Execution Engine (`streamingExecutionEngine.ts`)

**Key Features:**

- Manages active execution contexts
- Subscription-based stream event delivery
- Execution cancellation support
- Timeout handling
- Active execution tracking

**Key Methods:**

```typescript
streamingExecutionEngine.executeWithStreaming(config, input, onStream);
streamingExecutionEngine.subscribe(executionId, listener);
streamingExecutionEngine.cancel(executionId);
streamingExecutionEngine.isExecuting(executionId);
streamingExecutionEngine.waitForCompletion(executionId, timeoutMs);
```

### 6. LangGraph Routes (`langgraphRoutes.ts`)

**REST Endpoints:**

```
POST /api/langgraph/execute
  Execute agent workflow
  Request: { nodes, edges, input, apiKeys, enableStreaming }
  Response: { success, executionId, output, logs, errors }

GET /api/langgraph/status/:executionId
  Get execution status
  Response: { executionId, isExecuting, activeExecutions }

POST /api/langgraph/cancel/:executionId
  Cancel execution
  Response: { success, message }

GET /api/langgraph/active-executions
  List all active executions
  Response: { count, executions }

POST /api/langgraph/validate
  Validate workflow configuration
  Request: { nodes, edges }
  Response: { valid, errors, warnings }
```

**WebSocket Events:**

```
Client → Server:
  subscribe:execution(executionId)
  cancel:execution(executionId)
  get:execution-status(executionId)

Server → Client:
  execution:update(streamEvent)
  execution:cancelled(data)
  execution:status(data)
```

### 7. Frontend Client (`advancedLangGraphClient.ts`)

**Key Features:**

- WebSocket connection management with reconnection logic
- REST API integration for execution
- Stream event handling with typed callbacks
- Execution lifecycle management

**Classes:**

- `AdvancedLangGraphClient`: Main client for frontend

**Key Methods:**

```typescript
client.connect(token);
client.disconnect();
client.executeAgent(agentData, enableStreaming);
client.executeAgentWithStreaming(agentData, options);
client.cancelExecution(executionId);
client.getExecutionStatus(executionId);
client.validateWorkflow(nodes, edges);
```

### 8. React Hooks (`use-langgraph.ts`)

**Hooks:**

```typescript
// Main execution hook
const {
  state,
  executeAgent,
  cancelExecution,
  getStatus,
  validateWorkflow,
  reset,
  isRunning,
  isCompleted,
  isFailed,
} = useLangGraphExecution();

// WebSocket connection hook
const { isConnected, error, connect, disconnect } = useLangGraphConnection();
```

**State Structure:**

```typescript
{
  executionId: string | null
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number (0-100)
  currentNode: string | null
  logs: string[]
  errors: string[]
  output: Record<string, any>
  streamEvents: StreamEvent[]
}
```

## Streaming & Real-time Updates

### Stream Event Types

```typescript
type StreamEventType =
  | "node_start" // Node execution started
  | "node_end" // Node execution completed
  | "node_error" // Node execution failed
  | "tool_call" // Tool/function called
  | "tool_result" // Tool result returned
  | "message" // Message from LLM
  | "debug" // Debug information
  | "state_update" // State changed
  | "execution_complete" // Workflow completed
  | "execution_error"; // Workflow failed
```

### Flow Example

```
1. Client: connect(token)
   ↓
2. Client: executeAgentWithStreaming(agentData, options)
   ↓
3. Backend: Validate workflow → Create graph → Execute
   ↓
4. For each node:
   - Emit: node_start
   - Execute node tools
   - Emit: tool_call → tool_result
   - Emit: node_end
   ↓
5. Backend: Emit execution_complete or execution_error
   ↓
6. Client: Receive events via:
   - WebSocket (real-time)
   - Callbacks (onNodeEnd, onNodeError, etc.)
```

## Usage Examples

### Backend Usage

```typescript
import { createWorkflowBuilder } from "@/utils/langgraphWorkflowBuilder";

const builder = createWorkflowBuilder({
  workflowId: "wf_123",
  executionId: "exec_456",
  userId: "user_789",
  nodes: [
    { id: "node1", type: "ai-chat", config: { model: "gpt-4" } },
    { id: "node2", type: "http-request", config: { url: "..." } },
  ],
  edges: [{ source: "node1", target: "node2" }],
  apiKeys: { openai_api_key: "sk-..." },
  enableStreaming: true,
});

// Execute with streaming
builder.onStream((event) => {
  console.log("Stream event:", event);
});

const result = await builder.execute(input);
```

### Frontend Usage

```typescript
import { useLangGraphExecution, useLangGraphConnection } from "@/hooks/use-langgraph";

export function MyComponent() {
  const { connect, isConnected } = useLangGraphConnection();
  const { state, executeAgent, cancelExecution } = useLangGraphExecution();

  useEffect(() => {
    connect(token);
  }, []);

  const handleExecute = async () => {
    await executeAgent({
      nodes: workflowNodes,
      edges: workflowEdges,
      input: { query: "test" },
      apiKeys: { openai_api_key: "..." },
    });
  };

  return (
    <div>
      <button onClick={handleExecute} disabled={!isConnected || state.status === 'running'}>
        Execute
      </button>

      <div>
        <p>Status: {state.status}</p>
        <p>Progress: {state.progress}%</p>
        <p>Current Node: {state.currentNode}</p>

        <div>
          <h3>Logs</h3>
          {state.logs.map((log, i) => <p key={i}>{log}</p>)}
        </div>

        {state.errors.length > 0 && (
          <div>
            <h3>Errors</h3>
            {state.errors.map((err, i) => <p key={i} className="text-red-500">{err}</p>)}
          </div>
        )}
      </div>

      {state.status === 'running' && (
        <button onClick={cancelExecution}>Cancel</button>
      )}
    </div>
  );
}
```

## Advanced Features

### 1. Memory Integration

**Short-term Memory:**

- Stores execution variables
- Available to all nodes
- Cleared between executions

**Long-term Memory:**

- Vector-based memory with embeddings
- Persists across executions
- Useful for knowledge retention

```typescript
// In node handlers or LLM chains
state = StateUtils.updateShortTermMemory(state, "key", value);
state = StateUtils.addToLongTermMemory(state, content, embedding, metadata);
```

### 2. Retry Mechanism

- Automatic retry on node failure
- Configurable max retries
- Exponential backoff support (can be added)
- Retry count tracking per node

```typescript
const canRetry = StateUtils.canRetry(state, nodeId);
if (canRetry) {
  // Retry node execution
}
```

### 3. Tool Integration

All nodes are automatically registered as LangChain tools:

```typescript
// Inside graph execution, tools can be:
// 1. Called explicitly via tool executor
// 2. Called by LLM with tool_choice
// 3. Used in tool-use workflows
```

### 4. Error Handling & Observability

- Comprehensive logging at each step
- Error tracking with stack traces
- Execution timing metrics
- State inspection at any point

```typescript
// Logs include timestamp, level, node ID, and details
state.logs.map((log) => ({
  timestamp: log.timestamp,
  level: log.level, // 'info', 'warn', 'error', 'debug'
  message: log.message,
  nodeId: log.nodeId,
  details: log.details,
}));
```

### 5. Conditional Routing

Routes between nodes based on conditions:

```typescript
edges: [
  {
    source: "check_condition",
    target: "branch_true",
    condition: (state) => state.nodeResults.check_condition.success,
  },
  {
    source: "check_condition",
    target: "branch_false",
    condition: (state) => !state.nodeResults.check_condition.success,
  },
];
```

## Migration from Old System

### Old System

```typescript
// Topological sort
const order = topologicalSort(nodes, edges);

// Sequential execution with retry
for (const nodeId of order) {
  const result = await executeNode(nodeId);
}
```

### New System

```typescript
// Automatic topology handling by LangGraph
const builder = createWorkflowBuilder(config);

// Execution with streaming and advanced features
builder.onStream(callback);
await builder.execute(input);
// OR
for await (const event of builder.streamExecute(input)) {
  // Handle streaming events
}
```

## Performance Considerations

1. **Streaming**: Real-time updates without waiting for completion
2. **State Management**: Efficient state aggregation with reducers
3. **Tool Registry**: Cached tool instances
4. **Memory**: Long-term memory pruning (implement as needed)
5. **Concurrency**: Support for parallel node execution (configurable)

## Future Enhancements

1. **Human-in-the-loop**: Pause execution for user input
2. **Branching & Loops**: More complex control flow patterns
3. **Dynamic Tool Generation**: Generate tools from node schema
4. **Observability Dashboard**: Real-time execution monitoring UI
5. **Distributed Execution**: Execute nodes on different workers
6. **Agent Pool Management**: Scale with multiple worker instances
7. **Persistent State**: Save state to database for recovery

## File Structure

```
Backend:
├── src/
│   ├── utils/
│   │   ├── langgraphState.ts           (Core state system)
│   │   ├── langgraphToolRegistry.ts    (Tool management)
│   │   ├── langgraphWorkflowBuilder.ts (Workflow orchestration)
│   │   ├── llmFactory.ts               (LLM provider factory)
│   │   ├── streamingExecutionEngine.ts (Execution engine)
│   │   └── ...
│   ├── routes/
│   │   ├── langgraphRoutes.ts          (API endpoints)
│   │   └── ...
│   └── ...

Frontend:
├── lib/
│   ├── advancedLangGraphClient.ts      (Client library)
│   └── ...
├── hooks/
│   ├── use-langgraph.ts                (React hooks)
│   └── ...
└── ...
```

## Troubleshooting

### WebSocket Connection Issues

- Check CORS configuration
- Verify token is valid
- Check firewall/proxy settings

### Streaming Not Working

- Ensure `enableStreaming: true` in config
- Check WebSocket is connected
- Verify stream callbacks are registered

### Tool Execution Errors

- Check tool schema validation
- Verify API keys are correct
- Check node configuration

### Memory Issues

- Monitor long-term memory size
- Implement pruning strategy
- Consider paginating memory retrieval

## Additional Resources

- [LangChain Documentation](https://js.langchain.com/)
- [LangGraph Documentation](https://github.com/langchain-ai/langgraphjs)
- [Socket.IO Documentation](https://socket.io/docs/v4/client-api/)
- [React Hooks Best Practices](https://react.dev/reference/react)
