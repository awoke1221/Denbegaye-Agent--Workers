# Complete Node Architecture & Workflow System Exploration

**Last Updated:** May 17, 2026
**Scope:** Complete architectural analysis of node types, LLM integration, tool connections, memory systems, and frontend rendering

---

## Executive Summary

The Denbegaye Agent workflow system implements a **comprehensive, extensible node-based architecture** with:

- **40+ built-in node types** organized into categories (AI, Actions, Triggers, Logic, Core, Data)
- **Multi-provider LLM support** (OpenAI, Anthropic, Gemini, Groq, DeepSeek) with intelligent provider detection and caching
- **LangGraph integration** for stateful workflow orchestration with streaming and error handling
- **Template-based variable system** allowing dynamic configuration interpolation and expression evaluation
- **Supabase-backed memory system** with vector embeddings for semantic search
- **React Flow frontend** with sophisticated icon/theme registry and component composition
- **Tool registry** for parameter validation and execution tracking

---

## 1. Node Type Definition & Structure

### Backend Node Registry Pattern

**Location:** `src/nodes/index.ts` (2000+ lines)

The system uses a centralized **Map-based registry** where each node type maps to an async handler function:

```typescript
class NodeRegistry {
  private nodes: Map<string, any> = new Map();
  register(node: any) {
    /* normalize type and store */
  }
  get(type: string) {
    /* retrieve handler */
  }
}
```

**Key Pattern:** Type normalization ensures case-insensitive, hyphen-based routing:

```
"AI-OpenAI" → "ai-openai"
"CoreSet" → "core-set"
"LOGIC_IF" → "logic-if"
```

### Node Handler Signature

Every handler receives a **consistent context object**:

```typescript
interface NodeExecutionContext {
  nodeId: string; // Unique node ID in workflow
  nodeType: string; // Normalized node type
  config: Record<string, any>; // Node configuration (from editor)
  input: any; // Output from previous node(s)
  apiKeys: Record<string, any>; // All available API credentials
  variables: Record<string, any>; // Workflow-level variables
  previousOutputs: Record<string, any>; // All accumulated node results
}
```

### Standard Output Format

All handlers return a consistent structure:

```typescript
{
  success: boolean;
  output: {
    text: string;              // Human-readable result
    message: string;           // Status message
    data: Record<string, any>; // Structured data output
    model?: string;            // For AI nodes
    raw?: any;                 // Raw provider response
    variables?: Record<string, any>; // For core-set nodes
  };
  logs: string[];              // Execution logs for debugging
  error?: string;              // Error message if failed
  nodeId?: string;
}
```

---

## 2. Complete Node Type Inventory

### AI Nodes (LLM-based)

| Type           | Provider    | Pattern           | Default Model        |
| -------------- | ----------- | ----------------- | -------------------- |
| `ai`           | Auto-detect | Generic fallback  | openai → gpt-4o-mini |
| `ai-openai`    | OpenAI      | ChatGPT           | gpt-4o-mini          |
| `ai-anthropic` | Anthropic   | Claude            | claude-3.5-opus      |
| `ai-groq`      | Groq        | High-speed        | groq-1.0             |
| `ai-gemini`    | Google      | Gemini            | gemini-1.5-pro       |
| `ai-deepseek`  | DeepSeek    | V4-Flash          | deepseek-v4-flash    |
| `ai-reasoning` | Auto        | Reasoning-focused | openai               |

**Common Config:**

```json
{
  "apiKey": "sk-...",
  "model": "gpt-4o",
  "temperature": 0.7,
  "maxTokens": 1000,
  "systemPrompt": "Optional system context",
  "inputText": "{{ variables.prompt }}"
}
```

### Trigger Nodes (Workflow Entry Points)

| Type                    | Purpose        | Input Schema                   |
| ----------------------- | -------------- | ------------------------------ |
| `trigger-manual`        | User-initiated | `{ market, topic, timeScope }` |
| `trigger-webhook`       | HTTP endpoint  | POST payload                   |
| `trigger-schedule`      | Cron-based     | `{ cronExpression, timezone }` |
| `trigger-email`         | Email received | IMAP config                    |
| `trigger-gmail`         | Gmail-specific | OAuth integration              |
| `trigger-imap`          | Generic email  | IMAP server config             |
| `trigger-chat-message`  | Chat UI        | Message text                   |
| `trigger-google-sheets` | Sheet updates  | Sheet ID + range               |

### Action Nodes (External Integrations)

