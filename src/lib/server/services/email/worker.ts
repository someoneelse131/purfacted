import { env } from '$env/dynamic/private';
import { prisma } from '$lib/server/db';
import { getRedis } from '$lib/server/redis';
import { getConfigNumber } from '../config';
import { runQueueTick } from './queue';
import { createSenderFromEnv } from './transport';

const TICK_MS = 5000;

// Started from hooks.server.ts; the globalThis guard keeps exactly one worker
// across dev HMR reloads.
export function startEmailWorker(): void {
	const g = globalThis as { __purfactedEmailWorker?: NodeJS.Timeout };
	if (g.__purfactedEmailWorker) return;
	if (process.env.VITEST) return;

	const redis = getRedis();
	const send = createSenderFromEnv(env, redis);
	const deps = { prisma, redis };

	const timer = setInterval(async () => {
		try {
			const [maxRetries, backoffSeconds] = await Promise.all([
				getConfigNumber(deps, 'email.max_retries'),
				getConfigNumber(deps, 'email.retry_backoff_seconds')
			]);
			await runQueueTick(redis, send, { maxRetries, backoffSeconds });
		} catch (err) {
			console.error('email worker tick failed:', err);
		}
	}, TICK_MS);
	timer.unref?.();
	g.__purfactedEmailWorker = timer;
}
