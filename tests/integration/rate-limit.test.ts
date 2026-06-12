import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Redis } from 'ioredis';
import { createTestRedis } from '../helpers/test-redis';
import {
	clearRateLimit,
	hitRateLimit,
	isRateLimited
} from '../../src/lib/server/services/rate-limit';

const redis: Redis = createTestRedis();

beforeEach(async () => {
	await redis.flushdb();
});

afterAll(async () => {
	await redis.quit();
});

describe('rate limiter (R19)', () => {
	it('allows up to maxHits within the window, then blocks', async () => {
		for (let i = 0; i < 5; i++) {
			const result = await hitRateLimit(redis, 'k1', 5, 60);
			expect(result.allowed).toBe(true);
			expect(result.remaining).toBe(4 - i);
		}
		const blocked = await hitRateLimit(redis, 'k1', 5, 60);
		expect(blocked.allowed).toBe(false);
		expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
		expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
	});

	it('isolates keys', async () => {
		await hitRateLimit(redis, 'a', 1, 60);
		expect((await hitRateLimit(redis, 'a', 1, 60)).allowed).toBe(false);
		expect((await hitRateLimit(redis, 'b', 1, 60)).allowed).toBe(true);
	});

	it('expires with the window', async () => {
		await hitRateLimit(redis, 'short', 1, 1);
		expect((await isRateLimited(redis, 'short', 1)).allowed).toBe(false);
		await new Promise((r) => setTimeout(r, 1100));
		expect((await isRateLimited(redis, 'short', 1)).allowed).toBe(true);
	});

	it('read-only check never consumes a hit', async () => {
		await isRateLimited(redis, 'ro', 2);
		await isRateLimited(redis, 'ro', 2);
		await isRateLimited(redis, 'ro', 2);
		expect((await hitRateLimit(redis, 'ro', 2, 60)).allowed).toBe(true);
		expect((await hitRateLimit(redis, 'ro', 2, 60)).allowed).toBe(true);
	});

	it('clear resets the counter', async () => {
		await hitRateLimit(redis, 'c', 1, 60);
		expect((await hitRateLimit(redis, 'c', 1, 60)).allowed).toBe(false);
		await clearRateLimit(redis, 'c');
		expect((await hitRateLimit(redis, 'c', 1, 60)).allowed).toBe(true);
	});

	it('restores a lost TTL', async () => {
		await hitRateLimit(redis, 'ttl', 5, 60);
		await redis.persist('ratelimit:ttl'); // simulate crash between INCR and EXPIRE
		const result = await hitRateLimit(redis, 'ttl', 5, 60);
		expect(result.retryAfterSeconds).toBeGreaterThan(0);
		expect(await redis.ttl('ratelimit:ttl')).toBeGreaterThan(0);
	});
});