| Type              | Integration   | Providers                        |
| ----------------- | ------------- | -------------------------------- |
| `action-email`    | Email sending | SMTP, SendGrid, Mailgun, AWS SES |
| `action-webhook`  | HTTP POST     | Custom endpoints                 |
| `action-twitter`  | Twitter/X     | OAuth 2.0                        |
| `action-telegram` | Telegram Bot  | Bot token                        |
| `action-linkedin` | LinkedIn      | OAuth                            |
| `action-facebook` | Facebook      | Graph API                        |
| `action-whatsapp` | WhatsApp      | Cloud API                        |
| `action-youtube`  | YouTube       | Data API                         |
| `action-save-db`  | Database      | Supabase                         |

### Core/Utility Nodes (Workflow Logic)

| Type                | Purpose                | Key Features                            |
| ------------------- | ---------------------- | --------------------------------------- |
| `core-set`          | Set workflow variables | Expression evaluation, template support |
| `core-transform`    | Data transformation    | Expression-based                        |
| `core-if`           | Conditional branching  | Boolean condition evaluation            |
| `core-switch`       | Multi-branch routing   | Case-based selection                    |
| `core-http-request` | HTTP calls             | GET/POST/PUT/DELETE                     |
| `core-code-js`      | JavaScript execution   | Sandboxed (prep only)                   |
| `core-code-python`  | Python execution       | Sandboxed (prep only)                   |
| `data-supabase`     | Database CRUD          | SELECT/INSERT/UPDATE/DELETE             |
| `web-search`        | Search integration     | DuckDuckGo/SerpAPI/Brave                |

### Logic Nodes (Control Flow)

| Type          | Purpose     | Config                                |
| ------------- | ----------- | ------------------------------------- |
| `logic-if`    | Conditional | `{ condition: "input.value > 10" }`   |
| `logic-delay` | Wait/pause  | `{ delayMs: 5000 }`                   |
| `logic-loop`  | Iteration   | `{ iterations: 3, condition: "..." }` |

### Data Nodes (External Services)

| Type                 | Service         | Operations                    |
| -------------------- | --------------- | ----------------------------- |
| `data-supabase`      | Supabase        | Query, insert, update, delete |
| `data-google-sheets` | Google Sheets   | Read/write rows               |
| `data-gmail`         | Gmail           | Read messages                 |
| `calendar-google`    | Google Calendar | Add events                    |

### Input/System Nodes

| Type            | Purpose                    |
| --------------- | -------------------------- |
| `group`         | Node grouping/organization |
| `manual-input`  | User input node            |
| `webhook-input` | Webhook entry              |
| `file-input`    | File upload                |
| `memory`        | Memory read/write          |

---

## 3. LLM Selection & Integration System

### Provider Detection Logic

```typescript
const getProviderFromNodeType = (nodeType: string): string => {
  const type = nodeType.toLowerCase();
  if (type.includes("openai")) return "openai";
  if (type.includes("gemini")) return "gemini";
  if (type.includes("anthropic")) return "anthropic";
  if (type.includes("deepseek")) return "deepseek";
  if (type.includes("groq")) return "groq";
  return "openai"; // default fallback
};
```

**Supported Providers & Models:**

**OpenAI:**

- `gpt-4o` - Latest multimodal
- `gpt-4-turbo` - Fast reasoning
- `gpt-4o-mini` - Cost-effective (default)
- `gpt-3.5-turbo` - Legacy

**Anthropic:**

- `claude-3.5-opus` - Most capable (default)
- `claude-3.5-sonnet` - Balanced
- `claude-3-haiku` - Fast

**Google Gemini:**

- `gemini-1.5-pro` - Best performance
- `gemini-pro` - Standard
- `gemini-pro-vision` - Multimodal

**Groq:**

- `mixtral-8x7b`
- `llama2-70b`

**DeepSeek:**

- `deepseek-v3` - Latest
- `deepseek-v4-flash` - Fast

### LLMFactory Pattern

**Location:** `src/utils/llmFactory.ts`

