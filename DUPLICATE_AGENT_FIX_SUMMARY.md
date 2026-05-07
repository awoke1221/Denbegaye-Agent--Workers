# Duplicate Agent Creation Fix - Summary

## Problem Statement

When running a workflow without an explicit `agentId`, the backend was automatically creating a new agent record in the database every time. This resulted in duplicate agents accumulating and wasn't the intended behavior for temporary workflow executions.

**Example Issue**: Running the same workflow 5 times would create 5 different agents instead of reusing one or treating executions as temporary.

## Root Cause Analysis

The `/api/agent-run` route in `src/routes/agentRun.ts` had conditional logic:

- If `agentId` provided → use existing agent ✓
- If `agentId` NOT provided → **automatically INSERT new agent** ✗

This logic treated every execution without an explicit agent ID as a reason to create and save a new agent.

## Solution Implemented

### 1. Request Parameters Extended

**File**: `src/utils/agentQueue.ts`

Added two new optional parameters to `agentRunSchema`:

```typescript
saveAsAgent: boolean; // Default: false - Only create agent if explicitly requested
isTemporary: boolean; // Default: true - Mark as temporary execution
```

### 2. Agent Creation Logic Refactored

**File**: `src/routes/agentRun.ts`

Changed from 2-branch to 3-branch logic:

**Branch 1: Existing Agent** (agentId provided)

- Fetches existing agent from database
- Uses for execution
- No changes to this behavior

**Branch 2: New Persistent Agent** (saveAsAgent=true AND agentName provided)

- Creates and saves new agent to database
- Requires explicit opt-in with `saveAsAgent: true`
- Requires `agentName` to be provided
- **This is now the only way to create new agents during execution**

**Branch 3: Temporary Execution** (default behavior)

- Generates temporary ID: `temp_${timestamp}_${random}`
- Does NOT create agent record
- Execution is tracked but not persisted as an agent
- **This is now the default for ad-hoc workflow testing**

### 3. Database Schema Updated

**File**: `supabase-schema.sql`

Added migration statements:

```sql
-- Make agent_id nullable to support temporary executions
ALTER TABLE public.agent_executions DROP CONSTRAINT IF EXISTS agent_executions_agent_id_fkey;
ALTER TABLE public.agent_executions ALTER COLUMN agent_id DROP NOT NULL;
ALTER TABLE public.agent_executions ADD CONSTRAINT agent_executions_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.user_agents(id) ON DELETE CASCADE;

-- Add flag to mark temporary executions
ALTER TABLE public.agent_executions ADD COLUMN IF NOT EXISTS is_temporary BOOLEAN DEFAULT FALSE;
```

**Key Changes**:

- `agent_id` column is now nullable (was NOT NULL)
- New `is_temporary` boolean column (default: false)
- Maintained referential integrity with ON DELETE CASCADE

### 4. Execution Record Insertion Updated

**File**: `src/routes/agentRun.ts`

When inserting execution record:

- Only include `agent_id` if it's not a temporary ID (not starting with "temp\_")
- Set `is_temporary = true` for temporary executions
- This prevents foreign key constraint violations with temporary IDs

## Impact Analysis

### What Changed for Users ✅

| Use Case                   | Before                          | After                                       | Action Needed              |
| -------------------------- | ------------------------------- | ------------------------------------------- | -------------------------- |
| **Run workflow (testing)** | ❌ Creates new agent every time | ✅ Temporary execution, no agent saved      | None - automatically fixed |
| **Save workflow as agent** | ❌ Not available                | ✅ Use `saveAsAgent: true` with `agentName` | Add save functionality     |
| **Use existing agent**     | ✅ Works                        | ✅ Works unchanged                          | None                       |

### Benefits 📈

