import { env } from '$env/dynamic/private';
import { prisma } from '$lib/server/db';
import { getRedis } from '$lib/server/redis';
import { getConfigNumber } from '../config';
import { runArchiveTick } from './queue';
import { createArchiver } from './provider';

const TICK_MS = 10_000;

// Started from hooks.server.ts; the globalThis guard keeps exactly one worker
// across dev HMR reloads. The archiver is real only when ARCHIVE_LIVE=true
// (prod) - dev/CI/E2E use the deterministic dev archiver, no network.
export function startArchiveWorker(): void {
	const g = globalThis as { __purfactedArchiveWorker?: NodeJS.Timeout };
	if (g.__purfactedArchiveWorker) return;
	if (process.env.VITEST) return;

	const redis = getRedis();
	const deps = { prisma, redis };
	const archive = createArchiver({ ARCHIVE_LIVE: env.ARCHIVE_LIVE });

	const timer = setInterval(async () => {
		try {
			const [maxRetries, backoffSeconds] = await Promise.all([
				getConfigNumber(deps, 'sources.archive_max_retries'),
				getConfigNumber(deps, 'sources.archive_backoff_seconds')
			]);
			await runArchiveTick(deps, archive, { maxRetries, backoffSeconds });
		} catch (err) {
			console.error('archive worker tick failed:', err);
		}
	}, TICK_MS);
	timer.unref?.();
	g.__purfactedArchiveWorker = timer;
}
