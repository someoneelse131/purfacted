import { PrismaClient } from '@prisma/client';

// E2E tests run against the local dev stack; this client talks straight to
// the dev database for fixtures that have no UI (e.g. promoting moderators).
const prisma = new PrismaClient({
	datasourceUrl:
		process.env.DATABASE_URL ?? 'postgresql://purfacted:devpassword@localhost:5432/purfacted'
});

export async function promoteToModerator(username: string): Promise<void> {
	await prisma.user.update({ where: { username }, data: { role: 'MODERATOR' } });
}

// Force a fact into UNSUBSTANTIATED (as if its review window expired).
export async function expireFactByTitle(title: string): Promise<void> {
	await prisma.fact.updateMany({
		where: { title },
		data: { status: 'UNSUBSTANTIATED', decidedAt: new Date() }
	});
}

// Drop all rate-limit state (failed-login lockouts etc.) so a spec that
// triggers limits does not starve the specs running after it.
export async function clearRateLimits(): Promise<void> {
	const { Redis } = await import('ioredis');
	const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
	const keys = await redis.keys('ratelimit:*');
	if (keys.length > 0) await redis.del(...keys);
	await redis.quit();
}

// Tune config values for a test (and clear the app's Redis config cache so
// the change is visible immediately). Returns a restore function.
export async function overrideConfig(values: Record<string, string>): Promise<() => Promise<void>> {
	const { Redis } = await import('ioredis');
	const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
	const previous: Record<string, string> = {};
	for (const [key, value] of Object.entries(values)) {
		const row = await prisma.config.findUniqueOrThrow({ where: { key } });
		previous[key] = row.value;
		await prisma.config.update({ where: { key }, data: { value } });
		await redis.del(`config:${key}`);
	}
	return async () => {
		for (const [key, value] of Object.entries(previous)) {
			await prisma.config.update({ where: { key }, data: { value } });
			await redis.del(`config:${key}`);
		}
		await redis.quit();
	};
}
