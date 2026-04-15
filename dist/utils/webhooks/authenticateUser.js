"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthenticationError = void 0;
exports.authenticateUser = authenticateUser;
const supabaseClient_1 = require("@/lib/supabaseClient");
class AuthenticationError extends Error {
    constructor(message, statusCode = 401) {
        super(message);
        this.statusCode = statusCode;
        this.name = 'AuthenticationError';
    }
}
exports.AuthenticationError = AuthenticationError;
async function authenticateUser(request) {
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
        throw new AuthenticationError('Unauthorized: No token provided');
    }
    const { data: { user }, error: authError, } = await supabaseClient_1.supabase.auth.getUser(token);
    if (authError || !user) {
        throw new AuthenticationError('Invalid token', 401);
    }
    return user;
}