```typescript
class LLMFactory {
  private cache: Map<string, BaseChatModel> = new Map();

  createLLM(config: LLMConfig): BaseChatModel {
    const cacheKey = `${config.provider}-${config.model || "default"}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!; // Return cached
    }

    // Create appropriate LangChain instance
    let llm: BaseChatModel;
    switch (config.provider) {
      case "openai":
        llm = new ChatOpenAI({
          apiKey: config.apiKey,
          modelName: config.model,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
        });
        break;
      case "anthropic":
        llm = new ChatAnthropic({
          apiKey: config.apiKey,
          modelName: config.model,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
        });
        break;
      // ... other providers
    }

    this.cache.set(cacheKey, llm);
    return llm;
  }
}
```

### AI Node Handler Pattern

```typescript
const openaiHandler = async (context: any) => {
  const apiKey = context.config?.apiKey;
  const model = context.config?.model;
  const prompt = context.config?.inputText || context.input?.text;

  if (!apiKey) {
    return {
      success: false,
      error: "API key not configured",
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
        message: `${model} executed successfully`,
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
          nodeType: context.nodeType,
        },
      },
      logs: [
        `AI node executed with ${model}, generated ${generatedText.length} characters`,
      ],
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to execute AI node: ${error.message}`,
      nodeId: context.nodeId,
    };
  }
};
```

---

## 4. Tool Connections & Memory Systems

### Tool Registry Pattern

**Location:** `src/utils/toolRegistry.ts` (Supabase-backed)

```typescript
interface ToolDefinition {
  id?: string;
  name: string;
  description: string;
  parameters: Record<string, any>; // JSON schema
  execute?: (params: Record<string, any>) => Promise<any>;
  implementation?: string;
  category?: string;
  permissions?: string[];
}

class SupabaseToolRegistry {
  async getToolById(toolId: string): Promise<ToolDefinition | null>;
  async listTools(category?: string): Promise<ToolDefinition[]>;
  async executeToolById(toolId: string, parameters): Promise<any>;
  private validateParameters(params, schema); // JSON schema validation
}
```

### Memory System Integration

**Location:** `src/utils/memorySystem.ts` (Supabase-backed with vector search)

**VectorMemory Structure:**

```typescript
interface VectorMemory {
  id: string;
  content: string;
  embedding: number[]; // 384-dimensional vector
  metadata: Record<string, any>;
  timestamp: Date;
  scope: string; // Execution/agent scope
  similarity?: number; // Cosine similarity score
}
```

**Embedding Strategy:**

- Uses word-based hashing for initial implementation
- 384-dimensional vectors normalized via L2 norm
- Can be swapped for OpenAI embeddings in production

**Cosine Similarity Search:**

```typescript
function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB || 1);
}
```

**Memory Operations:**

```typescript
// Store a memory
const memoryId = await memorySystem.store({
  content: "Important fact",
  embedding: [384-dim vector],
  metadata: { source: "email", confidence: 0.95 },
  scope: "execution-123"
});

// Retrieve relevant memories
const memories = await memorySystem.retrieve(
  "query text",          // Natural language query
  "execution-123",       // Scope
  limitCount = 10
); // Returns top-10 by cosine similarity
```

### Memory in LangGraph State

```typescript
export const AgentState = Annotation.Root({
  shortTermMemory: Annotation<Record<string, any>>({
    reducer: (x, y) => ({ ...x, ...y }),
  }),

  longTermMemory: Annotation<
    Array<{
      id: string;
      content: string;
      embedding: number[];
      metadata: Record<string, any>;
      timestamp: Date;
    }>
  >({
    reducer: (x, y) => [...x, ...y],
  }),
});
```

---

## 5. Frontend Node Component Architecture

### Component File Structure

**Location:** `Denbegaye Agent/components/agent-nodes/`

```
agent-nodes/
├── NodeRegistry.tsx        # Icon & theme registry (600+ lines)
├── IconNode.tsx            # Base component with animations
├── AINode.tsx             # AI-specific wrapper
├── ToolNode.tsx           # Tool-specific wrapper
├── LogicNode.tsx          # Logic node wrapper
├── MemoryNode.tsx         # Memory node wrapper
├── OrchestrationNode.tsx  # Orchestration node wrapper
├── HumanNode.tsx          # Human interaction node
├── CircularNode.tsx       # Circular layout variant
└── DragPreviewNode.tsx    # Drag preview while moving
```

### Icon Registry System

**Brand Icons (SVG URIs):**

- Google services: Gemini, Drive, Sheets, Calendar, Gmail
- Social: Facebook, LinkedIn, YouTube, WhatsApp, Telegram, Slack
- Code: JavaScript, Python
- LLMs: OpenAI, Anthropic, Groq, DeepSeek
- Advanced agents: Looping, ReAct, Reasoning, Planning, Multi-agent, Tool-using, Memory

**Lucide React Icons:**

- Standard set: Brain, Mail, Webhook, Globe, MessageSquare, Calendar, Settings, Eye, Wrench, Cloud, Phone, Database, Clock, Zap, Layers, etc.

**Type Aliasing (Icon Resolution Chain):**

```typescript
const NODE_TYPE_ICON_ALIASES: Record<string, string> = {
  "calendar-google": "gcalendar",
  "data-google-sheets": "sheets",
  "data-gmail": "gmail",
  "trigger-gmail": "gmail",
  "trigger-slack-event": "slack",
  "action-slack": "slack",
  "core-code-js": "javascript",
  "core-code-python": "python",
};

const resolveIconKey = (type: string): string => {
  // 1. Direct lookup
  if (iconRegistry[normalizedType]) return normalizedType;

  // 2. Check aliases
  if (NODE_TYPE_ICON_ALIASES[normalizedType])
    return NODE_TYPE_ICON_ALIASES[normalizedType];

  // 3. Use last part of type (ai-openai → openai)
  const fallback = normalizedType.split("-").slice(-1)[0];
  if (iconRegistry[fallback]) return fallback;

  // 4. Return as-is (may resolve to default)
  return normalizedType;
};
```

### Node Theme System

**Theme Definition:**

```typescript
type NodeTheme = {
  bg: string; // Gradient background (Tailwind classes)
  ring: string; // Selection ring color
  icon: string; // Icon color
  glow: string; // Box shadow for depth
  highlight: string; // Background aura on selection
  pulse?: string; // Optional animation class
};
```

**Available Themes:**

```typescript
const nodeThemeRegistry = {
  ai: {
    bg: "bg-gradient-to-br from-indigo-500 via-purple-500 to-fuchsia-500",
    ring: "ring-indigo-400",
    icon: "text-white",
    glow: "0 4px 24px 0 rgba(99,102,241,0.18)",
    highlight: "rgba(99,102,241,0.22)",
  },
  tool: {
    bg: "bg-gradient-to-br from-emerald-400 to-emerald-600",
    ring: "ring-emerald-400",
    icon: "text-white",
    glow: "0 4px 24px 0 rgba(16,185,129,0.18)",
    highlight: "rgba(16,185,129,0.22)",
  },
  webhook: {
    bg: "bg-gradient-to-br from-amber-400 to-orange-500",
    ring: "ring-amber-400",
    icon: "text-white",
    glow: "0 4px 24px 0 rgba(251,191,36,0.18)",
    highlight: "rgba(251,191,36,0.24)",
    pulse: "animate-pulse-webhook", // Webhook pulses
  },
  logic: {
    /* blue */
  },
  memory: {
    /* pink */
  },
  orchestration: {
    /* cyan */
  },
  human: {
    /* orange */
  },
  action: {
    /* indigo */
  },
  input: {
    /* purple */
  },
};
```

### IconNode Base Component

**Props:**

```typescript
type IconNodeProps = NodeProps & {
  icon: string | React.ComponentType<any>;
  colorTheme: NodeTheme;
  label: string;
  selected?: boolean;
  isWebhook?: boolean;
  isDragging?: boolean;
  onClick?: () => void;
};
```

**Rendering Logic:**

```typescript
export const IconNode = memo(({
  data, selected, isDragging, icon, colorTheme, label
}: IconNodeProps) => {
  const [isHoveringNode, setIsHoveringNode] = useState(false);

  // Animated shadow on selection
  const nodeShadowStyle = selected
    ? {
        boxShadow: `
          0 0 10px 0 rgba(99, 102, 241, 0.4),
          0 0 20px 0 rgba(99, 102, 241, 0.2),
          0 0 30px 0 rgba(99, 102, 241, 0.1),
          ${colorTheme.glow}
        `,
      }
    : { boxShadow: colorTheme.glow };

  return (
    <div className={clsx(
      'relative flex flex-col items-center gap-3 rounded-[28px]',
      'border border-white/70 bg-white/90 p-4',
      'shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur-xl',
      'transition-all duration-300',
      {
        'ring-1 ring-white/70 shadow-[0_25px_80px_rgba(59,130,246,0.18)]': selected,
        'node-hover-state shadow-[0_25px_60px_rgba(59,130,246,0.14)]':
          isHoveringNode && !isDragging,
      }
    )}>

      {/* Background aura - only on selection */}
      {selected && (
        <div
          className="absolute inset-0 rounded-[28px] blur-2xl opacity-45 pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${colorTheme.highlight} 0%, transparent 70%)`
          }}
        />
      )}

      {/* Icon container */}
      <div className={`flex items-center justify-center w-16 h-16`}>
        {renderIcon(icon, colorTheme.icon)}
      </div>

      {/* Label */}
      <span className="text-sm font-semibold text-slate-700">{label}</span>

      {/* React Flow handles */}
      <Handle position={Position.Top} type="target" />
      <Handle position={Position.Bottom} type="source" />
    </div>
  );
});
```

---

## 6. Configuration & Variable Resolution

### Template Interpolation Engine

**Location:** `src/utils/langgraphWorkflowBuilder.ts`

**Syntax Support:**

```
{{ nodeId.output }}           # Full output object from node
{{ nodeId.output.field }}     # Nested field access
{{ variables.variableName }}  # Workflow variable
{{ variables.nested.path }}   # Nested variable access
```

**Resolution Algorithm:**

```typescript
function interpolateConfig(
  config: Record<string, any>,
  nodeResults: Record<string, any>, // All node outputs
  variables: Record<string, any>, // Workflow variables
  state?: AgentStateType,
): Record<string, any> {
  const interpolateValue = (value: any): any => {
    if (typeof value === "string" && value.includes("{{")) {
      return value.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
        const trimmed = path.trim();

        // Check for variables prefix
        if (trimmed === "variables") {
          return JSON.stringify(state?.variables || variables || {});
        }

        if (trimmed.startsWith("variables.")) {
          const varKey = trimmed.replace("variables.", "");
          const resolved = getNestedValue(
            state?.variables || variables || {},
            varKey,
          );
          return resolved !== undefined ? String(resolved) : match;
        }

        // Resolve from nodeResults
        const parts = trimmed.split(".");
        let resolved: any = nodeResults;
        for (const part of parts) {
          resolved = resolved?.[part];
          if (resolved === undefined) return match;
        }
        return resolved !== undefined ? String(resolved) : match;
      });
    }

    // Recursive for arrays and objects
    if (Array.isArray(value)) return value.map(interpolateValue);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, interpolateValue(v)]),
      );
    }

    return value;
  };

  return interpolateValue(config);
}
```

### Expression Evaluation

**Library:** `expr-eval` (safe mathematical expression parser)

**Evaluation Context:**

```typescript
const evaluateExpression = (expression: any, context: any): any => {
  if (!expression || typeof expression !== "string") {
    return expression;
  }

  const sanitized = sanitizeExpression(expression); // Remove {{ }}

  try {
    const parser = new Parser();
    const expr = parser.parse(sanitized);
    return expr.evaluate({
      input: context.input, // Previous node output
      variables: context.variables, // Workflow variables
      previousOutputs: context.previousOutputs, // All node results
      config: context.config, // Current config
    });
  } catch (error) {
    logger.warn("Expression evaluation failed", {
      expression: sanitized,
      error: error.message,
      nodeId: context.nodeId,
    });
    return sanitized; // Return as-is if evaluation fails
  }
};
```

**Safe Functions Available:**

```
Math operations:        1 + 2, 10 * 5, input.a / input.b
Comparisons:           input.x > 10, value === "text"
Boolean logic:         condition1 && condition2 || !condition3
Property access:       input.user.name, config.settings.enabled
Ternary:              value > 0 ? "positive" : "negative"
Array operations:      array[0], array.length
String templates:      "Value is " + input.text
Date operations:       new Date().toISOString()
```

### Core-Set Node (Variable Setter)

**Purpose:** Define or update workflow variables

**Config:**

```json
{
  "variableName": "myVar",
  "value": "hardcoded value"
}
// OR
{
  "variableName": "calculation",
  "expression": "input.a + input.b"
}
// OR
{
  "variables": {
    "key1": "value1",
    "key2": "value2"
  }
}
```

**Output:**

```typescript
{
  success: true,
  output: {
    text: "Variables set: key1, key2",
    message: "Variables set successfully",
    data: { key1: "value1", key2: "value2" },
    variables: { key1: "value1", key2: "value2" }
  }
}
```

**Variable Lifecycle:**

```
1. Workflow init:   variables: { existing: "value" }
2. core-set node:   returns { variables: { new: "value" } }
3. Auto-extraction: output.variables merged into state
4. Downstream:      {{ variables.new }} resolves to "value"
5. Next core-set:   Can modify both existing and new vars
```

---

## 7. LangGraph Workflow Execution

### Workflow Configuration

**Location:** `src/utils/langgraphWorkflowBuilder.ts`

```typescript
interface WorkflowConfig {
  workflowId: string;
  executionId: string;
  userId: string;
  nodes: WorkflowNodeConfig[]; // Array of nodes
  edges: WorkflowEdgeConfig[]; // Connection definitions
  apiKeys: Record<string, any>; // Credentials
  variables?: Record<string, any>; // Initial variables
  maxRetries?: number; // Retry policy
  enableStreaming?: boolean; // Real-time updates
  streamingInterval?: number; // Update frequency (ms)
}

