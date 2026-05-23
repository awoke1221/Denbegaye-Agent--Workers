# Denbegaye Agent Workers

A production-ready AI agent execution service built with Node.js, TypeScript, and Bull queue. This service enables the execution of complex AI workflows defined as directed acyclic graphs (DAGs) with support for multiple AI providers, API integrations, and comprehensive audit logging.

## 🚀 Features

- **DAG-based Workflow Execution**: Execute complex agent workflows with dependency management
- **Multi-Provider AI Support**: OpenAI, Gemini, and DeepSeek integration
- **Queue-based Processing**: Asynchronous job processing with Bull and Redis
- **Schema Validation**: Zod-based validation for workflow graphs
- **Audit Logging**: Comprehensive workflow and node-level audit trails
- **Error Handling**: Retry logic with exponential backoff and timeout management
- **Database Integration**: Supabase for execution tracking and audit logs
- **TypeScript**: Full type safety and modern development experience

## 🛡️ Security

This service implements secure expression evaluation to prevent code injection attacks:

- **No eval() usage**: All dynamic expression evaluation uses the `expr-eval` library for safe mathematical and logical expressions
- **Sandboxed execution**: Expressions are evaluated in a controlled environment without access to Node.js globals
- **Input validation**: All workflow graphs are validated using Zod schemas before execution

## 🏗️ Architecture

### Core Components

- **Worker Service**: Processes agent execution jobs from Redis queue
- **Agent Engine**: Executes workflow DAGs with node orchestration
- **Validation Layer**: Ensures workflow graph integrity
- **Audit Logger**: Persists execution events to database
- **Queue Manager**: Handles job queuing and processing

### Data Flow

1. Agent execution request → Redis queue
2. Worker claims job → Validates workflow graph
3. Executes nodes in topological order → Logs audit events
4. Persists results → Updates execution status

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

# Optional generic email service settings
EMAIL_SERVICE_URL=smtp.example.com
EMAIL_SERVICE_PORT=587
EMAIL_SERVICE_SECURE=false
EMAIL_SERVICE_USER=your-service-user
EMAIL_SERVICE_API_KEY=your-service-api-key
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

- `SERVICE_ROLE=api` - starts only the API/server process and enqueues jobs.
- `SERVICE_ROLE=worker` - starts only the worker process that consumes jobs and executes workflows.
- `SERVICE_ROLE=all` - starts both API and worker behavior in the same process.

Recommended commands:

```bash
npm run dev:api      # development API process
npm run dev:worker   # development worker process
npm run start:api    # production API process
npm run start:worker # production worker process
```

For multi-instance deployments, set `REDIS_URL` and `BULL_QUEUE_NAME` so all instances share the same Redis queue and Socket.IO adapter.

### Testing

Run the test suite:

```bash
npm test
```

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
