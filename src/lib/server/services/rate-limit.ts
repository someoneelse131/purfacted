import type { Redis } from 'ioredis';

// Fixed-window rate limiter on Redis. Used for login attempts (R4), password
// reset requests (R5), fact submissions (R10), per-endpoint limits (R19).

export interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	retryAfterSeconds: number;
}

export async function hitRateLimit(
	redis: Redis,
	key: string,
	maxHits: number,
	windowSeconds: number
): Promise<RateLimitResult> {
	const redisKey = `ratelimit:${key}`;
	const count = await redis.incr(redisKey);
	if (count === 1) {
		await redis.expire(redisKey, windowSeconds);
	}
	let ttl = await redis.ttl(redisKey);
	if (ttl < 0) {
		// key lost its TTL (e.g. crash between INCR and EXPIRE) - restore it
		await redis.expire(redisKey, windowSeconds);
		ttl = windowSeconds;
	}
	return {
		allowed: count <= maxHits,
		remaining: Math.max(0, maxHits - count),
		retryAfterSeconds: ttl
	};
}

// Read-only check (does not consume a hit). Use when only failures count.
export async function isRateLimited(
	redis: Redis,
	key: string,
	maxHits: number
): Promise<RateLimitResult> {
	const redisKey = `ratelimit:${key}`;
	const [countRaw, ttl] = await Promise.all([redis.get(redisKey), redis.ttl(redisKey)]);
	const count = Number(countRaw ?? 0);
	return {
		allowed: count < maxHits,
		remaining: Math.max(0, maxHits - count),
		retryAfterSeconds: Math.max(0, ttl)
	};
}

export async function clearRateLimit(redis: Redis, key: string): Promise<void> {
	await redis.del(`ratelimit:${key}`);
}
