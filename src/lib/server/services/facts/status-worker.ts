import { prisma } from '$lib/server/db';
import { getRedis } from '$lib/server/redis';
import { runStatusTick } from './status-engine';

const TICK_MS = 60_000;

// Started from hooks.server.ts; globalThis guard keeps one worker across HMR.
export function startStatusWorker(): void {
	const g = globalThis as { __purfactedStatusWorker?: NodeJS.Timeout };
	if (g.__purfactedStatusWorker) return;
	if (process.env.VITEST) return;

	const deps = { prisma, redis: getRedis() };
	const timer = setInterval(async () => {
		try {
			await runStatusTick(deps);
		} catch (err) {
			console.error('status worker tick failed:', err);
		}
	}, TICK_MS);
	timer.unref?.();
	g.__purfactedStatusWorker = timer;
}
