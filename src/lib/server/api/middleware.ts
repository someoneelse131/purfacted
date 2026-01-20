/**
 * Public API Middleware
 *
 * Handles API key authentication and rate limiting.
 */

import type { RequestEvent } from '@sveltejs/kit';
import { validateApiKey, checkRateLimit, recordApiUsage, RATE_LIMITS } from '$lib/server/services/publicApi';
import { extractApiKey, API_ERRORS } from './response';
import type { ApiKey, ApiKeyTier } from '@prisma/client';

export interface ApiContext {
	apiKey: ApiKey;
	rateLimit: {
		limit: number;
		remaining: number;
		resetAt: Date;
	};
	startTime: number;
}

/**
 * Authenticate API request and check rate limits
 */
export async function authenticateApiRequest(event: RequestEvent): Promise<{
	success: true;
	context: ApiContext;
} | {
	success: false;
	response: Response;
}> {
	const startTime = performance.now();
	const rawKey = extractApiKey(event.request);

	if (!rawKey) {
		return {
			success: false,
			response: API_ERRORS.INVALID_API_KEY()
		};
	}

	// Validate the API key
	const validation = await validateApiKey(rawKey);

	if (!validation.valid || !validation.apiKey) {
		if (validation.error === 'API key has expired') {
			return { success: false, response: API_ERRORS.EXPIRED_API_KEY() };
		}
		if (validation.error === 'API key is inactive') {
			return { success: false, response: API_ERRORS.INACTIVE_API_KEY() };
		}
		return { success: false, response: API_ERRORS.INVALID_API_KEY() };
	}

	// Check rate limit
	const rateLimit = await checkRateLimit(validation.apiKey.id, validation.apiKey.tier);

	if (!rateLimit.allowed) {
		return {
			success: false,
			response: API_ERRORS.RATE_LIMITED(rateLimit.resetAt)
		};
	}

	return {
		success: true,
		context: {
			apiKey: validation.apiKey,
			rateLimit: {
				limit: RATE_LIMITS[validation.apiKey.tier],
				remaining: rateLimit.remaining,
				resetAt: rateLimit.resetAt
			},
			startTime
		}
	};
}

/**
 * Record API request completion
 */
export async function completeApiRequest(
	context: ApiContext,
	event: RequestEvent,
	status: number
): Promise<void> {
	const latencyMs = Math.round(performance.now() - context.startTime);
	const url = new URL(event.request.url);

	await recordApiUsage({
		apiKeyId: context.apiKey.id,
		endpoint: url.pathname,
		method: event.request.method,
		status,
		latencyMs
	});
}

/**
 * Create rate limit info for response headers
 */
export function getRateLimitInfo(context: ApiContext): {
	limit: number;
	remaining: number;
	resetAt: Date;
} {
	return {
		limit: context.rateLimit.limit,
		remaining: context.rateLimit.remaining,
		resetAt: context.rateLimit.resetAt
	};
}
