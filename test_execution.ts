import { agentQueue } from "./src/utils/agentQueue";
import { supabase } from "./src/utils/supabaseClient";
import { encryptValue } from "./src/utils/encryption";

async function testJobExecution() {
  try {
    console.log("Creating test job...");

    const testPayload = {
      agentId: "test-agent",
      userId: "test-user",
      executionId: `test-exec-${Date.now()}`,
      nodes: [
        {
          id: "1",
          type: "ai-gemini",
          config: {
            apiKey: "test-key",
            model: "gemini-1.5-pro",
            prompt: "Hello",
          },
        },
        {
          id: "2",
          type: "trigger-email",
          config: {
            email: "test@example.com",
            subject: "Test",
          },
        },
      ],
      edges: [
        {
          from: "1",
          to: "2",
        },
      ],
      input: { message: "test" },
      apiKeys: encryptValue(
        JSON.stringify({
          gemini: "test-key",
        }),
      ),
      agentName: "Test Agent",
      config: {
        nodes: [
          {
            id: "1",
            type: "ai-gemini",
            config: {
              apiKey: "test-key",
              model: "gemini-1.5-pro",
              prompt: "Hello",
            },
          },
          {
            id: "2",
            type: "trigger-email",
            config: {
              email: "test@example.com",
              subject: "Test",
            },
          },
        ],
        edges: [
          {
            from: "1",
            to: "2",
          },
        ],
      },
    };

    // Enqueue the job
    const result = await agentQueue.add(testPayload);
    console.log("Job enqueued:", result);

    // Wait for job to process
    console.log("Waiting for job to process...");
    await new Promise((resolve) => setTimeout(resolve, 10000));

    // Check job status
    const { data: job } = await supabase
      .from("job_queue")
      .select("*")
      .eq("id", result.id)
      .single();

    console.log("Job status:", job);

    // Check execution status
    const { data: execution } = await supabase
      .from("agent_executions")
      .select("*")
      .eq("id", testPayload.executionId)
      .single();

    console.log("Execution status:", execution);
  } catch (error) {
    console.error("Test error:", error);
  }
}

testJobExecution();
