import { Redis } from 'ioredis';
import { env } from '$env/dynamic/private';

const globalForRedis = globalThis as unknown as { redis?: Redis };

export function getRedis(): Redis {
	if (!globalForRedis.redis) {
		globalForRedis.redis = new Redis(env.REDIS_URL ?? 'redis://localhost:6379', {
			maxRetriesPerRequest: 1,
			commandTimeout: 2000
		});
		// Without a listener ioredis throws unhandled errors when the server is down;
		// health checks must be able to report "down" instead of crashing the app.
		globalForRedis.redis.on('error', () => {});
	}
	return globalForRedis.redis;
}