interface WorkflowNodeConfig {
  id: string;
  type: string;
  config: Record<string, any>;
  label?: string;
  description?: string;
}

interface WorkflowEdgeConfig {
  source: string;
  target: string;
  condition?: (state: AgentStateType) => boolean; // Conditional routing
}
```

### LangGraph State Definition

```typescript
export const AgentState = Annotation.Root({
  // Core execution
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),

  // Workflow context
  workflowId: Annotation<string>({
    reducer: (a, b) => b ?? a,
    default: () => "",
  }),
  executionId: Annotation<string>({
    reducer: (a, b) => b ?? a,
    default: () => "",
  }),
  userId: Annotation<string>({
    reducer: (a, b) => b ?? a,
    default: () => "",
  }),

  // Variables and configuration
  variables: Annotation<Record<string, any>>({
    reducer: (x, y) => ({ ...x, ...y }),
  }),
  apiKeys: Annotation<Record<string, any>>({
    reducer: (a, b) => ({ ...a, ...b }),
    default: () => ({}),
  }),

  // Memory systems
  shortTermMemory: Annotation<Record<string, any>>({
    reducer: (x, y) => ({ ...x, ...y }),
  }),
  longTermMemory: Annotation<VectorMemory[]>({
    reducer: (x, y) => [...x, ...y],
  }),

  // Node execution
  nodeResults: Annotation<Record<string, any>>({
    reducer: (x, y) => ({ ...x, ...y }),
  }),
  nodeStatuses: Annotation<
    Record<string, "pending" | "running" | "completed" | "failed">
  >({
    reducer: (x, y) => ({ ...x, ...y }),
  }),
  nodeExecutionOrder: Annotation<string[]>({
    reducer: (x, y) => [...x, ...y],
  }),

  // Monitoring
  streamEvents: Annotation<StreamEvent[]>({
    reducer: (x, y) => [...x, ...y],
  }),
  status: Annotation<"idle" | "running" | "completed" | "failed" | "cancelled">(
    {
      reducer: (a, b) => b ?? a,
      default: () => "idle",
    },
  ),
  currentNode: Annotation<string | null>({
    reducer: (a, b) => b ?? a,
    default: () => null,
  }),

  // Logging & debugging
  logs: Annotation<LogEntry[]>({
    reducer: (x, y) => [...x, ...y],
  }),
  errors: Annotation<ErrorEntry[]>({
    reducer: (x, y) => [...x, ...y],
  }),

  // Timing
  startTime: Annotation<Date>({
    reducer: (a, b) => b ?? a,
    default: () => new Date(),
  }),
  endTime: Annotation<Date | null>({
    reducer: (a, b) => b ?? a,
    default: () => null,
  }),
  nodeStartTimes: Annotation<Record<string, Date>>({
    reducer: (x, y) => ({ ...x, ...y }),
  }),
  nodeEndTimes: Annotation<Record<string, Date>>({
    reducer: (x, y) => ({ ...x, ...y }),
  }),
});
```

### Node Execution Flow

```typescript
class AdvancedWorkflowBuilder {
  private async executeNode(
    state: AgentStateType,
    nodeConfig: WorkflowNodeConfig,
  ): Promise<Partial<AgentStateType>> {
    const nodeId = nodeConfig.id;
    const startTime = new Date();

    // 1. Mark node as running
    let updatedState = {
      ...state,
      currentNode: nodeId,
      nodeStatuses: {
        ...state.nodeStatuses,
        [nodeId]: "running",
      },
      nodeStartTimes: {
        ...state.nodeStartTimes,
        [nodeId]: startTime,
      },
    };

    try {
      // 2. Resolve dependencies (previous node outputs)
      const previousOutput = resolvePreviousOutput(
        nodeId,
        state.nodeResults || {},
        this.config.edges || [],
      );

      // 3. Interpolate config (resolve templates & expressions)
      const resolvedConfig = interpolateConfig(
        nodeConfig.config || {},
        state.nodeResults || {},
        state.variables,
        state,
      );

      // 4. Get handler from registry
      const nodeDefinition = nodeRegistry.get(nodeConfig.type);
      if (!nodeDefinition) {
        throw new Error(`Node type not found: ${nodeConfig.type}`);
      }

      // 5. Execute handler
      const result = await nodeDefinition.handler({
        nodeId,
        nodeType: nodeConfig.type,
        config: resolvedConfig,
        input: previousOutput,
        apiKeys: this.config.apiKeys,
        variables: state.variables,
      });

      // 6. Update state with results
      updatedState.nodeResults = {
        ...updatedState.nodeResults,
        [nodeId]: {
          output: result.output,
          success: result.success,
          timestamp: new Date(),
        },
      };

      // 7. Extract variables if present
      if (result.output?.variables) {
        updatedState.variables = {
          ...updatedState.variables,
          ...result.output.variables,
        };
      }

      // 8. Mark as completed
      updatedState.nodeStatuses[nodeId] = "completed";
      updatedState.nodeEndTimes = {
        ...updatedState.nodeEndTimes,
        [nodeId]: new Date(),
      };

      // 9. Emit stream event
      this.emitStreamEvent({
        type: "node_end",
        nodeId,
        data: { output: result.output, success: result.success },
        timestamp: new Date(),
        executionId: this.config.executionId,
      });
    } catch (error) {
      // Handle error
      updatedState.nodeStatuses[nodeId] = "failed";
      updatedState.errors = [
        ...(updatedState.errors || []),
        {
          nodeId,
          error: error.message,
          timestamp: new Date(),
          stack: error.stack,
          retryCount: 0,
        },
      ];

      this.emitStreamEvent({
        type: "node_error",
        nodeId,
        data: { error: error.message },
        timestamp: new Date(),
        executionId: this.config.executionId,
      });
    }

    return updatedState;
  }
}
```

---

## 8. Execution Result Patterns

### Node Result Structure

```typescript
interface NodeExecutionResult {
  nodeId: string;
  success: boolean;
  data?: Record<string, any>;
  error?: string;
  messages?: BaseMessage[];
  errors?: Array<{ error: string; timestamp: Date }>;
  executionTime: number;
  toolCalls?: Array<{
    id: string;
    toolName: string;
    input: Record<string, any>;
  }>;
}
```

### Common Output Patterns

**AI Node Output:**

```json
{
  "success": true,
  "output": {
    "text": "Generated response text",
    "message": "gpt-4o executed with model gpt-4o",
    "model": "gpt-4o",
    "data": {
      "model": "gpt-4o",
      "systemPrompt": "",
      "executionType": "ai-completion",
      "provider": "openai"
    },
    "raw": {
      "model": "gpt-4o",
      "prompt": "Input prompt",
      "response": "Generated response text",
      "nodeId": "node-1",
      "nodeType": "ai-openai"
    }
  },
  "logs": ["AI node executed with gpt-4o, generated 125 characters"]
}
```

**Core-Set Output:**

```json
{
  "success": true,
  "output": {
    "text": "varName: value",
    "message": "Variables set: varName",
    "data": {
      "varName": "value"
    },
    "variables": {
      "varName": "value"
    }
  },
  "logs": ["core-set: stored variables: {\"varName\": \"value\"}"]
}
```

**Action-Email Output:**

```json
{
  "success": true,
  "output": {
    "text": "Email sent to user@example.com: Subject",
    "message": "Email action executed successfully via smtp",
    "data": {
      "recipient": "user@example.com",
      "subject": "Subject",
      "bodyLength": 150,
      "provider": "smtp",
      "messageId": "msg-12345",
      "timestamp": "2026-05-17T12:00:00Z"
    }
  },
  "logs": [
    "Email action executed: to=user@example.com, provider=smtp, messageId=msg-12345"
  ]
}
```

---

## 9. Extension & Addition Patterns

### Adding a New Node Type

**Step 1: Create Handler in `src/nodes/index.ts`**

```typescript
const myCustomHandler = async (context: any) => {
  const param = context.config?.param || context.input?.data;

  try {
    const result = await processWithParam(param);

    return {
      success: true,
      output: {
        text: result.toString(),
        message: "Custom node executed",
        data: { result },
      },
      logs: ["Custom node: " + result],
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      nodeId: context.nodeId,
    };
  }
};
```

**Step 2: Register with NodeRegistry**

```typescript
nodeRegistry.register({
  type: "custom-type",
  handler: myCustomHandler,
  description: "My custom node type",
});
```

**Step 3: Add Frontend Component (optional)**

```typescript
// In components/agent-nodes/CustomNode.tsx
export const CustomNode = memo((props: NodeProps) => {
  const { data = {}, selected, dragging } = props;
  const colorTheme = getNodeTheme('custom');

  return (
    <IconNode
      {...props}
      icon="wrench"
      colorTheme={colorTheme}
      label={data.label || 'Custom'}
      selected={selected}
      isDragging={dragging}
    />
  );
});
```

**Step 4: Add to Theme Registry (if custom theme needed)**

```typescript
nodeThemeRegistry["custom"] = {
  bg: "bg-gradient-to-br from-green-300 to-green-500",
  ring: "ring-green-400",
  icon: "text-white",
  glow: "0 4px 24px 0 rgba(34,197,94,0.18)",
  highlight: "rgba(34,197,94,0.22)",
};
```

### Adding an LLM Provider

**Step 1: Add to `llmFactory.ts`**

```typescript
case "newprovider":
  llm = new ChatNewProvider({
    apiKey: config.apiKey,
    model: config.model || "default-model",
    temperature: config.temperature,
    maxTokens: config.maxTokens
  });
  break;
