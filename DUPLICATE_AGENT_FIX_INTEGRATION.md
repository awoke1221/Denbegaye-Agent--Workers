# Duplicate Agent Creation Fix - Frontend Integration Guide

## Overview

Fixed the issue where running a workflow would automatically create a new agent record every time. Now workflows can be executed without persisting them as agents.

## Changes Made

### Backend (Workers)

#### 1. Request Validation Schema (`src/utils/agentQueue.ts`)

Added two new optional parameters:

```typescript
saveAsAgent?: boolean    // Default: false - Only save as agent if explicitly requested
isTemporary?: boolean    // Default: true - Mark execution as temporary
```

#### 2. Agent Creation Logic (`src/routes/agentRun.ts`)

Now follows this logic:

- **Has `agentId`?** → Fetch existing agent (unchanged)
- **Has `saveAsAgent=true` + `agentName`?** → CREATE new agent (new flow)
- **Otherwise?** → Temporary execution without saving agent (new default)

#### 3. Database Schema (`supabase-schema.sql`)

- Made `agent_executions.agent_id` nullable
- Added `agent_executions.is_temporary` boolean flag
- Maintained referential integrity with ON DELETE CASCADE

### What This Means

| Scenario                     | Old Behavior             | New Behavior                               |
| ---------------------------- | ------------------------ | ------------------------------------------ |
| Run workflow without agentId | ❌ Creates new agent     | ✅ Temporary execution (no agent saved)    |
| Run workflow with agentId    | ✅ Uses existing         | ✅ Uses existing (unchanged)               |
| Save workflow as new agent   | ❌ Not available         | ✅ Use `saveAsAgent=true` with `agentName` |
| View execution history       | Lots of duplicate agents | ✅ Clean list with marked temporary runs   |

## Frontend Integration

### For Workflow Execution (Ad-hoc Testing)

**OLD BEHAVIOR**: Every execution created a new agent

```typescript
// This would create a new agent every time
const response = await fetch("/api/agent-run", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    nodes: workflowNodes,
    edges: workflowEdges,
    input: testData,
    // No agentId, no agentName → auto-created agent
  }),
});
```

**NEW BEHAVIOR**: Use temporary execution

```typescript
// This will NOT create an agent - pure execution
const response = await fetch("/api/agent-run", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    nodes: workflowNodes,
    edges: workflowEdges,
    input: testData,
    // Optional: explicitly mark as temporary
    isTemporary: true,
    // Note: saveAsAgent is false by default
  }),
});
```

### For Saving a Workflow as Agent

**NEW REQUIREMENT**: Use explicit `saveAsAgent` flag

```typescript
// This will create and save a new agent
const response = await fetch("/api/agent-run", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    nodes: workflowNodes,
    edges: workflowEdges,
    agentName: "My Saved Agent", // Required when saveAsAgent=true
    input: testData,
    saveAsAgent: true, // Explicitly request to save as agent
  }),
});
```

### For Running an Existing Agent

**UNCHANGED**: Use the existing agentId

```typescript
// Use existing agent by ID
const response = await fetch("/api/agent-run", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    agentId: existingAgentUUID, // Reference existing agent
    input: testData,
    // nodes/edges not needed when using existing agentId
  }),
});
```

## Response Format

### Execution Response

```typescript
{
  executionId: string,          // UUID of execution
  reused: boolean,              // true if idempotent reuse
  streamId?: string,            // For streaming results
  // ... other fields unchanged
}
```

### Execution Status Tracking

When polling execution status, `agent_executions` records now include:

```typescript
{
  id: string,
  agent_id: string | null,      // NULL for temporary executions
  is_temporary: boolean,        // true for temporary runs, false for saved agents
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled',
  input_data: object,
  output_data: object | null,
  // ... other fields
}
```

## UI Recommendations

### Workflow Builder

- Add "Save as Agent" button/toggle (only when saveAsAgent should be true)
- Show "Run Workflow" button for temporary execution (saveAsAgent=false by default)
- When displaying execution history:
  - Mark temporary runs with a badge/indicator
  - Filter option to show only saved agents
  - Option to promote temporary execution to saved agent

### Agent Management

- Update "My Agents" page to exclude temporary executions (filter by `is_temporary=false`)
- Show execution history separately (include temporary runs)

## Migration Steps

1. **Update workflow execution calls**
   - Remove any code that expects agentId to be returned from execution
   - Temporary executions don't create agents - they only return execution results

2. **Update agent saving**
   - Add explicit "Save as Agent" step with `saveAsAgent=true`
   - Require `agentName` when saving

3. **Update UI displays**
   - Filter agent lists to exclude temporary executions
   - Add indicators for temporary vs saved agents

4. **Test thoroughly**
   - Run workflow → should NOT appear in agent list
   - Run workflow → save → should appear in agent list
   - Use existing agentId → should work unchanged

## Backward Compatibility

⚠️ **Breaking Change**: Code that relied on agents being auto-created during execution will need updates.

✅ **Compatible**: Existing code using `agentId` continues to work unchanged.

## Troubleshooting

### Issue: "Failed to create execution record"

**Cause**: Schema migration not applied  
**Fix**: Ensure `supabase-schema.sql` has been executed:

```sql
-- Check if agent_id is nullable
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'agent_executions' AND column_name = 'agent_id';

-- Should show: is_nullable = YES
```

### Issue: Execution created but agent_id is always NULL

**Expected**: This is correct! Temporary executions have NULL agent_id.  
**Check**: Verify `is_temporary = true` in execution record.

### Issue: Can't save workflow as agent

**Fix**: Make sure you're providing:

1. `saveAsAgent: true`
2. `agentName: "Your Agent Name"`
3. `nodes` and `edges` in request body

## Performance Impact

✅ **Improved**: Fewer duplicate agents in database  
✅ **Improved**: Cleaner execution history tracking  
✅ **Improved**: Better resource utilization

No negative performance impact expected.

## Questions & Support

If you encounter issues:

1. Check the execution record's `is_temporary` flag
2. Verify `agent_id` is NULL for temporary executions
3. Ensure `saveAsAgent=true` when you want to persist agents
4. Check backend logs for validation errors
