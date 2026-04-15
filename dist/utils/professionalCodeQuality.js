"use strict";
// ===========================================
// DENBEGNAYE AGENT - PROFESSIONAL CODE QUALITY
// Enterprise-Grade Error Handling, Logging & Testing
// ===========================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = exports.RateLimiter = exports.UserSchemas = exports.ApiResponse = exports.NotFoundError = exports.AuthorizationError = exports.AuthenticationError = exports.ValidationError = exports.AppError = void 0;
exports.handleApiError = handleApiError;
exports.authenticateRequest = authenticateRequest;
exports.authorizeResource = authorizeResource;
exports.createApiHandler = createApiHandler;
const server_1 = require("next/server");
const zod_1 = require("zod");
const supabaseClient_1 = require("@/lib/supabaseClient");
// ===========================================
// ERROR HANDLING SYSTEM
// ===========================================
class AppError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = isOperational;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.AppError = AppError;
class ValidationError extends AppError {
    constructor(message, details) {
        super(message, 400, 'VALIDATION_ERROR');
        this.details = details;
    }
}
exports.ValidationError = ValidationError;
class AuthenticationError extends AppError {
    constructor(message = 'Authentication required') {
        super(message, 401, 'AUTHENTICATION_ERROR');
    }
}
exports.AuthenticationError = AuthenticationError;
class AuthorizationError extends AppError {
    constructor(message = 'Insufficient permissions') {
        super(message, 403, 'AUTHORIZATION_ERROR');
    }
}
exports.AuthorizationError = AuthorizationError;
class NotFoundError extends AppError {
    constructor(resource = 'Resource') {
        super(`${resource} not found`, 404, 'NOT_FOUND');
    }
}
exports.NotFoundError = NotFoundError;
// ===========================================
// GLOBAL ERROR HANDLER
// ===========================================
function handleApiError(error) {
    console.error('API Error:', error);
    if (error instanceof AppError) {
        return server_1.NextResponse.json({
            error: {
                message: error.message,
                code: error.code,
                ...(error instanceof ValidationError && error.details && { details: error.details }),
            },
        }, { status: error.statusCode });
    }
    if (error instanceof zod_1.z.ZodError) {
        return server_1.NextResponse.json({
            error: {
                message: 'Validation failed',
                code: 'VALIDATION_ERROR',
                details: error.errors,
            },
        }, { status: 400 });
    }
    // Generic error handling
    const isDevelopment = process.env.NODE_ENV === 'development';
    return server_1.NextResponse.json({
        error: {
            message: isDevelopment ? error.message : 'Internal server error',
            code: 'INTERNAL_ERROR',
        },
    }, { status: 500 });
}
// ===========================================
// API RESPONSE UTILITIES
// ===========================================
class ApiResponse {
    static success(data, message, meta) {
        return server_1.NextResponse.json({
            success: true,
            data,
            message,
            ...(meta && { meta }),
        });
    }
    static error(message, code = 'ERROR', status = 400) {
        return server_1.NextResponse.json({
            success: false,
            error: { message, code },
        }, { status });
    }
    static paginated(data, pagination) {
        return server_1.NextResponse.json({
            success: true,
            data,
            pagination,
        });
    }
}
exports.ApiResponse = ApiResponse;
// ===========================================
// VALIDATION SCHEMAS
// ===========================================
exports.UserSchemas = {
    profile: zod_1.z.object({
        full_name: zod_1.z.string().min(1).max(100).optional(),
        bio: zod_1.z.string().max(500).optional(),
        timezone: zod_1.z.string().optional(),
        preferences: zod_1.z.record(zod_1.z.any()).optional(),
    }),
    agent: zod_1.z.object({
        name: zod_1.z.string().min(1).max(100),
        description: zod_1.z.string().max(500).optional(),
        config: zod_1.z.record(zod_1.z.any()),
        tags: zod_1.z.array(zod_1.z.string()).optional(),
    }),
    execution: zod_1.z.object({
        agent_id: zod_1.z.string().uuid(),
        input_data: zod_1.z.record(zod_1.z.any()),
        config: zod_1.z.record(zod_1.z.any()).optional(),
    }),
};
// ===========================================
// AUTHENTICATION MIDDLEWARE
// ===========================================
async function authenticateRequest(request) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AuthenticationError();
    }
    const token = authHeader.substring(7);
    const { data: { user }, error, } = await supabaseClient_1.supabase.auth.getUser(token);
    if (error || !user) {
        throw new AuthenticationError('Invalid or expired token');
    }
    // Check if email is verified
    if (!user.email_confirmed_at) {
        throw new AuthenticationError('Email not verified');
    }
    return user.id;
}
async function authorizeResource(userId, resourceType, resourceId, action = 'read') {
    // Check resource ownership based on type
    let query;
    switch (resourceType) {
        case 'agent':
            query = supabaseClient_1.supabase.from('user_agents').select('user_id').eq('id', resourceId).single();
            break;
        case 'execution':
            query = supabaseClient_1.supabase.from('agent_executions').select('user_id').eq('id', resourceId).single();
            break;
        default:
            throw new AuthorizationError('Unknown resource type');
    }
    const { data, error } = await query;
    if (error || !data) {
        throw new NotFoundError(resourceType);
    }
    if (data.user_id !== userId) {
        throw new AuthorizationError();
    }
}
// ===========================================
// RATE LIMITING
// ===========================================
class RateLimiter {
    static check(identifier, maxRequests = 100, windowMs = 60000 // 1 minute
    ) {
        const now = Date.now();
        const key = `${identifier}:${Math.floor(now / windowMs)}`;
        const current = this.limits.get(key) || { count: 0, resetTime: now + windowMs };
        if (now > current.resetTime) {
            current.count = 0;
            current.resetTime = now + windowMs;
        }
        if (current.count >= maxRequests) {
            return false;
        }
        current.count++;
        this.limits.set(key, current);
        return true;
    }
    static getRemainingRequests(identifier, windowMs = 60000) {
        const now = Date.now();
        const key = `${identifier}:${Math.floor(now / windowMs)}`;
        const current = this.limits.get(key);
        if (!current || now > current.resetTime) {
            return 100; // Default limit
        }
        return Math.max(0, 100 - current.count);
    }
}
exports.RateLimiter = RateLimiter;
RateLimiter.limits = new Map();
// ===========================================
// LOGGING SYSTEM
// ===========================================
class Logger {
    static info(message, meta) {
        console.log(JSON.stringify({
            level: 'info',
            message,
            timestamp: new Date().toISOString(),
            ...meta,
        }));
    }
    static warn(message, meta) {
        console.warn(JSON.stringify({
            level: 'warn',
            message,
            timestamp: new Date().toISOString(),
            ...meta,
        }));
    }
    static error(message, error, meta) {
        console.error(JSON.stringify({
            level: 'error',
            message,
            error: error
                ? {
                    message: error.message,
                    stack: error.stack,
                    name: error.name,
                }
                : undefined,
            timestamp: new Date().toISOString(),
            ...meta,
        }));
    }
    static api(request, response, duration) {
        console.log(JSON.stringify({
            level: 'info',
            type: 'api_request',
            method: request.method,
            url: request.url,
            status: response.status,
            duration,
            userAgent: request.headers.get('user-agent'),
            ip: request.headers.get('x-forwarded-for'),
            timestamp: new Date().toISOString(),
        }));
    }
}
exports.Logger = Logger;
// ===========================================
// API ROUTE TEMPLATE
// ===========================================
// lib/apiHandler.ts
function createApiHandler(config, handler) {
    return async (request) => {
        const startTime = Date.now();
        try {
            // Rate limiting
            if (config.rateLimit) {
                const clientIp = request.headers.get('x-forwarded-for') || 'unknown';
                if (!RateLimiter.check(clientIp, config.rateLimit.maxRequests, config.rateLimit.windowMs)) {
                    return ApiResponse.error('Rate limit exceeded', 'RATE_LIMIT_EXCEEDED', 429);
                }
            }
            // Authentication
            let userId;
            if (config.requireAuth) {
                userId = await authenticateRequest(request);
            }
            // Validation
            let query = {};
            let body = {};
            if (config.validation?.query) {
                const queryParams = Object.fromEntries(request.nextUrl.searchParams);
                query = config.validation.query.parse(queryParams);
            }
            if (config.validation?.body) {
                const requestBody = await request.json();
                body = config.validation.body.parse(requestBody);
            }
            // Execute handler
            const response = await handler({ request, userId, query, body });
            // Log successful request
            Logger.api(request, response, Date.now() - startTime);
            return response;
        }
        catch (error) {
            // Log error
            Logger.error('API request failed', error, {
                url: request.url,
                method: request.method,
                duration: Date.now() - startTime,
            });
            return handleApiError(error);
        }
    };
}
