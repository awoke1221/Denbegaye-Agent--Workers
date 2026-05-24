"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const agentEngine_1 = require("./agentEngine");
const util_1 = __importDefault(require("util"));
async function main() {
    const exec = new agentEngine_1.AdvancedWorkflowExecutor({
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
    exec.persistExecutionState = async () => { };
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
    const result = await exec.executeWorkflow(nodes, edges, {}, {});
    console.log(util_1.default.inspect(result.output, { depth: 5, colors: false }));
    console.log(util_1.default.inspect(result.nodeResults, { depth: 5, colors: false }));
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
