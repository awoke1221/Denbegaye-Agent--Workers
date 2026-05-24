import { describe, it, expect, beforeAll, vi } from "vitest";

// Mock supabase persistence to avoid external dependencies during unit tests.
vi.mock("./supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

import { AdvancedWorkflowExecutor } from "./agentEngine";
import { nodeRegistry } from "../nodes";

describe("AdvancedWorkflowExecutor data flow", () => {
  beforeAll(() => {
    nodeRegistry.register({
      type: "data-node-a",
      handler: async (context: any) => {
        return {
          success: true,
          output: {
            text: `first-step:${context.config.value}`,
            source: "data-node-a",
          },
          logs: ["data-node-a executed"],
        };
      },
    });

    nodeRegistry.register({
      type: "data-node-b",
      handler: async (context: any) => {
        const previousOutput = context.input?.nodeA;
        return {
          success: true,
          output: {
            text: `second-step:${previousOutput?.text ?? ""}${context.config.suffix}`,
            derivedFromNodeA: previousOutput,
            source: "data-node-b",
          },
          logs: ["data-node-b executed"],
        };
      },
    });

    nodeRegistry.register({
      type: "data-node-c",
      handler: async (context: any) => {
        const previousOutput = context.input?.nodeB;
        return {
          success: true,
          output: {
            text: `third-step:${previousOutput?.text ?? ""}`,
            derivedFromNodeB: previousOutput,
            source: "data-node-c",
          },
          logs: ["data-node-c executed"],
        };
      },
    });
  });

  it("propagates output from node A into node B input and then into node C", async () => {
    const executor = new AdvancedWorkflowExecutor({
      executionId: "test-execution",
      userId: "test-user",
      agentId: "test-agent",
      workflowId: "test-workflow",
      startTime: new Date(),
      maxRetries: 0,
      enablePartialSuccess: true,
      enableCompensation: false,
      stopOnFailure: true,
      circuitBreakerThreshold: 5,
      executionTimeout: 10000,
    });

    // Prevent external persistence during the test.
    (executor as any).persistExecutionState = async () => {};

    const nodes = [
      {
        id: "nodeA",
        type: "data-node-a",
        config: { value: "hello" },
      },
      {
        id: "nodeB",
        type: "data-node-b",
        config: { suffix: "-world" },
      },
      {
        id: "nodeC",
        type: "data-node-c",
      },
    ];

    const edges = [
      { source: "nodeA", target: "nodeB" },
      { source: "nodeB", target: "nodeC" },
    ];

    const result = await executor.executeWorkflow(nodes, edges, {}, {}, {});

    expect(result.success).toBe(true);
    expect(result.output.nodeA).toEqual({
      text: "first-step:hello",
      source: "data-node-a",
    });
    expect(result.output.nodeB).toEqual({
      text: "second-step:first-step:hello-world",
      derivedFromNodeA: {
        text: "first-step:hello",
        source: "data-node-a",
      },
      source: "data-node-b",
    });
    expect(result.output.nodeC).toEqual({
      text: "third-step:second-step:first-step:hello-world",
      derivedFromNodeB: {
        text: "second-step:first-step:hello-world",
        derivedFromNodeA: {
          text: "first-step:hello",
          source: "data-node-a",
        },
        source: "data-node-b",
      },
      source: "data-node-c",
    });

    expect(result.nodeResults.map((nodeResult) => nodeResult.nodeId)).toEqual([
      "nodeA",
      "nodeB",
      "nodeC",
    ]);
  });

  it("uses real core node types to pass output through a workflow", async () => {
    const executor = new AdvancedWorkflowExecutor({
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

    (executor as any).persistExecutionState = async () => {};

    const nodes = [
      {
        id: "nodeA",
        type: "core-transform",
        config: {
          expression: '"hello"',
        },
      },
      {
        id: "nodeB",
        type: "core-transform",
        config: {
          expression: 'variables.nodeA.transformed + " world"',
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

    const result = await executor.executeWorkflow(nodes, edges, {}, {}, {});

    expect(result.success).toBe(true);
    expect(result.output.nodeA?.transformed).toBe("hello");
    expect(result.output.nodeB?.transformed).toBe("hello world");
    expect(result.output.nodeC?.transformed).toBe("hello world!!!");
    expect(result.nodeResults.map((nodeResult) => nodeResult.nodeId)).toEqual([
      "nodeA",
      "nodeB",
      "nodeC",
    ]);
  });
});
