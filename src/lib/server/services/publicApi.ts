/**
 * Public API Service
 *
 * Handles API key management, authentication, and rate limiting
 * for the public "Source of Trust" API.
 */

import { db } from '$lib/server/db';
import type { ApiKeyTier } from '@prisma/client';
import crypto from 'crypto';

// Rate limits per tier (requests per day)
export const RATE_LIMITS: Record<ApiKeyTier, number> = {
	FREE: 100,
	BASIC: 1000,
	PREMIUM: 10000,
	UNLIMITED: Infinity
};

/**
 * Generate a new API key
 */
export function generateApiKey(): { key: string; hash: string; prefix: string } {
	// Generate a random 32-byte key
	const keyBytes = crypto.randomBytes(32);
	const key = `pf_live_${keyBytes.toString('base64url')}`;
	const prefix = key.substring(0, 12);
	const hash = hashApiKey(key);

	return { key, hash, prefix };
}

/**
 * Hash an API key for storage
 */
export function hashApiKey(key: string): string {
	return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Create a new API key
 */
export async function createApiKey(data: {
	name: string;
	email: string;
	description?: string;
	tier?: ApiKeyTier;
	userId?: string;
	expiresAt?: Date;
}): Promise<{ apiKey: typeof db.apiKey.$inferSelect; rawKey: string }> {
	const { key, hash, prefix } = generateApiKey();

	const apiKey = await db.apiKey.create({
		data: {
			key: hash,
			keyPrefix: prefix,
			name: data.name,
			email: data.email,
			description: data.description,
			tier: data.tier || 'FREE',
			userId: data.userId,
			expiresAt: data.expiresAt
		}
	});

	return { apiKey, rawKey: key };
}

/**
 * Validate an API key and return the key record
 */
export async function validateApiKey(rawKey: string): Promise<{
	valid: boolean;
	apiKey?: typeof db.apiKey.$inferSelect;
	error?: string;
}> {
	if (!rawKey || !rawKey.startsWith('pf_live_')) {
		return { valid: false, error: 'Invalid API key format' };
	}

	const hash = hashApiKey(rawKey);

	const apiKey = await db.apiKey.findUnique({
		where: { key: hash }
	});

	if (!apiKey) {
		return { valid: false, error: 'API key not found' };
	}

	if (!apiKey.isActive) {
		return { valid: false, error: 'API key is inactive' };
	}

	if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
		return { valid: false, error: 'API key has expired' };
	}

	// Update last used timestamp (fire and forget)
	db.apiKey.update({
		where: { id: apiKey.id },
		data: { lastUsedAt: new Date() }
	}).catch(() => {/* ignore errors */});

	return { valid: true, apiKey };
}

/**
 * Check rate limit for an API key
 */
export async function checkRateLimit(apiKeyId: string, tier: ApiKeyTier): Promise<{
	allowed: boolean;
	remaining: number;
	resetAt: Date;
}> {
	const limit = RATE_LIMITS[tier];
	const now = new Date();
	const resetAt = new Date(now);
	resetAt.setUTCHours(24, 0, 0, 0); // Reset at midnight UTC

	if (limit === Infinity) {
		return { allowed: true, remaining: Infinity, resetAt };
	}

	// Get or create rate limit record
	let rateLimit = await db.apiRateLimit.findUnique({
		where: { apiKeyId }
	});

	if (!rateLimit || rateLimit.resetAt < now) {
		// Create or reset the rate limit
		rateLimit = await db.apiRateLimit.upsert({
			where: { apiKeyId },
			update: { requests: 1, resetAt },
			create: { apiKeyId, requests: 1, resetAt }
		});
		return { allowed: true, remaining: limit - 1, resetAt };
	}

	if (rateLimit.requests >= limit) {
		return { allowed: false, remaining: 0, resetAt: rateLimit.resetAt };
	}

	// Increment the counter
	const updated = await db.apiRateLimit.update({
		where: { apiKeyId },
		data: { requests: { increment: 1 } }
	});

	return {
		allowed: true,
		remaining: limit - updated.requests,
		resetAt: rateLimit.resetAt
	};
}

/**
 * Record API usage for analytics
 */
export async function recordApiUsage(data: {
	apiKeyId: string;
	endpoint: string;
	method: string;
	status: number;
	latencyMs: number;
}): Promise<void> {
	await db.apiUsage.create({
		data: {
			apiKeyId: data.apiKeyId,
			endpoint: data.endpoint,
			method: data.method,
			status: data.status,
			latencyMs: data.latencyMs
		}
	}).catch(() => {/* ignore errors - usage tracking is not critical */});
}

/**
 * Get API key usage statistics
 */
export async function getApiKeyStats(apiKeyId: string, days: number = 30): Promise<{
	totalRequests: number;
	requestsByDay: { date: string; count: number }[];
	requestsByEndpoint: { endpoint: string; count: number }[];
	averageLatency: number;
}> {
	const since = new Date();
	since.setDate(since.getDate() - days);

	const [totalRequests, requestsByDay, requestsByEndpoint, latencyStats] = await Promise.all([
		// Total requests
		db.apiUsage.count({
			where: { apiKeyId, createdAt: { gte: since } }
		}),

		// Requests by day
		db.apiUsage.groupBy({
			by: ['date'],
			where: { apiKeyId, createdAt: { gte: since } },
			_count: { id: true },
			orderBy: { date: 'asc' }
		}),

		// Requests by endpoint
		db.apiUsage.groupBy({
			by: ['endpoint'],
			where: { apiKeyId, createdAt: { gte: since } },
			_count: { id: true },
			orderBy: { _count: { id: 'desc' } },
			take: 10
		}),

		// Average latency
		db.apiUsage.aggregate({
			where: { apiKeyId, createdAt: { gte: since } },
			_avg: { latencyMs: true }
		})
	]);

	return {
		totalRequests,
		requestsByDay: requestsByDay.map(r => ({
			date: r.date.toISOString().split('T')[0],
			count: r._count.id
		})),
		requestsByEndpoint: requestsByEndpoint.map(r => ({
			endpoint: r.endpoint,
			count: r._count.id
		})),
		averageLatency: latencyStats._avg.latencyMs || 0
	};
}

/**
 * Revoke an API key
 */
export async function revokeApiKey(apiKeyId: string): Promise<void> {
	await db.apiKey.update({
		where: { id: apiKeyId },
		data: { isActive: false }
	});
}

/**
 * Get API key by ID (for owner)
 */
export async function getApiKeyById(apiKeyId: string): Promise<typeof db.apiKey.$inferSelect | null> {
	return db.apiKey.findUnique({
		where: { id: apiKeyId }
	});
}

/**
 * List API keys for a user
 */
export async function listApiKeysByUser(userId: string): Promise<(typeof db.apiKey.$inferSelect)[]> {
	return db.apiKey.findMany({
		where: { userId },
		orderBy: { createdAt: 'desc' }
	});
}

/**
 * List API keys by email
 */
export async function listApiKeysByEmail(email: string): Promise<(typeof db.apiKey.$inferSelect)[]> {
	return db.apiKey.findMany({
		where: { email },
		orderBy: { createdAt: 'desc' }
	});
}
