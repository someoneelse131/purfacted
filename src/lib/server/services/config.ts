import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';

// Config service (R9 foundation): reads the `config` table through a Redis
// cache. Every tunable business value flows through here - no constants in
// feature code.

const CACHE_PREFIX = 'config:';
const CACHE_TTL_SECONDS = 300;

export interface ConfigDeps {
	prisma: PrismaClient;
	redis: Redis;
}

export async function getConfigValue(deps: ConfigDeps, key: string): Promise<string> {
	const cacheKey = CACHE_PREFIX + key;
	try {
		const cached = await deps.redis.get(cacheKey);
		if (cached !== null) return cached;
	} catch {
		// cache unavailable -> fall through to DB
	}
	const row = await deps.prisma.config.findUnique({ where: { key } });
	if (!row) throw new Error(`Missing config key "${key}" - run db:seed`);
	try {
		await deps.redis.set(cacheKey, row.value, 'EX', CACHE_TTL_SECONDS);
	} catch {
		// cache write failures must never break reads
	}
	return row.value;
}

export async function getConfigNumber(deps: ConfigDeps, key: string): Promise<number> {
	const raw = await getConfigValue(deps, key);
	const num = Number(raw);
	if (Number.isNaN(num)) throw new Error(`Config key "${key}" is not numeric: "${raw}"`);
	return num;
}

export async function setConfigValue(deps: ConfigDeps, key: string, value: string): Promise<void> {
	await deps.prisma.config.update({ where: { key }, data: { value } });
	try {
		await deps.redis.del(CACHE_PREFIX + key);
	} catch {
		// invalidation failure self-heals via TTL
	}
}
