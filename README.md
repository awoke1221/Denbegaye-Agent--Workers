# Denbegaye Agent Workers — Distributed AI Agent Execution Service

> A production-architected worker service for executing autonomous AI agent workflows as DAGs with support for multiple reasoning strategies, provider integrations, audit logging, and real-time status streaming.

🎥 **[Demo Video](#)** · 🔗 **[Live Demo](#)** · 📐 **[Architecture Diagram](#architecture)**

---

## For Recruiters & Technical Reviewers

This service is built as an independent worker process for enterprise-grade agent execution, not just a simple serverless function.

- **Queue-driven execution** — jobs are enqueued through Redis/BullMQ and processed by dedicated worker instances.
- **Multi-role deployment** — supports `SERVICE_ROLE=api`, `SERVICE_ROLE=worker`, or `SERVICE_ROLE=all` for full separation of concerns.
- **Real-time observability** — execution events are emitted over Socket.IO and captured in Supabase audit logs.
- **Multi-provider AI support** — provider-agnostic execution for OpenAI, Gemini, DeepSeek, plus generic REST actions.
- **Graph validation and safety** — Zod schema validation combined with secure expression evaluation to prevent injection.

**Two-service architecture:**
| Service | Role | Stack |
|---|---|---|
| `Denbegaye Agent` | UI, workflow builder, auth, API proxy | Next.js 16, React 18, TypeScript, Supabase, Zustand, React Flow, Socket.IO |
| `Denbegaye Agent Workers` | Distributed execution engine | Node.js, Express, BullMQ, Redis, Zod, OpenTelemetry, Socket.IO |

---

## How the Repositories Work Together

The worker service is designed to receive queued execution requests from the frontend builder and execute them independently.

- `Denbegaye Agent` builds and validates workflows, resolves credentials, and submits execution jobs through the API proxy.
- `Denbegaye Agent Workers` consumes jobs from Redis/BullMQ, executes workflow DAGs, and persists audit events to Supabase.
- Execution workflow:
  1. User submits a workflow from the UI.
  2. Frontend enqueues the execution request in Redis via the API proxy.
  3. Worker instances claim jobs and execute nodes sequentially or in parallel.
  4. Execution events are streamed back for real-time UI updates.
  5. Final results and audit logs are stored for review.

This separation enables independent scaling of the builder/API layer and the execution engine.

## Deployment Checklist

- ✅ Verify environment configuration for both services (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL`, `BULL_QUEUE_NAME`, `ENCRYPTION_KEY`)
- ✅ Deploy `Denbegaye Agent` as the frontend/API proxy service
- ✅ Deploy `Denbegaye Agent Workers` as one or more worker instances
- ✅ Ensure Redis is accessible by all worker and API processes
- ✅ Use secure storage for service keys and API credentials
- ✅ Monitor queue depth, job retries, and worker health
- ✅ Perform end-to-end execution tests with sample workflow jobs

## Testing Checklist

- ✅ Run unit tests and integration tests with `npm test`
- ✅ Validate workflow execution through the API proxy and worker service
- ✅ Confirm real-time status updates over Socket.IO
- ✅ Test worker retry and failure handling behavior
- ✅ Verify Supabase audit log entries for executions
- ✅ Exercise concurrent workflow executions to check queue processing

## 🚀 Features

- **DAG-based Workflow Execution**: Execute complex agent workflows with dependency management
- **Multi-provider AI support**: OpenAI, Gemini, DeepSeek, and extensible custom integrations
- **Queue-based processing**: Asynchronous job processing with BullMQ and Redis
- **Schema validation**: Zod validation for workflow graphs before execution
- **Audit logging**: Workflow and node-level audit trails persisted to Supabase
- **Error handling**: Retry logic, timeouts, and execution resilience
- **Role-based scaling**: API and worker processes can scale independently
- **TypeScript**: Full type safety and modern development experience

## 🛡️ Security

This service implements secure expression evaluation to prevent code injection attacks:

- **No eval() usage**: All dynamic expression evaluation uses the `expr-eval` library for safe mathematical and logical expressions
- **Sandboxed execution**: Expressions are evaluated in a controlled environment without access to Node.js globals
- **Input validation**: All workflow graphs are validated using Zod schemas before execution

## 🏗️ Architecture

The worker service is designed as an independent, horizontally scalable execution engine with a clear runtime boundary between the frontend API proxy and the worker processes.

- **Worker Service**: Processes agent execution jobs from Redis/BullMQ
- **Agent Engine**: Executes workflow DAGs and node orchestration
- **Validation Layer**: Ensures workflow graph structure and node schema integrity
- **Audit Logger**: Persists workflow and node telemetry to Supabase
- **Queue Manager**: Handles job enqueueing, retries, and worker scheduling

### Data Flow

1. `Denbegaye Agent` posts an execution request to the API proxy
2. Request is enqueued in Redis/BullMQ
3. Worker instance claims the job and validates the graph
4. Engine executes nodes in topological order and emits status events
5. Results and audit logs are persisted, and real-time updates are streamed back to the UI

## 📦 Installation

### Prerequisites

- Node.js 18+
- Redis server
- Supabase account

### Setup

1. Clone the repository:

```bash
git clone <repository-url>
cd denbegaye-agent-workers
```

2. Install dependencies:

```bash
npm install
```

3. Create environment file (`.env`):

```env
# Database
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Queue
REDIS_URL=redis://localhost:6379
BULL_QUEUE_NAME=denbegaye-agent-queue

# Encryption
ENCRYPTION_KEY=your-32-character-encryption-key

# Optional AI API Keys (fallback to user-provided keys)
OPENAI_API_KEY=your-openai-key
GEMINI_API_KEY=your-gemini-key
DEEPSEEK_API_KEY=your-deepseek-key

# Optional email provider settings
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_SECURE=false
EMAIL_FROM=sender@example.com
```

4. Build the project:

```bash
npm run build
```

## 🚀 Usage

### Development

Start the worker in development mode:

```bash
npm run dev
```

### Production

Build and start the worker:

```bash
npm run build
npm start
```

### Multi-instance scaling

This service supports role-based deployment so API and worker processes can scale independently.

- `SERVICE_ROLE=api` - start the HTTP API process that enqueues jobs.
- `SERVICE_ROLE=worker` - start the worker process that consumes jobs.
- `SERVICE_ROLE=all` - run both API and worker behavior in one process.

Recommended commands:

```bash
npm run dev:api      # development API process
npm run dev:worker   # development worker process
npm run start:api    # production API process
npm run start:worker # production worker process
```

For multi-instance deployments, ensure all processes share the same `REDIS_URL` and `BULL_QUEUE_NAME`.

### Testing

Run the test suite:

```bash
npm test
```

## 📈 Scalability & Roadmap

This worker is already structured for horizontal scaling, but production readiness requires additional infrastructure and observability.

- **Current strengths**
  - Dedicated queue-based job processing
  - Role-separated deployment modes
  - Audit logging with Supabase
- **Recommended improvements**
  - Redis clustering or managed Redis for high availability
  - Worker autoscaling with metrics-based scaling rules
  - Distributed Socket.IO adapter for cross-instance event broadcast
  - Centralized tracing and metrics with OpenTelemetry or Prometheus
  - Backpressure handling and queue prioritization for burst loads

## 📋 API Reference

### Workflow Execution

#### `executeWorkflow(nodes, edges, input, apiKeys, executionId, options)`

Executes a workflow DAG with the specified parameters.

**Parameters:**

- `nodes`: Array of `AgentNode` objects
- `edges`: Array of `AgentEdge` objects
- `input`: Workflow input data
- `apiKeys`: Decrypted API keys for external services
- `executionId`: Unique execution identifier
- `options`: Execution options (concurrency, timeouts, audit logging)

**Returns:** `ExecutionResult` with success status, output, logs, and errors

### Node Types

#### AI Nodes

- `ai-openai`: OpenAI API integration
- `ai-gemini`: Google Gemini API integration
- `ai-deepseek`: DeepSeek API integration

#### Action Nodes

- `api`: Generic HTTP API calls
- `email`: Email sending
- `memory`: Data storage/retrieval

#### Logic Nodes

- `logic-delay`: Execution delays
- `logic-if`: Conditional branching (planned)
- `logic-loop`: Loop constructs (planned)

### Validation

#### `validateAgentGraph(nodes, edges)`

Validates workflow graph structure and constraints.

**Returns:** Validation result with success status and error messages

### Audit Logging

#### `logWorkflowAudit(executionId, event, details)`

Persists audit events to the database.

**Events:**

- `workflow.start`: Workflow execution initiated
- `workflow.completed`: Workflow finished successfully
- `workflow.failed`: Workflow execution failed
- `node.start`: Node execution started
- `node.completed`: Node finished successfully
- `node.failed`: Node execution failed

## ⚙️ Configuration

### Environment Variables

| Variable                    | Description                        | Required |
| --------------------------- | ---------------------------------- | -------- |
| `SUPABASE_URL`              | Supabase project URL               | Yes      |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key          | Yes      |
| `REDIS_URL`                 | Redis connection URL               | Yes      |
| `ENCRYPTION_KEY`            | 32-character encryption key        | Yes      |
| `OPENAI_API_KEY`            | OpenAI API key (optional fallback) | No       |
| `GEMINI_API_KEY`            | Gemini API key (optional fallback) | No       |

### Node Configuration

Each node supports the following configuration options:

```typescript
interface NodeConfig {
  // AI-specific
  provider?: "openai" | "gemini" | "deepseek";
  model?: string;
  max_tokens?: number;
  temperature?: number;
  prompt?: string;

  // Execution control
  timeoutMs?: number;
  retryCount?: number;
  onFailure?: "fail" | "continue";

  // Node-specific
  endpoint?: string;
  params?: Record<string, any>;
  to?: string;
  subject?: string;
  body?: string;
  data?: any;
  delayMs?: number;
}
```

## 🗄️ Database Schema

### Tables

#### `executions`

Tracks workflow execution status and results.

```sql
CREATE TABLE executions (
  id UUID PRIMARY KEY,
  agent_id UUID NOT NULL,
  user_id UUID NOT NULL,
  status TEXT NOT NULL,
  input_data JSONB,
  output_data JSONB,
  logs JSONB,
  errors JSONB,
  metadata JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  execution_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `agents`

Stores agent workflow definitions.

```sql
CREATE TABLE agents (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  nodes JSONB NOT NULL,
  edges JSONB NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `user_api_keys`

Encrypted API keys for external services.

```sql
CREATE TABLE user_api_keys (
  user_id UUID PRIMARY KEY,
  encrypted_keys TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `workflow_audit_logs`

Detailed execution audit trail.

```sql
CREATE TABLE workflow_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL,
  event TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 🧪 Testing

The project includes comprehensive unit tests covering:

- Graph validation (duplicate nodes, missing edges)
- DAG execution (topological ordering, concurrency)
- Error handling (cycles, timeouts, retries)

Run tests with:

```bash
npm test
```

## 🚀 Deployment

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Setup

1. Set up Redis cluster for production
2. Configure Supabase with proper RLS policies
3. Use environment-specific encryption keys
4. Set up monitoring and alerting for queue health

### Scaling Considerations

- **Horizontal Scaling**: Multiple worker instances behind load balancer
- **Queue Partitioning**: Separate queues for different agent types
- **Database Optimization**: Connection pooling and query optimization
- **Monitoring**: Queue depth, execution times, error rates

## 🔒 Security

- API keys are encrypted at rest using AES-256
- Service role key provides database access (use carefully)
- Input validation prevents injection attacks
- Audit logging tracks all execution events

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure TypeScript compilation passes
5. Submit a pull request

### Development Guidelines

- Use TypeScript strict mode
- Add unit tests for new features
- Follow existing code patterns
- Update documentation for API changes

## 📄 License

ISC License - see LICENSE file for details.

## 🆘 Troubleshooting

### Common Issues

**Queue Connection Failed**

- Verify Redis URL and connectivity
- Check Redis server status

**Database Connection Error**

- Validate Supabase credentials
- Check network connectivity

**Validation Errors**

- Ensure node IDs are unique
- Verify all edges reference existing nodes
- Check for circular dependencies

**AI API Errors**

- Verify API keys are properly encrypted
- Check rate limits and quotas
- Confirm model availability

### Logs

Check application logs for detailed error information:

- Worker startup issues
- Execution failures
- Validation errors
- Audit logging failures

## 📞 Support

For issues and questions:

1. Check existing GitHub issues
2. Create a new issue with detailed information
3. Include logs, configuration, and reproduction steps