```

**Step 2: Update Provider Detection**

```typescript
const getProviderFromNodeType = (nodeType: string): string => {
  // ... existing checks
  if (nodeType.toLowerCase().includes("newprovider")) return "newprovider";
  return "openai";
};
```

**Step 3: Create Handler Wrapper**

```typescript
const newproviderHandler = async (context: any) => {
  const llm = llmFactory.createLLM({
    provider: "newprovider",
    apiKey: context.config?.apiKey,
    model: context.config?.model,
    temperature: context.config?.temperature ?? 0.7,
  });

  const response = await llm.invoke([new HumanMessage(prompt)]);
  // ... return standard format
};
```

**Step 4: Register Handler**

```typescript
nodeRegistry.register({
  type: "ai-newprovider",
  handler: newproviderHandler,
  description: "New Provider AI node",
});
```

### Adding a Memory Type

**Step 1: Implement MemorySystem Interface**

```typescript
class CustomMemorySystem implements ExecutionEngineMemorySystem {
  async store(memory: Omit<VectorMemory, "id">): Promise<string> {}
  async retrieve(
    query: string,
    scope?: string,
    limit?: number,
  ): Promise<VectorMemory[]> {}
  async update(memoryId: string, content: string, metadata): Promise<void> {}
  async delete(memoryId: string): Promise<void> {}
}
```

**Step 2: Add to AgentState**

```typescript
customMemory: Annotation<CustomMemoryType[]>({
  reducer: (x, y) => [...x, ...y],
});
```

**Step 3: Integrate in Workflow Builder**

```typescript
// Initialize and pass to workflow
const memorySystem = new CustomMemorySystem();
// Use in node handlers as needed
```

---

## 10. System Architecture Summary

### Layer Overview

```
┌─────────────────────────────────────────┐
│      Frontend (React Flow UI)            │
│  • Node components (IconNode base)       │
│  • Icon/Theme registry                   │
│  • Real-time stream events               │
└────────────────┬────────────────────────┘
                 │
