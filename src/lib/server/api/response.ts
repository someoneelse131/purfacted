/**
 * Public API Response Utilities
 *
 * Standardized response format for the public API.
 */

import { json } from '@sveltejs/kit';

export interface ApiResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: {
		code: string;
		message: string;
		details?: unknown;
	};
	meta?: {
		page?: number;
		limit?: number;
		total?: number;
		hasMore?: boolean;
	};
}

export interface RateLimitHeaders {
	'X-RateLimit-Limit': string;
	'X-RateLimit-Remaining': string;
	'X-RateLimit-Reset': string;
}

/**
 * Create a successful API response
 */
export function apiSuccess<T>(
	data: T,
	meta?: ApiResponse['meta'],
	rateLimitInfo?: { limit: number; remaining: number; resetAt: Date },
	statusCode: number = 200
): Response {
	const response: ApiResponse<T> = {
		success: true,
		data
	};

	if (meta) {
		response.meta = meta;
	}

	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		'Cache-Control': 'public, max-age=60' // Cache for 1 minute by default
	};

	if (rateLimitInfo) {
		headers['X-RateLimit-Limit'] = String(rateLimitInfo.limit);
		headers['X-RateLimit-Remaining'] = String(rateLimitInfo.remaining);
		headers['X-RateLimit-Reset'] = rateLimitInfo.resetAt.toISOString();
	}

	return json(response, { headers, status: statusCode });
}

/**
 * Create an error API response
 */
export function apiError(
	code: string,
	message: string,
	status: number = 400,
	details?: unknown,
	rateLimitInfo?: { limit: number; remaining: number; resetAt: Date }
): Response {
	const response: ApiResponse = {
		success: false,
		error: {
			code,
			message
		}
	};

	if (details) {
		response.error!.details = details;
	}

	const headers: Record<string, string> = {
		'Content-Type': 'application/json'
	};

	if (rateLimitInfo) {
		headers['X-RateLimit-Limit'] = String(rateLimitInfo.limit);
		headers['X-RateLimit-Remaining'] = String(rateLimitInfo.remaining);
		headers['X-RateLimit-Reset'] = rateLimitInfo.resetAt.toISOString();
	}

	return json(response, { status, headers });
}

// Common error responses
export const API_ERRORS = {
	INVALID_API_KEY: () => apiError('INVALID_API_KEY', 'Invalid or missing API key', 401),
	EXPIRED_API_KEY: () => apiError('EXPIRED_API_KEY', 'API key has expired', 401),
	INACTIVE_API_KEY: () => apiError('INACTIVE_API_KEY', 'API key is inactive', 401),
	RATE_LIMITED: (resetAt: Date) => apiError(
		'RATE_LIMITED',
		'Rate limit exceeded. Please try again later.',
		429,
		{ resetAt: resetAt.toISOString() }
	),
	NOT_FOUND: (resource: string) => apiError('NOT_FOUND', `${resource} not found`, 404),
	BAD_REQUEST: (message: string, details?: unknown) => apiError('BAD_REQUEST', message, 400, details),
	INTERNAL_ERROR: () => apiError('INTERNAL_ERROR', 'An internal error occurred', 500),
	METHOD_NOT_ALLOWED: () => apiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405),
	VALIDATION_ERROR: (details: unknown) => apiError('VALIDATION_ERROR', 'Validation failed', 400, details)
};

/**
 * Extract API key from request
 */
export function extractApiKey(request: Request): string | null {
	// Check Authorization header first
	const authHeader = request.headers.get('Authorization');
	if (authHeader?.startsWith('Bearer ')) {
		return authHeader.slice(7);
	}

	// Check X-API-Key header
	const apiKeyHeader = request.headers.get('X-API-Key');
	if (apiKeyHeader) {
		return apiKeyHeader;
	}

	// Check query parameter
	const url = new URL(request.url);
	const apiKeyParam = url.searchParams.get('api_key');
	if (apiKeyParam) {
		return apiKeyParam;
	}

	return null;
}

/**
 * Parse pagination parameters
 */
export function parsePagination(
	url: URL,
	defaultLimit: number = 20,
	maxLimit: number = 100
): { page: number; limit: number; offset: number } {
	const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
	const limit = Math.min(maxLimit, Math.max(1, parseInt(url.searchParams.get('limit') || String(defaultLimit), 10)));
	const offset = (page - 1) * limit;

	return { page, limit, offset };
}

/**
 * Build pagination meta
 */
export function buildPaginationMeta(
	page: number,
	limit: number,
	total: number
): ApiResponse['meta'] {
	return {
		page,
		limit,
		total,
		hasMore: page * limit < total
	};
}
