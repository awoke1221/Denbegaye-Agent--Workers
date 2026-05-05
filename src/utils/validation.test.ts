import { describe, expect, it } from "vitest";
import { validateAgentGraph, normalizeAgentEdges } from "./validation";
import { AgentEdge, AgentNode } from "../jobs/types";

describe("normalizeAgentEdges", () => {
  it("converts source/target format to from/to format", () => {
    const edges = [
      { source: "node1", target: "node2" },
      { from: "node2", to: "node3" },
    ];

    const result = normalizeAgentEdges(edges as any);
    expect(result).toEqual([
      { from: "node1", to: "node2" },
      { from: "node2", to: "node3" },
    ]);
  });

  it("throws error for invalid edge format", () => {
    const edges = [{ invalid: "format" }];

    expect(() => normalizeAgentEdges(edges as any)).toThrow(
      "Edges must include",
    );
  });
});

describe("validateAgentGraph", () => {
  it("validates a simple valid graph", () => {
    const nodes: AgentNode[] = [
      { id: "start", type: "memory", config: { data: "test" } },
      { id: "end", type: "api", config: { endpoint: "/test" } },
    ];
    const edges: AgentEdge[] = [{ from: "start", to: "end" }];

    const result = validateAgentGraph(nodes, edges);
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
    expect(result.executionPlan).toBeDefined();
    expect(result.executionPlan?.executionOrder).toEqual(["start", "end"]);
  });

  it("detects duplicate node IDs", () => {
    const nodes: AgentNode[] = [
      { id: "duplicate", type: "memory", config: {} },
      { id: "duplicate", type: "api", config: {} },
    ];
    const edges: AgentEdge[] = [];

    const result = validateAgentGraph(nodes, edges);
    expect(result.valid).toBe(true); // Warnings don't block execution
    expect(result.warnings).toContain("Duplicate node id(s): duplicate");
  });

  it("detects edges referencing non-existent nodes", () => {
    const nodes: AgentNode[] = [{ id: "start", type: "memory", config: {} }];
    const edges: AgentEdge[] = [{ from: "start", to: "missing" }];

    const result = validateAgentGraph(nodes, edges);
    expect(result.valid).toBe(true); // Warnings don't block execution
    expect(result.warnings).toContain(
      "Edge target node missing does not exist",
    );
  });

  it("validates AI node configuration", () => {
    const nodes: AgentNode[] = [
      { id: "ai", type: "ai-openai", config: {} }, // Missing prompt
    ];
    const edges: AgentEdge[] = [];

    const result = validateAgentGraph(nodes, edges);
    expect(result.valid).toBe(true); // Warnings don't block execution
    expect(result.errors).toContain(
      "Node ai: AI nodes require a prompt or messages configuration",
    );
  });

  it("validates API node configuration", () => {
    const nodes: AgentNode[] = [
      { id: "api", type: "api", config: {} }, // Missing URL
    ];
    const edges: AgentEdge[] = [];

    const result = validateAgentGraph(nodes, edges);
    expect(result.valid).toBe(true); // Warnings don't block execution
    expect(result.errors).toContain(
      "Node api: API nodes require a URL or endpoint configuration",
    );
  });

  it("validates email action configuration", () => {
    const nodes: AgentNode[] = [
      { id: "email", type: "action-email", config: {} }, // Missing recipients
    ];
    const edges: AgentEdge[] = [];

    const result = validateAgentGraph(nodes, edges);
    expect(result.valid).toBe(true); // Warnings don't block execution
    expect(result.errors).toContain(
      "Node email: Email action nodes require recipient configuration",
    );
  });

  it("validates logic-if configuration", () => {
    const nodes: AgentNode[] = [
      { id: "logic", type: "logic-if", config: {} }, // Missing condition
    ];
    const edges: AgentEdge[] = [];

    const result = validateAgentGraph(nodes, edges);
    expect(result.valid).toBe(true); // Warnings don't block execution
    expect(result.errors).toContain(
      "Node logic: Logic nodes require a condition configuration",
    );
  });

  it("generates execution plan for complex graph", () => {
    const nodes: AgentNode[] = [
      { id: "a", type: "memory", config: {} },
      { id: "b", type: "memory", config: {} },
      { id: "c", type: "api", config: { endpoint: "/test" } },
      { id: "d", type: "memory", config: {} },
    ];
    const edges: AgentEdge[] = [
      { from: "a", to: "c" },
      { from: "b", to: "c" },
      { from: "c", to: "d" },
    ];

    const result = validateAgentGraph(nodes, edges);
    expect(result.valid).toBe(true);
    expect(result.executionPlan?.executionOrder).toEqual(["a", "b", "c", "d"]);
    expect(result.executionPlan?.nodeDependencies).toEqual({
      a: [],
      b: [],
      c: ["a", "b"],
      d: ["c"],
    });
  });
});
