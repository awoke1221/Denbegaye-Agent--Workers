**Quick Start: Advanced Workflow Execution**

### 1. Database Updates (Required)

Run these SQL statements in your Supabase dashboard:

```sql
-- Add partial success tracking to agent_executions
ALTER TABLE agent_executions
ADD COLUMN IF NOT EXISTS partial_success BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS compensated_nodes TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS failed_nodes TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS circuit_breaker_tripped BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS node_attempt_counts JSONB DEFAULT '{}'::jsonb;

-- Create execution states table for detailed monitoring
CREATE TABLE IF NOT EXISTS workflow_execution_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id TEXT NOT NULL UNIQUE,
  workflow_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  overall_success BOOLEAN NOT NULL,
  partial_success BOOLEAN DEFAULT FALSE,
  node_states JSONB NOT NULL,
  circuit_breaker_failures JSONB DEFAULT '[]'::jsonb,
  execution_time BIGINT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_execution_states_user_id ON workflow_execution_states(user_id);
CREATE INDEX idx_execution_states_execution_id ON workflow_execution_states(execution_id);
CREATE INDEX idx_execution_states_timestamp ON workflow_execution_states(timestamp);

-- Enable RLS
ALTER TABLE workflow_execution_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own states" ON workflow_execution_states
  FOR SELECT USING (auth.uid()::text = user_id);
CREATE POLICY "Users can insert own states" ON workflow_execution_states
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);
```

### 2. Backend Configuration

The advanced executor is automatically enabled. No changes needed! The system:

1. Tries LangGraph first (fast, streaming)
2. Falls back to advanced executor on error (reliable, comprehensive)

### 3. Monitoring Setup (Optional but Recommended)

The monitoring system is already active on the backend. Check health:

```bash
# Basic health check
curl http://localhost:3001/health

# Advanced health with metrics
curl http://localhost:3001/health/advanced
```

## Usage Examples

### Example 1: Simple Execution (No Changes Needed)

```typescript
// Your existing code still works!
const response = await fetch("/api/agent-run", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    nodes: workflow.nodes,
    edges: workflow.edges,
    input: {
      /* input data */
    },
    apiKeys: {
      /* api keys */
    },
  }),
});

const { executionId } = await response.json();
```

### Example 2: Check Partial Success

```typescript
// After workflow completes
const execution = await fetch(`/api/execution/${executionId}`).then((r) =>
  r.json(),
);

if (execution.success) {
  console.log("✅ Full success");
} else if (execution.partial_success) {
  console.log("⚠️ Partial success:", {
    successful: execution.nodeStatuses.filter((n) => n.status === "success"),
    failed: execution.nodeStatuses.filter((n) => n.status === "failed"),
    compensated: execution.compensated_nodes,
  });
} else {
  console.log("❌ Complete failure");
  showRecoveryOptions(executionId);
}
```

### Example 3: Monitor Health

```typescript
// Check system health
const health = await fetch("/health/advanced").then((r) => r.json());

console.log({
  totalRuns: health.metrics.totalExecutions,
  successRate:
    (
      (health.metrics.successfulExecutions / health.metrics.totalExecutions) *
      100
    ).toFixed(1) + "%",
  partialSuccessRate:
    (
      (health.metrics.partialSuccessExecutions /
        health.metrics.totalExecutions) *
      100
    ).toFixed(1) + "%",
  avgTime: health.metrics.averageExecutionTime + "ms",
  recentErrors: health.metrics.recentErrors,
});
```

### Example 4: Recovery (Frontend)

