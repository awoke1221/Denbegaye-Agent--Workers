"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const validation_1 = require("./validation");
(0, vitest_1.describe)("normalizeAgentEdges", () => {
    (0, vitest_1.it)("converts source/target format to from/to format", () => {
        const edges = [
            { source: "node1", target: "node2" },
            { from: "node2", to: "node3" },
        ];
        const result = (0, validation_1.normalizeAgentEdges)(edges);
        (0, vitest_1.expect)(result).toEqual([
            { from: "node1", to: "node2" },
            { from: "node2", to: "node3" },
        ]);
    });
    (0, vitest_1.it)("throws error for invalid edge format", () => {
        const edges = [{ invalid: "format" }];
        (0, vitest_1.expect)(() => (0, validation_1.normalizeAgentEdges)(edges)).toThrow("Edges must include");
    });
});
(0, vitest_1.describe)("normalizeAgentNodes", () => {
    (0, vitest_1.it)("extracts config from node.data.config when top-level config is missing", () => {
        const nodes = [
            {
                id: "node1",
                type: "ai-openai",
                data: { config: { apiKey: "key", model: "gpt-4", prompt: "Hello" } },
            },
        ];
        const result = (0, validation_1.normalizeAgentNodes)(nodes);
        (0, vitest_1.expect)(result).toHaveLength(1);
        (0, vitest_1.expect)(result[0]).toMatchObject({
            id: "node1",
            type: "ai-openai",
            config: { apiKey: "key", model: "gpt-4", prompt: "Hello" },
        });
        (0, vitest_1.expect)(result[0].data).toEqual(nodes[0].data);
    });
});
(0, vitest_1.describe)("validateAgentGraph", () => {
    (0, vitest_1.it)("validates a simple valid graph", () => {
        const nodes = [
            { id: "start", type: "memory", config: { data: "test" } },
            { id: "end", type: "api", config: { endpoint: "/test" } },
        ];
        const edges = [{ from: "start", to: "end" }];
        const result = (0, validation_1.validateAgentGraph)(nodes, edges);
        (0, vitest_1.expect)(result.valid).toBe(true);
        (0, vitest_1.expect)(result.errors).toBeUndefined();
        (0, vitest_1.expect)(result.executionPlan).toBeDefined();
        (0, vitest_1.expect)(result.executionPlan?.executionOrder).toEqual(["start", "end"]);
    });
    (0, vitest_1.it)("detects duplicate node IDs", () => {
        const nodes = [
            { id: "duplicate", type: "memory", config: {} },
            { id: "duplicate", type: "api", config: {} },
        ];
        const edges = [];
        const result = (0, validation_1.validateAgentGraph)(nodes, edges);
        (0, vitest_1.expect)(result.valid).toBe(true); // Warnings don't block execution
        (0, vitest_1.expect)(result.warnings).toContain("Duplicate node id(s): duplicate");
    });
    (0, vitest_1.it)("detects edges referencing non-existent nodes", () => {
        const nodes = [{ id: "start", type: "memory", config: {} }];
        const edges = [{ from: "start", to: "missing" }];
        const result = (0, validation_1.validateAgentGraph)(nodes, edges);
        (0, vitest_1.expect)(result.valid).toBe(true); // Warnings don't block execution
        (0, vitest_1.expect)(result.warnings).toContain("Edge target node missing does not exist");
    });
    (0, vitest_1.it)("validates AI node configuration", () => {
        const nodes = [
            { id: "ai", type: "ai-openai", config: {} }, // Missing prompt
        ];
        const edges = [];
        const result = (0, validation_1.validateAgentGraph)(nodes, edges);
        (0, vitest_1.expect)(result.valid).toBe(true); // Warnings don't block execution
        (0, vitest_1.expect)(result.errors).toContain("Node ai: AI nodes require a prompt or messages configuration");
    });
    (0, vitest_1.it)("validates API node configuration", () => {
        const nodes = [
            { id: "api", type: "api", config: {} }, // Missing URL
        ];
        const edges = [];
        const result = (0, validation_1.validateAgentGraph)(nodes, edges);
        (0, vitest_1.expect)(result.valid).toBe(true); // Warnings don't block execution
        (0, vitest_1.expect)(result.errors).toContain("Node api: API nodes require a URL or endpoint configuration");
    });
    (0, vitest_1.it)("validates email action configuration", () => {
        const nodes = [
            { id: "email", type: "action-email", config: {} }, // Missing recipients
        ];
        const edges = [];
        const result = (0, validation_1.validateAgentGraph)(nodes, edges);
        (0, vitest_1.expect)(result.valid).toBe(true); // Warnings don't block execution
        (0, vitest_1.expect)(result.errors).toContain("Node email: Email action nodes require recipient configuration");
    });
    (0, vitest_1.it)("validates logic-if configuration", () => {
        const nodes = [
            { id: "logic", type: "logic-if", config: {} }, // Missing condition
        ];
        const edges = [];
        const result = (0, validation_1.validateAgentGraph)(nodes, edges);
        (0, vitest_1.expect)(result.valid).toBe(true); // Warnings don't block execution
        (0, vitest_1.expect)(result.errors).toContain("Node logic: Logic nodes require a condition configuration");
    });
    (0, vitest_1.it)("generates execution plan for complex graph", () => {
        const nodes = [
            { id: "a", type: "memory", config: {} },
            { id: "b", type: "memory", config: {} },
            { id: "c", type: "api", config: { endpoint: "/test" } },
            { id: "d", type: "memory", config: {} },
        ];
        const edges = [
            { from: "a", to: "c" },
            { from: "b", to: "c" },
            { from: "c", to: "d" },
        ];
        const result = (0, validation_1.validateAgentGraph)(nodes, edges);
        (0, vitest_1.expect)(result.valid).toBe(true);
        (0, vitest_1.expect)(result.executionPlan?.executionOrder).toEqual(["a", "b", "c", "d"]);
        (0, vitest_1.expect)(result.executionPlan?.nodeDependencies).toEqual({
            a: [],
            b: [],
            c: ["a", "b"],
            d: ["c"],
        });
    });
});
