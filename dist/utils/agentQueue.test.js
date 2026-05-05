"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const agentQueue_1 = require("./agentQueue");
const supabaseClient_1 = require("./supabaseClient");
// Mock Supabase
vitest_1.vi.mock("./supabaseClient", () => ({
    supabase: {
        from: vitest_1.vi.fn(() => ({
            select: vitest_1.vi.fn(() => ({
                eq: vitest_1.vi.fn(() => ({
                    single: vitest_1.vi.fn(() => Promise.resolve({ data: null, error: null })),
                    order: vitest_1.vi.fn(() => ({
                        limit: vitest_1.vi.fn(() => Promise.resolve({ data: [], error: null })),
                    })),
                })),
                in: vitest_1.vi.fn(() => ({
                    select: vitest_1.vi.fn(() => ({
                        count: vitest_1.vi.fn(() => Promise.resolve({ count: 0, error: null })),
                    })),
                })),
            })),
            insert: vitest_1.vi.fn(() => Promise.resolve({ error: null })),
            update: vitest_1.vi.fn(() => Promise.resolve({ error: null })),
            delete: vitest_1.vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
    },
}));
(0, vitest_1.describe)("agentRunSchema", () => {
    (0, vitest_1.it)("validates a complete valid payload", () => {
        const validPayload = {
            agentId: "agent-123",
            nodes: [
                { id: "node1", type: "memory", config: { data: "test" } },
                { id: "node2", type: "api", config: { endpoint: "/test" } },
            ],
            edges: [{ from: "node1", to: "node2" }],
            input: { test: "data" },
            apiKeys: { openai: "sk-123" },
            agentName: "Test Agent",
        };
        const result = agentQueue_1.agentRunSchema.safeParse(validPayload);
        (0, vitest_1.expect)(result.success).toBe(true);
        (0, vitest_1.expect)(result.data).toEqual(validPayload);
    });
    (0, vitest_1.it)("validates minimal payload", () => {
        const minimalPayload = {
            nodes: [{ id: "node1", type: "memory", config: {} }],
            edges: [],
            input: {},
            apiKeys: {},
            agentName: "Test Agent",
        };
        const result = agentQueue_1.agentRunSchema.safeParse(minimalPayload);
        (0, vitest_1.expect)(result.success).toBe(true);
    });
    (0, vitest_1.it)("rejects payload with duplicate node IDs", () => {
        const invalidPayload = {
            nodes: [
                { id: "duplicate", type: "memory", config: {} },
                { id: "duplicate", type: "api", config: {} },
            ],
            edges: [],
            input: {},
            apiKeys: {},
            agentName: "Test Agent",
        };
        const result = agentQueue_1.agentRunSchema.safeParse(invalidPayload);
        (0, vitest_1.expect)(result.success).toBe(false);
        (0, vitest_1.expect)(result.error?.issues[0].message).toContain("Invalid graph");
    });
    (0, vitest_1.it)("rejects payload with edges referencing non-existent nodes", () => {
        const invalidPayload = {
            nodes: [{ id: "node1", type: "memory", config: {} }],
            edges: [{ from: "node1", to: "nonexistent" }],
            input: {},
            apiKeys: {},
            agentName: "Test Agent",
        };
        const result = agentQueue_1.agentRunSchema.safeParse(invalidPayload);
        (0, vitest_1.expect)(result.success).toBe(false);
        (0, vitest_1.expect)(result.error?.issues[0].message).toContain("Invalid graph");
    });
    (0, vitest_1.it)("requires at least one node", () => {
        const invalidPayload = {
            nodes: [],
            edges: [],
            input: {},
            apiKeys: {},
            agentName: "Test Agent",
        };
        const result = agentQueue_1.agentRunSchema.safeParse(invalidPayload);
        (0, vitest_1.expect)(result.success).toBe(false);
    });
    (0, vitest_1.it)("validates agentId format", () => {
        const invalidPayload = {
            agentId: "not-a-uuid",
            nodes: [{ id: "node1", type: "memory", config: {} }],
            edges: [],
            input: {},
            apiKeys: {},
            agentName: "Test Agent",
        };
        const result = agentQueue_1.agentRunSchema.safeParse(invalidPayload);
        (0, vitest_1.expect)(result.success).toBe(false);
    });
});
(0, vitest_1.describe)("QueueManager", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)("gets queue stats", async () => {
        const mockSupabase = vitest_1.vi.mocked(supabaseClient_1.supabase);
        mockSupabase.from.mockReturnValue({
            select: vitest_1.vi.fn(() => ({
                eq: vitest_1.vi.fn(() => ({
                    order: vitest_1.vi.fn(() => ({
                        limit: vitest_1.vi.fn(() => Promise.resolve({ data: [], error: null })),
                    })),
                })),
                in: vitest_1.vi.fn(() => ({
                    select: vitest_1.vi.fn(() => ({
                        count: vitest_1.vi.fn(() => Promise.resolve({ count: 0, error: null })),
                    })),
                })),
                gt: vitest_1.vi.fn(() => ({
                    order: vitest_1.vi.fn(() => ({
                        limit: vitest_1.vi.fn(() => Promise.resolve({ data: [], error: null })),
                    })),
                })),
            })),
        });
        const stats = await agentQueue_1.QueueManager.getQueueStats();
        (0, vitest_1.expect)(stats).toEqual({
            waiting: 0,
            active: 0,
            completed: 0,
            failed: 0,
            delayed: 0,
            deadLetter: 0,
        });
    });
    (0, vitest_1.it)("cleans up old jobs", async () => {
        const mockSupabase = vitest_1.vi.mocked(supabaseClient_1.supabase);
        mockSupabase.from.mockReturnValue({
            delete: vitest_1.vi.fn(() => ({
                eq: vitest_1.vi.fn(() => ({
                    lt: vitest_1.vi.fn(() => Promise.resolve({ data: [], error: null })),
                })),
            })),
        });
        const result = await agentQueue_1.QueueManager.cleanupOldJobs(30);
        (0, vitest_1.expect)(result).toEqual({
            completedJobsCleaned: 0,
            failedJobsCleaned: 0,
        });
    });
});
(0, vitest_1.describe)("agentQueue", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)("adds job to queue", async () => {
        const mockSupabase = vitest_1.vi.mocked(supabaseClient_1.supabase);
        mockSupabase.from.mockReturnValue({
            insert: vitest_1.vi.fn(() => Promise.resolve({ error: null })),
        });
        const jobData = {
            agentId: "agent-123",
            userId: "user-123",
            input: { test: "data" },
            config: { nodes: [], edges: [] },
            apiKeys: "encrypted-keys",
            executionId: "exec-123",
        };
        const result = await agentQueue_1.agentQueue.add(jobData);
        (0, vitest_1.expect)(result).toHaveProperty("id");
        (0, vitest_1.expect)(typeof result.id).toBe("string");
    });
    (0, vitest_1.it)("gets waiting jobs", async () => {
        const mockSupabase = vitest_1.vi.mocked(supabaseClient_1.supabase);
        mockSupabase.from.mockReturnValue({
            select: vitest_1.vi.fn(() => ({
                eq: vitest_1.vi.fn(() => ({
                    lt: vitest_1.vi.fn(() => ({
                        not: vitest_1.vi.fn(() => ({
                            order: vitest_1.vi.fn(() => ({
                                limit: vitest_1.vi.fn(() => Promise.resolve({ data: [], error: null })),
                            })),
                        })),
                    })),
                })),
            })),
        });
        const jobs = await agentQueue_1.agentQueue.getWaiting();
        (0, vitest_1.expect)(jobs).toEqual([]);
    });
});