```typescript
async function recoverFailedWorkflow(executionId) {
  const response = await fetch(`/api/recovery/${executionId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      strategy: "retry", // or 'compensate', 'skip', 'manual'
      maxAttempts: 3,
    }),
  });

  return await response.json();
}
```

## Key Concepts

### Status Values

```typescript
// Node execution can result in:
"pending"; // Not started
"running"; // Currently executing
"success"; // Completed successfully
"failed"; // Failed (and won't retry anymore)
"compensated"; // Was successful, but rolled back after workflow failure
"skipped"; // Didn't execute (dependency failed)
```

### Workflow Result Types

```typescript
success: true; // All nodes succeeded
success: false;
partialSuccess: true; // Some nodes succeeded, some failed
success: false;
partialSuccess: false; // All nodes failed or catastrophic error
```

### Retry Behavior (Automatic)

The system automatically retries failures with exponential backoff:

```
Attempt 1: Immediate
Attempt 2: Wait ~1 second (with random jitter)
Attempt 3: Wait ~2 seconds (with random jitter)
Attempt 4: Wait ~4 seconds (with random jitter)
Max: 3 retries (configurable via maxRetries)
```

Only transient errors are retried:

- ✅ Network timeout
- ✅ Rate limit (429)
- ✅ Temporary service failure
- ❌ Authentication error (no retry)
- ❌ Invalid configuration (no retry)
- ❌ Resource not found (no retry)

### Circuit Breaker (Automatic)

If a node type fails 5 times in a row:

- It's marked as "circuit open"
- Subsequent requests for that node type immediately fail
- This prevents wasting resources on broken services
- Manual intervention or configuration fix needed to reset

## Troubleshooting

### "Workflow shows partial success but expected full success"

Check the execution details:

```typescript
const execution = await fetch(`/api/execution/${executionId}`).then((r) =>
  r.json(),
);
console.log(execution.failed_nodes); // Which nodes failed?
console.log(execution.node_attempt_counts); // How many retries?
```

### "Too many failures for node type X"

The circuit breaker might be tripped:

```typescript
if (execution.circuit_breaker_tripped) {
  console.log("Circuit breaker active. Check error logs and fix the issue.");
  // Fix the underlying problem, then manually reset via dashboard
}
```

### "Missing execution_states in database"

The table creation is optional. If you didn't create it, the system still works but won't persist detailed state. Create it with the SQL from "Installation" section.

## Performance Impact

The advanced execution system adds minimal overhead:

- **LangGraph path** (primary): Same as before (fast)
- **Fallback path**: Additional state tracking (~10-20ms per node)
- **Compensation**: Optional, only runs on failure

## Migration from Old System

**No migration needed!** The system is **100% backward compatible**:

1. Old REST endpoints still work
2. New improvements are automatic
3. You can use both systems in parallel
4. Gradually migrate workflows as needed

## Best Practices

### 1. Design Workflows with Failure in Mind

```typescript
// Good: Independent branches can fail separately
Workflow:
  Get User Info
    ├─ Send Welcome Email     ← Can fail independently
    ├─ Update Analytics       ← Can fail independently
    └─ Create Profile         ← Can fail independently

// Problematic: Linear chain with hard dependencies
Workflow:
  Step 1 ─→ Step 2 ─→ Step 3 ─→ Step 4
  // If Step 2 fails, Steps 3 and 4 skip
```

### 2. Handle Partial Success

```typescript
// Always check for partial success
if (execution.partial_success) {
  // Some operations completed
  // You might have partial data in database/third-party services
  // Plan for cleanup or recovery

  for (const failedNode of execution.failed_nodes) {
    // Log for manual review
    // Potentially retry manually
  }
}
```

### 3. Use Compensation for Critical Operations

```typescript
// When enabling compensation, define it properly
{
  enableCompensation: true,
  compensationAction: async (nodeId) => {
    // Rollback database changes
    // Cancel API calls
    // Notify stakeholders
  }
}
```

### 4. Monitor Circuit Breakers

```typescript
// Periodically check health
setInterval(async () => {
  const health = await fetch("/health/advanced").then((r) => r.json());
  if (health.metrics.circuitBreakerTrips > 0) {
    // Alert DevOps team
    // Check service status
  }
}, 60000);
```

## Next Steps

1. ✅ Apply database changes from "Installation"
2. ✅ Restart backend server
3. ✅ Test with your existing workflows
4. ✅ Monitor health endpoint for metrics
5. ✅ Update frontend to handle partial success
6. ✅ Set up alerting for circuit breaker trips

## Documentation

- **Deep Dive**: See `ADVANCED_EXECUTION_SYSTEM.md` for complete architecture
- **Node Types**: Check `src/nodes/index.ts` for available node implementations
- **LangGraph Integration**: See `LANGGRAPH_IMPLEMENTATION.md` for streaming details

---

**Questions?** Check the logs:

```bash
# Backend logs
tail -f server.log | grep "Workflow\|Execution\|Node"

# Check specific execution
curl http://localhost:3001/api/execution/{executionId}
```
