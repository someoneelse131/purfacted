import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';
import { getRedis } from '$lib/server/redis';
import { getHealth } from '$lib/server/services/health';

export const GET: RequestHandler = async () => {
	const report = await getHealth({
		checkDb: () => prisma.$queryRaw`SELECT 1`,
		checkRedis: () => getRedis().ping()
	});
	return json(report, { status: report.status === 'ok' ? 200 : 503 });
};
