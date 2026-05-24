import { AdvancedWorkflowExecutor } from "./agentEngine";
import util from "util";

async function main() {
  const exec = new AdvancedWorkflowExecutor({
    executionId: "real-node-test",
    userId: "test-user",
    agentId: "test-agent",
    workflowId: "real-node-workflow",
    startTime: new Date(),
    maxRetries: 0,
    enablePartialSuccess: true,
    enableCompensation: false,
    stopOnFailure: true,
    circuitBreakerThreshold: 5,
    executionTimeout: 10000,
  });

  (exec as any).persistExecutionState = async () => {};

  const nodes = [
    {
      id: "nodeA",
      type: "core-set",
      config: {
        expression: '"hello"',
        variableName: "greeting",
      },
    },
    {
      id: "nodeB",
      type: "core-transform",
      config: {
        expression: 'variables.greeting + " world"',
      },
    },
    {
      id: "nodeC",
      type: "core-transform",
      config: {
        expression: 'variables.nodeB.transformed + "!!!"',
      },
    },
  ];

  const edges = [
    { source: "nodeA", target: "nodeB" },
    { source: "nodeB", target: "nodeC" },
  ];

  const result = await exec.executeWorkflow(nodes, edges, {}, {});
  console.log(util.inspect(result, { depth: 5, colors: false }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
