import { randomUUID } from "crypto";
import { supabase } from "./src/utils/supabaseClient";
import { encryptValue } from "./src/utils/encryption";

async function main() {
  const executionId = randomUUID();
  const jobId = `test_job_${Date.now()}`;
  const userId = randomUUID();
  const agentId = randomUUID();

  const executionResp = await supabase
    .from("agent_executions")
    .insert({
      id: executionId,
      user_id: userId,
      agent_id: agentId,
      status: "queued",
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  console.log("executionResp", executionResp.error || executionResp.data);

  const jobResp = await supabase
    .from("job_queue")
    .insert({
      id: jobId,
      job_type: "agent_execution",
      payload: {
        agentId,
        nodes: [{ id: "dummy1", type: "dummy", config: {} }],
        edges: [],
        input: { hello: "world" },
        apiKeys: encryptValue(JSON.stringify({})),
        userId,
        executionId,
        config: {
          nodes: [{ id: "dummy1", type: "dummy", config: {} }],
          edges: [],
        },
      },
      status: "queued",
      priority: 1,
      attempt_count: 0,
      scheduled_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  console.log("jobResp", jobResp.error || jobResp.data);
  console.log("executionId", executionId);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