┌────────────────┴────────────────────────┐
│  API/Communication Layer                 │
│  • WebSocket for streaming               │
│  • REST endpoints                        │
│  • Authentication                        │
└────────────────┬────────────────────────┘
                 │
┌────────────────┴────────────────────────┐
│  Workflow Orchestration (LangGraph)      │
│  • AdvancedWorkflowBuilder                │
│  • State management (Annotation-based)   │
│  • Node execution sequencing             │
│  • Streaming event emission              │
└────────────────┬────────────────────────┘
                 │
┌────────────────┴────────────────────────┐
│  Node Execution Engine                   │
│  • NodeRegistry (Map-based)              │
│  • Node handlers (async functions)       │
│  • Config interpolation                  │
│  • Expression evaluation                 │
│  • Error handling & retries              │
└────────────────┬────────────────────────┘
                 │
┌────────────────┴────────────────────────┐
│  Integration Layers                      │
│  • LLMFactory (provider dispatch)        │
│  • ToolRegistry (Supabase)               │
│  • MemorySystem (vector search)          │
│  • External APIs (email, social, etc.)   │
└─────────────────────────────────────────┘
```

### Data Flow Summary

```
User Input (Frontend)
    ↓
WorkflowBuilder.build()
    ↓
LangGraph State Initialization
    ↓
