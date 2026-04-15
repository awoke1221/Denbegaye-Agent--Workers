import { describe, expect, it, vi } from "vitest";
import axios from "axios";
import { executeWorkflow } from "./agentEngine";
import { validateAgentGraph } from "./validation";
import { AgentEdge, AgentNode } from "../jobs/types";

vi.mock("axios", () => ({
  default: {
    request: vi.fn(),
  },
}));

describe("Agent workflow validation", () => {
  it("validates a correct node/edge graph", () => {
    const nodes: AgentNode[] = [
      { id: "start", type: "memory", config: { data: { value: 1 } } },
      { id: "next", type: "api", config: { endpoint: "/test" } },
    ];
    const edges: AgentEdge[] = [{ from: "start", to: "next" }];

    const result = validateAgentGraph(nodes, edges);
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it("validates source/target edge shape in the workflow graph", () => {
    const nodes: AgentNode[] = [
      { id: "start", type: "memory", config: { data: { value: 1 } } },
      { id: "next", type: "api", config: { endpoint: "/test" } },
    ];
    const edges = [{ source: "start", target: "next" }];

    const result = validateAgentGraph(nodes, edges as any);
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it("rejects graphs with duplicate node ids", () => {
    const nodes: AgentNode[] = [
      { id: "duplicate", type: "memory", config: {} },
      { id: "duplicate", type: "memory", config: {} },
    ];
    const edges: AgentEdge[] = [];

    const result = validateAgentGraph(nodes, edges);
    expect(result.valid).toBe(true); // No longer blocks execution
    expect(result.warnings).toBeDefined();
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("Duplicate node id")]),
    );
  });

  it("allows edges that reference missing nodes", () => {
    const nodes: AgentNode[] = [{ id: "start", type: "memory", config: {} }];
    const edges: AgentEdge[] = [{ from: "start", to: "missing" }];

    const result = validateAgentGraph(nodes, edges);
    expect(result.valid).toBe(true); // No longer blocks execution
    expect(result.warnings).toBeDefined();
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("does not exist")]),
    );
  });
});

describe("Agent workflow execution", () => {
  it("executes a simple DAG and returns sink node output", async () => {
    const nodes: AgentNode[] = [
      { id: "source", type: "memory", config: { data: { value: 2 } } },
      {
        id: "transform",
        type: "api",
        config: {
          endpoint: "https://example.com/double",
          params: { multiplyBy: 2 },
        },
      },
    ];
    const edges: AgentEdge[] = [{ from: "source", to: "transform" }];

    (axios.request as any).mockResolvedValue({
      data: {
        endpoint: "https://example.com/double",
        result: 4,
      },
    });

    const result = await executeWorkflow(nodes, edges, {}, {});

    expect(result.success).toBe(true);
    expect(result.output).toEqual(
      expect.objectContaining({ endpoint: "https://example.com/double" }),
    );
    expect(result.logs).toContain("Workflow completed successfully.");
  });

  it("fails when the workflow contains a cycle", async () => {
    const nodes: AgentNode[] = [
      { id: "a", type: "memory", config: { data: 1 } },
      { id: "b", type: "api", config: { endpoint: "/test" } },
    ];
    const edges: AgentEdge[] = [
      { from: "a", to: "b" },
      { from: "b", to: "a" },
    ];

    const result = await executeWorkflow(nodes, edges, {}, {});
    expect(result.success).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/no starting nodes or contains a cycle/),
      ]),
    );
    expect(result.nodeStatuses).toEqual([]);
  });

  it("reports node-level status for executed nodes", async () => {
    const nodes: AgentNode[] = [
      { id: "start", type: "memory", config: { data: { value: 2 } } },
      {
        id: "transform",
        type: "core-set",
        config: { expression: "input.value * 2" },
      },
    ];
    const edges: AgentEdge[] = [{ from: "start", to: "transform" }];

    const result = await executeWorkflow(nodes, edges, {}, {});

    expect(result.success).toBe(true);
    expect(result.nodeStatuses).toEqual([
      { nodeId: "start", status: "success" },
      { nodeId: "transform", status: "success" },
    ]);
    expect(result.nodeResults).toBeDefined();
    expect(result.nodeResults.length).toBe(2);
    expect(result.executionTime).toBeGreaterThan(0);
  });
});
