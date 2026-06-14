import type { AuthDeps } from '../auth/session';
import { getConfigBoolean } from '../config';
import { enqueueArchive, type ArchiveJob } from './queue';

// Queues an archive snapshot for a freshly created source, gated by the
// `sources.archive_enabled` feature flag (R26). Best-effort: a flag read or
// enqueue failure must never break source creation - the snapshot is optional.
export async function queueArchiveIfEnabled(deps: AuthDeps, job: ArchiveJob): Promise<void> {
	try {
		if (await getConfigBoolean(deps, 'sources.archive_enabled')) {
			await enqueueArchive(deps.redis, job);
		}
	} catch (err) {
		console.error('archive enqueue failed:', err);
	}
}