For Each Node (topologically sorted):
    ├─ Resolve Dependencies
    ├─ Interpolate Config {{ templates }}
    ├─ Get Handler from Registry
    ├─ Execute Handler with Context
    ├─ Extract Variables from Output
    ├─ Update State (nodeResults, variables)
    ├─ Emit Stream Event
    └─ Continue to Next Node
    ↓
Final Output + State
    ↓
Stream to Frontend (Real-time UI Updates)
```

---

## 11. Performance Characteristics

- **LLMFactory Caching:** Provider-model key caching eliminates instantiation overhead
- **Config Interpolation:** Single-pass template resolution per node
- **Memory Search:** Cosine similarity over 384-dim vectors (optimized for Supabase)
- **State Management:** Immutable updates via LangGraph reducer functions
- **Async Execution:** All handlers are async, enabling concurrent operations where possible

---

## 12. Key Files Reference

| File                                      | Purpose                         | Lines |
| ----------------------------------------- | ------------------------------- | ----- |
| `src/nodes/index.ts`                      | All node handlers & registry    | 2000+ |
| `src/utils/llmFactory.ts`                 | LLM provider factory            | 150   |
| `src/utils/langgraphWorkflowBuilder.ts`   | Workflow orchestration          | 400+  |
| `src/utils/langgraphState.ts`             | State definition & utilities    | 300+  |
| `src/utils/langgraphToolRegistry.ts`      | Tool registration for LangGraph | 300+  |
| `src/utils/memorySystem.ts`               | Vector memory storage & search  | 250+  |
| `src/utils/toolRegistry.ts`               | Tool metadata registry          | 200+  |
| `components/agent-nodes/NodeRegistry.tsx` | Icon & theme registry           | 600+  |
| `components/agent-nodes/IconNode.tsx`     | Base node component             | 200+  |

---

## Conclusion

The system provides a **robust, extensible foundation** for building complex AI agent workflows with:

✅ **40+ pre-built node types** covering AI, actions, logic, and data operations
✅ **Multi-provider LLM support** with intelligent caching
✅ **Sophisticated variable system** with template interpolation and expression evaluation
✅ **Memory integration** with vector embeddings and semantic search
✅ **Professional frontend** with theme-based rendering and advanced animations
✅ **Stateful execution** via LangGraph with real-time streaming
✅ **Clean extension patterns** for adding new nodes, providers, and memory types

All patterns follow consistent async/await conventions, error handling, and output formatting for maximum interoperability and maintainability.
