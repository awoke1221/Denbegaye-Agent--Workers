import { describe, expect, it, vi, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";

// Mock the Supabase client
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
      update: vi.fn(() => Promise.resolve({ error: null })),
    })),
  })),
}));

describe("supabaseClient", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment
    process.env = { ...originalEnv };
  });

  it("creates client with service role key when available", async () => {
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    // Import after setting env vars
    const { supabase } = await import("./supabaseClient");

    expect(createClient).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "service-role-key",
    );
  });

  it("creates client with anon key when service role not available", async () => {
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    // Re-import to trigger new initialization
    const { supabase } = await import("./supabaseClient");

    expect(createClient).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "anon-key",
    );
  });

  it("throws error when SUPABASE_URL is missing", () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    expect(() => require("./supabaseClient")).toThrow(
      "Missing Supabase environment variables",
    );
  });

  it("throws error when neither service role nor anon key is available", () => {
    process.env.SUPABASE_URL = "https://test.supabase.co";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    expect(() => require("./supabaseClient")).toThrow(
      "Missing Supabase environment variables",
    );
  });

  it("uses NEXT_PUBLIC_SUPABASE_URL as fallback for SUPABASE_URL", async () => {
    delete process.env.SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    const { supabase } = await import("./supabaseClient");

    expect(createClient).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "service-role-key",
    );
  });
});
