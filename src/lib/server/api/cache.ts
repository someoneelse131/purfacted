/**
 * Public API Response Caching
 *
 * Provides caching for API responses using Redis with memory fallback.
 * Implements cache-aside pattern with configurable TTLs per endpoint.
 */

import * as redis from '$lib/server/redis';

// Cache TTL configuration (in seconds)
export const CACHE_TTL = {
	// Facts can change with votes, keep short
	FACT_DETAIL: 60, // 1 minute
	FACT_LIST: 30, // 30 seconds

	// Sources rarely change
	SOURCE_DETAIL: 300, // 5 minutes
	SOURCE_LIST: 120, // 2 minutes

	// Categories change infrequently
	CATEGORY_DETAIL: 600, // 10 minutes
	CATEGORY_LIST: 300, // 5 minutes
	CATEGORY_TREE: 600, // 10 minutes

	// Trust metrics can change with votes
	TRUST_DETAIL: 60, // 1 minute
	TRUST_BATCH: 60, // 1 minute
	TRUST_STATS: 300 // 5 minutes (aggregate data)
} as const;

// Cache key prefixes
const CACHE_PREFIX = 'api:v1:';

/**
 * Generate a cache key for API responses
 */
export function getCacheKey(endpoint: string, params: Record<string, string | number | undefined>): string {
	const sortedParams = Object.entries(params)
		.filter(([, v]) => v !== undefined)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([k, v]) => `${k}=${v}`)
		.join('&');

	return `${CACHE_PREFIX}${endpoint}${sortedParams ? ':' + sortedParams : ''}`;
}

/**
 * Get cached API response
 */
export async function getCachedResponse<T>(key: string): Promise<T | null> {
	try {
		const cached = await redis.get(key);
		if (cached) {
			return JSON.parse(cached) as T;
		}
	} catch (error) {
		console.warn('Cache read error:', error);
	}
	return null;
}

/**
 * Cache an API response
 */
export async function cacheResponse<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
	try {
		await redis.set(key, JSON.stringify(data), ttlSeconds);
	} catch (error) {
		console.warn('Cache write error:', error);
	}
}

/**
 * Invalidate cache for a specific key pattern
 */
export async function invalidateCache(pattern: string): Promise<void> {
	// For now, we just delete the specific key
	// In production, you might want to use SCAN with pattern matching
	try {
		await redis.del(pattern);
	} catch (error) {
		console.warn('Cache invalidation error:', error);
	}
}

/**
 * Invalidate all caches for a fact (when votes/sources change)
 */
export async function invalidateFactCaches(factId: string): Promise<void> {
	const keys = [
		getCacheKey('facts', { id: factId }),
		getCacheKey('trust', { factId })
	];

	for (const key of keys) {
		await invalidateCache(key);
	}
}

/**
 * Higher-order function to wrap API handlers with caching
 */
export function withCache<T>(
	keyGenerator: () => string,
	ttlSeconds: number,
	fetcher: () => Promise<T>
): Promise<T> {
	return (async () => {
		const key = keyGenerator();

		// Try to get from cache
		const cached = await getCachedResponse<T>(key);
		if (cached) {
			return cached;
		}

		// Fetch fresh data
		const data = await fetcher();

		// Cache the result
		await cacheResponse(key, data, ttlSeconds);

		return data;
	})();
}

/**
 * Cache statistics for monitoring
 */
export interface CacheStats {
	hits: number;
	misses: number;
	hitRate: number;
}

// Simple in-memory stats tracking
let cacheHits = 0;
let cacheMisses = 0;

export function recordCacheHit(): void {
	cacheHits++;
}

export function recordCacheMiss(): void {
	cacheMisses++;
}

export function getCacheStats(): CacheStats {
	const total = cacheHits + cacheMisses;
	return {
		hits: cacheHits,
		misses: cacheMisses,
		hitRate: total > 0 ? Math.round((cacheHits / total) * 100) : 0
	};
}

export function resetCacheStats(): void {
	cacheHits = 0;
	cacheMisses = 0;
}

/**
 * Clear all API caches (for testing)
 */
export async function clearAllApiCache(): Promise<void> {
	// For the memory fallback, we need to manually clear keys
	// This is primarily used in tests
	const keysToDelete = [
		getCacheKey('categories/tree', {}),
		getCacheKey('trust/stats', {})
	];

	for (const key of keysToDelete) {
		await redis.del(key);
	}
}
