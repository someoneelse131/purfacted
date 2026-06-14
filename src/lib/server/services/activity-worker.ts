import { prisma } from '$lib/server/db';
import { getRedis } from '$lib/server/redis';
import { pruneActivity } from './activity';

// Prune the activity spine hourly (R25). A range delete on an empty tail is
// cheap, so the coarse interval keeps the spine bounded without churn.
const PRUNE_INTERVAL_MS = 3_600_000;

// Started from hooks.server.ts; globalThis guard keeps one worker across HMR.
export function startActivityWorker(): void {
	const g = globalThis as { __purfactedActivityWorker?: NodeJS.Timeout };
	if (g.__purfactedActivityWorker) return;
	if (process.env.VITEST) return;

	const deps = { prisma, redis: getRedis() };
	const timer = setInterval(async () => {
		try {
			await pruneActivity(deps);
		} catch (err) {
			console.error('activity worker prune failed:', err);
		}
	}, PRUNE_INTERVAL_MS);
	timer.unref?.();
	g.__purfactedActivityWorker = timer;
}
