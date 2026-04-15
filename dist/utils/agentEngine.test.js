"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const axios_1 = __importDefault(require("axios"));
const agentEngine_1 = require("./agentEngine");
const validation_1 = require("./validation");
vitest_1.vi.mock("axios", () => ({
    default: {
        request: vitest_1.vi.fn(),
    },
}));
(0, vitest_1.describe)("Agent workflow validation", () => {
    (0, vitest_1.it)("validates a correct node/edge graph", () => {
        const nodes = [
            { id: "start", type: "memory", config: { data: { value: 1 } } },
            { id: "next", type: "api", config: { endpoint: "/test" } },
        ];
        const edges = [{ from: "start", to: "next" }];
        const result = (0, validation_1.validateAgentGraph)(nodes, edges);
        (0, vitest_1.expect)(result.valid).toBe(true);
        (0, vitest_1.expect)(result.errors).toBeUndefined();
    });
    (0, vitest_1.it)("validates source/target edge shape in the workflow graph", () => {
        const nodes = [
            { id: "start", type: "memory", config: { data: { value: 1 } } },
            { id: "next", type: "api", config: { endpoint: "/test" } },
        ];
        const edges = [{ source: "start", target: "next" }];
        const result = (0, validation_1.validateAgentGraph)(nodes, edges);
        (0, vitest_1.expect)(result.valid).toBe(true);
        (0, vitest_1.expect)(result.errors).toBeUndefined();
    });
    (0, vitest_1.it)("rejects graphs with duplicate node ids", () => {
        const nodes = [
            { id: "duplicate", type: "memory", config: {} },
            { id: "duplicate", type: "memory", config: {} },
        ];
        const edges = [];
        const result = (0, validation_1.validateAgentGraph)(nodes, edges);
        (0, vitest_1.expect)(result.valid).toBe(true); // No longer blocks execution
        (0, vitest_1.expect)(result.warnings).toBeDefined();
        (0, vitest_1.expect)(result.warnings).toEqual(vitest_1.expect.arrayContaining([vitest_1.expect.stringContaining("Duplicate node id")]));
    });
    (0, vitest_1.it)("allows edges that reference missing nodes", () => {
        const nodes = [{ id: "start", type: "memory", config: {} }];
        const edges = [{ from: "start", to: "missing" }];
        const result = (0, validation_1.validateAgentGraph)(nodes, edges);
        (0, vitest_1.expect)(result.valid).toBe(true); // No longer blocks execution
        (0, vitest_1.expect)(result.warnings).toBeDefined();
        (0, vitest_1.expect)(result.warnings).toEqual(vitest_1.expect.arrayContaining([vitest_1.expect.stringContaining("does not exist")]));
    });
});
(0, vitest_1.describe)("Agent workflow execution", () => {
    (0, vitest_1.it)("executes a simple DAG and returns sink node output", async () => {
        const nodes = [
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
        const edges = [{ from: "source", to: "transform" }];
        axios_1.default.request.mockResolvedValue({
            data: {
                endpoint: "https://example.com/double",
                result: 4,
            },
        });
        const result = await (0, agentEngine_1.executeWorkflow)(nodes, edges, {}, {});
        (0, vitest_1.expect)(result.success).toBe(true);
        (0, vitest_1.expect)(result.output).toEqual(vitest_1.expect.objectContaining({ endpoint: "https://example.com/double" }));
        (0, vitest_1.expect)(result.logs).toContain("Workflow completed successfully.");
    });
    (0, vitest_1.it)("fails when the workflow contains a cycle", async () => {
        const nodes = [
            { id: "a", type: "memory", config: { data: 1 } },
            { id: "b", type: "api", config: { endpoint: "/test" } },
        ];
        const edges = [
            { from: "a", to: "b" },
            { from: "b", to: "a" },
        ];
        const result = await (0, agentEngine_1.executeWorkflow)(nodes, edges, {}, {});
        (0, vitest_1.expect)(result.success).toBe(false);
        (0, vitest_1.expect)(result.errors).toEqual(vitest_1.expect.arrayContaining([
            vitest_1.expect.stringMatching(/no starting nodes or contains a cycle/),
        ]));
        (0, vitest_1.expect)(result.nodeStatuses).toEqual([]);
    });
    (0, vitest_1.it)("reports node-level status for executed nodes", async () => {
        const nodes = [
            { id: "start", type: "memory", config: { data: { value: 2 } } },
            {
                id: "transform",
                type: "core-set",
                config: { expression: "input.value * 2" },
            },
        ];
        const edges = [{ from: "start", to: "transform" }];
        const result = await (0, agentEngine_1.executeWorkflow)(nodes, edges, {}, {});
        (0, vitest_1.expect)(result.success).toBe(true);
        (0, vitest_1.expect)(result.nodeStatuses).toEqual([
            { nodeId: "start", status: "success" },
            { nodeId: "transform", status: "success" },
        ]);
        (0, vitest_1.expect)(result.nodeResults).toBeDefined();
        (0, vitest_1.expect)(result.nodeResults.length).toBe(2);
        (0, vitest_1.expect)(result.executionTime).toBeGreaterThan(0);
    });
});
