import { prisma } from '$lib/server/db';
import { getRedis } from '$lib/server/redis';
import { refreshLeaderboards } from './leaderboard';

// Pre-warm the leaderboard caches periodically (R28) so reads are cheap and the
// boards stay reasonably fresh without recomputing on every request. The read
// path (getLeaderboard) is read-through, so an unwarmed board still resolves -
// this worker just keeps the common boards warm.
const REFRESH_INTERVAL_MS = 600_000; // 10 minutes

// Started from hooks.server.ts; globalThis guard keeps one worker across HMR.
export function startLeaderboardWorker(): void {
	const g = globalThis as { __purfactedLeaderboardWorker?: NodeJS.Timeout };
	if (g.__purfactedLeaderboardWorker) return;
	if (process.env.VITEST) return;

	const deps = { prisma, redis: getRedis() };
	const run = () =>
		refreshLeaderboards(deps).catch((err) =>
			console.error('leaderboard worker refresh failed:', err)
		);

	// warm immediately on boot, then on the interval
	run();
	const timer = setInterval(run, REFRESH_INTERVAL_MS);
	timer.unref?.();
	g.__purfactedLeaderboardWorker = timer;
}