1. **No More Duplicate Agents** - Workflow execution no longer creates unwanted agent records
2. **Explicit Control** - Must opt-in with `saveAsAgent=true` to persist workflows
3. **Cleaner History** - Agent list only shows intentionally saved agents, not test runs
4. **Better Tracking** - Temporary executions marked with `is_temporary=true` flag
5. **Backward Compatible** - Existing code using `agentId` continues to work

## Files Modified

1. **src/routes/agentRun.ts** - Core logic refactored
   - Lines 75-125: Three-branch agent selection logic
   - Lines 175-190: Conditional execution data insertion

2. **src/utils/agentQueue.ts** - Request schema updated
   - Added `saveAsAgent` parameter (boolean, default: false)
   - Added `isTemporary` parameter (boolean, default: true)

3. **supabase-schema.sql** - Database schema updated
   - Made `agent_id` nullable
   - Added `is_temporary` column
   - Updated migration statements

## Frontend Integration Required

### For Workflow Execution (Default - Ad-hoc Testing)

```typescript
// This is what developers should do for temporary workflow runs
const response = await fetch("/api/agent-run", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    nodes: workflowNodes,
    edges: workflowEdges,
    input: testData,
    // No need to provide agentName or saveAsAgent
    // They default to not saving as agent
  }),
});
```

### For Saving Workflow as Agent (Requires Update)

```typescript
// This is NEW - explicit save-as-agent flow
const response = await fetch("/api/agent-run", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    nodes: workflowNodes,
    edges: workflowEdges,
    agentName: "My Saved Agent", // Must provide name to save
    saveAsAgent: true, // Explicitly request save
    input: testData,
  }),
});
```

### For Using Existing Agent (Unchanged)

```typescript
// This continues to work as before
const response = await fetch("/api/agent-run", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    agentId: existingAgentUUID,
    input: testData,
  }),
});
```

## Next Steps

1. **Apply Database Migration**
   - Run the updated `supabase-schema.sql` in your Supabase project
   - Verify `agent_executions.agent_id` is nullable
   - Verify `agent_executions.is_temporary` column exists

2. **Deploy Backend Changes**
   - Deploy `src/routes/agentRun.ts`
   - Deploy `src/utils/agentQueue.ts`

3. **Update Frontend**
   - Update workflow execution calls (no agent creation expected)
   - Add "Save as Agent" functionality with explicit `saveAsAgent: true` and `agentName`
   - Update UI to distinguish between temporary and saved agents
   - See `DUPLICATE_AGENT_FIX_INTEGRATION.md` for detailed frontend guide

4. **Update UI Displays**
   - Filter "My Agents" list to exclude temporary executions (`is_temporary = false`)
   - Add badges/indicators for temporary vs saved agents in execution history
   - Show separate "Execution History" and "My Agents" sections

5. **Test Thoroughly**
   - Run workflow without saving → should NOT appear in agent list
   - Run workflow with `saveAsAgent: true` → should appear in agent list
   - Run workflow with existing `agentId` → should work unchanged
   - Verify no duplicate agents created

## Breaking Changes ⚠️

**Code that relied on agents being auto-created during execution will need updates:**

- Any code expecting `agentId` to be returned from a workflow run
- Any code checking agent list immediately after running workflow without explicit save
- Any code assuming every execution creates an agent

## Verification Checklist

- [ ] Database migration applied successfully
- [ ] `agent_id` column is nullable in `agent_executions`
- [ ] `is_temporary` column exists in `agent_executions`
- [ ] Backend code deployed
- [ ] Frontend calls updated to use new parameters
- [ ] Test temporary execution (should not create agent)
- [ ] Test explicit agent save (with `saveAsAgent: true`)
- [ ] Test existing agent use (with `agentId`)
- [ ] No duplicate agents appearing in UI
- [ ] Execution history shows both temporary and saved agents

## Documentation

See `DUPLICATE_AGENT_FIX_INTEGRATION.md` for comprehensive frontend integration guide with:

- Detailed code examples
- UI recommendations
- Migration steps
- Troubleshooting guide
- Performance impact analysis
