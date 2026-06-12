import { Redis } from 'ioredis';

// Clear rate-limit state from previous E2E runs so failed-login tests cannot
// lock out the shared localhost IP across runs.
export default async function globalSetup(): Promise<void> {
	const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
	const keys = await redis.keys('ratelimit:*');
	if (keys.length > 0) await redis.del(...keys);
	await redis.quit();
}
