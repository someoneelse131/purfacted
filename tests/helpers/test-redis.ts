import { Redis } from 'ioredis';

// Tests use a dedicated Redis logical database (index 1) so flushing never
// touches dev data (index 0).
export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';

export function createTestRedis(): Redis {
	const url = new URL(TEST_REDIS_URL);
	const dbIndex = Number(url.pathname.replace('/', '') || '0');
	if (dbIndex === 0) {
		throw new Error('TEST_REDIS_URL must use a non-zero database index (e.g. /1)');
	}
	return new Redis(TEST_REDIS_URL);
}
