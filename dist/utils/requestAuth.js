"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserFromRequest = exports.getTokenFromRequest = void 0;
const supabaseClient_1 = require("./supabaseClient");
function parseCookieHeader(cookieHeader) {
    return cookieHeader.split(";").reduce((acc, part) => {
        const idx = part.indexOf("=");
        if (idx === -1)
            return acc;
        const key = part.slice(0, idx).trim();
        const val = decodeURIComponent(part.slice(idx + 1).trim());
        acc[key] = val;
        return acc;
    }, {});
}
const getTokenFromRequest = (req) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        return authHeader.substring(7);
    }
    // Prefer parsed cookies if middleware is present
    // @ts-ignore
    if (req.cookies && typeof req.cookies === "object") {
        const cookies = req.cookies;
        const keys = [
            "sb:token",
            "sb-access-token",
            "supabase-auth-token",
            "supabase_session",
            "supabase-token",
        ];
        for (const k of keys) {
            if (cookies[k]) {
                try {
                    const v = typeof cookies[k] === "string"
                        ? cookies[k]
                        : JSON.stringify(cookies[k]);
                    const parsed = JSON.parse(v);
                    return (parsed?.access_token ||
                        parsed?.currentSession?.access_token ||
                        parsed?.token ||
                        null);
                }
                catch (e) {
                    // not JSON
                    return String(cookies[k]);
                }
            }
        }
    }
    // Fallback: raw cookie header
    const cookieHeader = req.headers.cookie || req.headers.Cookie;
    if (cookieHeader && typeof cookieHeader === "string") {
        const cookies = parseCookieHeader(cookieHeader);
        const keys = [
            "sb:token",
            "sb-access-token",
            "supabase-auth-token",
            "supabase_session",
            "supabase-token",
        ];
        for (const k of keys) {
            if (cookies[k]) {
                try {
                    const parsed = JSON.parse(cookies[k]);
                    return (parsed?.access_token ||
                        parsed?.currentSession?.access_token ||
                        parsed?.token ||
                        cookies[k]);
                }
                catch (e) {
                    return cookies[k];
                }
            }
        }
    }
    // Query param fallback (useful for quick tests)
    const tokenFromQuery = (req.query &&
        (req.query.token || req.query.access_token));
    if (tokenFromQuery)
        return tokenFromQuery;
    return null;
};
exports.getTokenFromRequest = getTokenFromRequest;
const getUserFromRequest = async (req) => {
    const token = (0, exports.getTokenFromRequest)(req);
    if (!token) {
        return { user: null, error: new Error("No token provided"), token: null };
    }
    try {
        const { data: { user }, error, } = await supabaseClient_1.supabase.auth.getUser(token);
        return { user: user ?? null, error: error ?? null, token };
    }
    catch (err) {
        return { user: null, error: err, token };
    }
};
exports.getUserFromRequest = getUserFromRequest;
exports.default = exports.getUserFromRequest;
