"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supabase_js_1 = require("@supabase/supabase-js");
// Mock the Supabase client
vitest_1.vi.mock("@supabase/supabase-js", () => ({
    createClient: vitest_1.vi.fn(() => ({
        auth: {
            getUser: vitest_1.vi.fn(),
            signInWithPassword: vitest_1.vi.fn(),
            signUp: vitest_1.vi.fn(),
        },
        from: vitest_1.vi.fn(() => ({
            select: vitest_1.vi.fn(() => ({
                eq: vitest_1.vi.fn(() => ({
                    single: vitest_1.vi.fn(() => Promise.resolve({ data: null, error: null })),
                })),
            })),
            insert: vitest_1.vi.fn(() => Promise.resolve({ error: null })),
            update: vitest_1.vi.fn(() => Promise.resolve({ error: null })),
        })),
    })),
}));
(0, vitest_1.describe)("supabaseClient", () => {
    const originalEnv = { ...process.env };
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        // Reset environment
        process.env = { ...originalEnv };
    });
    (0, vitest_1.it)("creates client with service role key when available", async () => {
        process.env.SUPABASE_URL = "https://test.supabase.co";
        process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
        // Import after setting env vars
        const { supabase } = await Promise.resolve().then(() => __importStar(require("./supabaseClient")));
        (0, vitest_1.expect)(supabase_js_1.createClient).toHaveBeenCalledWith("https://test.supabase.co", "service-role-key");
    });
    (0, vitest_1.it)("creates client with anon key when service role not available", async () => {
        process.env.SUPABASE_URL = "https://test.supabase.co";
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
        // Re-import to trigger new initialization
        const { supabase } = await Promise.resolve().then(() => __importStar(require("./supabaseClient")));
        (0, vitest_1.expect)(supabase_js_1.createClient).toHaveBeenCalledWith("https://test.supabase.co", "anon-key");
    });
    (0, vitest_1.it)("throws error when SUPABASE_URL is missing", () => {
        delete process.env.SUPABASE_URL;
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        (0, vitest_1.expect)(() => require("./supabaseClient")).toThrow("Missing Supabase environment variables");
    });
    (0, vitest_1.it)("throws error when neither service role nor anon key is available", () => {
        process.env.SUPABASE_URL = "https://test.supabase.co";
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        (0, vitest_1.expect)(() => require("./supabaseClient")).toThrow("Missing Supabase environment variables");
    });
    (0, vitest_1.it)("uses NEXT_PUBLIC_SUPABASE_URL as fallback for SUPABASE_URL", async () => {
        delete process.env.SUPABASE_URL;
        process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
        process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
        const { supabase } = await Promise.resolve().then(() => __importStar(require("./supabaseClient")));
        (0, vitest_1.expect)(supabase_js_1.createClient).toHaveBeenCalledWith("https://test.supabase.co", "service-role-key");
    });
});
