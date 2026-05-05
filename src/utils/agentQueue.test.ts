import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { agentQueue, agentRunSchema, QueueManager } from "./agentQueue";
import { supabase } from "./supabaseClient";

// Mock Supabase
vi.mock("./supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
        in: vi.fn(() => ({
          select: vi.fn(() => ({
            count: vi.fn(() => Promise.resolve({ count: 0, error: null })),
          })),
        })),
      })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
      update: vi.fn(() => Promise.resolve({ error: null })),
      delete: vi.fn(() => Promise.resolve({ data: [], error: null })),
    })),
  },
}));

describe("agentRunSchema", () => {
  it("validates a complete valid payload", () => {
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

    const result = agentRunSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(validPayload);
  });

  it("validates minimal payload", () => {
    const minimalPayload = {
      nodes: [{ id: "node1", type: "memory", config: {} }],
      edges: [],
      input: {},
      apiKeys: {},
      agentName: "Test Agent",
    };

    const result = agentRunSchema.safeParse(minimalPayload);
    expect(result.success).toBe(true);
  });

  it("rejects payload with duplicate node IDs", () => {
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

    const result = agentRunSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain("Invalid graph");
  });

  it("rejects payload with edges referencing non-existent nodes", () => {
    const invalidPayload = {
      nodes: [{ id: "node1", type: "memory", config: {} }],
      edges: [{ from: "node1", to: "nonexistent" }],
      input: {},
      apiKeys: {},
      agentName: "Test Agent",
    };

    const result = agentRunSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toContain("Invalid graph");
  });

  it("requires at least one node", () => {
    const invalidPayload = {
      nodes: [],
      edges: [],
      input: {},
      apiKeys: {},
      agentName: "Test Agent",
    };

    const result = agentRunSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });

  it("validates agentId format", () => {
    const invalidPayload = {
      agentId: "not-a-uuid",
      nodes: [{ id: "node1", type: "memory", config: {} }],
      edges: [],
      input: {},
      apiKeys: {},
      agentName: "Test Agent",
    };

    const result = agentRunSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });
});

describe("QueueManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gets queue stats", async () => {
    const mockSupabase = vi.mocked(supabase);
    mockSupabase.from.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
        in: vi.fn(() => ({
          select: vi.fn(() => ({
            count: vi.fn(() => Promise.resolve({ count: 0, error: null })),
          })),
        })),
        gt: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      })),
    } as any);

    const stats = await QueueManager.getQueueStats();

    expect(stats).toEqual({
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      deadLetter: 0,
    });
  });

  it("cleans up old jobs", async () => {
    const mockSupabase = vi.mocked(supabase);
    mockSupabase.from.mockReturnValue({
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          lt: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
    } as any);

    const result = await QueueManager.cleanupOldJobs(30);

    expect(result).toEqual({
      completedJobsCleaned: 0,
      failedJobsCleaned: 0,
    });
  });
});

describe("agentQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds job to queue", async () => {
    const mockSupabase = vi.mocked(supabase);
    mockSupabase.from.mockReturnValue({
      insert: vi.fn(() => Promise.resolve({ error: null })),
    } as any);

    const jobData = {
      agentId: "agent-123",
      userId: "user-123",
      input: { test: "data" },
      config: { nodes: [], edges: [] },
      apiKeys: "encrypted-keys",
      executionId: "exec-123",
    };

    const result = await agentQueue.add(jobData);

    expect(result).toHaveProperty("id");
    expect(typeof result.id).toBe("string");
  });

  it("gets waiting jobs", async () => {
    const mockSupabase = vi.mocked(supabase);
    mockSupabase.from.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          lt: vi.fn(() => ({
            not: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
              })),
            })),
          })),
        })),
      })),
    } as any);

    const jobs = await agentQueue.getWaiting();
    expect(jobs).toEqual([]);
  });
});
