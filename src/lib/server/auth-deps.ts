import { prisma } from '$lib/server/db';
import { getRedis } from '$lib/server/redis';
import type { AuthDeps } from '$lib/server/services/auth/session';

export function authDeps(): AuthDeps {
	return { prisma, redis: getRedis() };
}
