import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import type { Archiver } from './provider';

// Redis-backed archive-snapshot queue with retry + exponential backoff (R26).
// Same proven shape as the email queue, separate keys:
//   archive:queue   - ready to process (LPUSH / RPOP)
//   archive:delayed - sorted set, score = timestamp when the retry is due
//   archive:dead    - permanently failed (kept for inspection)

const QUEUE = 'archive:queue';
const DELAYED = 'archive:delayed';
const DEAD = 'archive:dead';

export interface ArchiveJob {
	sourceId: string;
	url: string;
}

interface QueuedArchiveJob extends ArchiveJob {
	attempts: number;
	enqueuedAt: number;
}

export interface ArchiveQueueOptions {
	maxRetries: number;
	backoffSeconds: number;
}

export interface ArchiveQueueDeps {
	prisma: PrismaClient;
	redis: Redis;
}

export async function enqueueArchive(redis: Redis, job: ArchiveJob): Promise<void> {
	const queued: QueuedArchiveJob = { ...job, attempts: 0, enqueuedAt: Date.now() };
	await redis.lpush(QUEUE, JSON.stringify(queued));
}

// Move retries whose backoff elapsed back into the ready queue.
export async function promoteDelayed(redis: Redis, now = Date.now()): Promise<number> {
	const due = await redis.zrangebyscore(DELAYED, 0, now);
	for (const entry of due) {
		await redis.zrem(DELAYED, entry);
		await redis.lpush(QUEUE, entry);
	}
	return due.length;
}

// Process one queued snapshot. Returns false when the queue is empty.
// On success the source's archiveUrl is set (guarded update: a source removed
// in the meantime simply drops the job). On failure: retry with backoff, then
// dead-letter. The whole thing is fire-and-forget - it never touches the
// originating request.
export async function processOne(
	deps: ArchiveQueueDeps,
	archive: Archiver,
	options: ArchiveQueueOptions,
	now = Date.now()
): Promise<boolean> {
	const raw = await deps.redis.rpop(QUEUE);
	if (!raw) return false;
	const job = JSON.parse(raw) as QueuedArchiveJob;
	try {
		const archiveUrl = await archive(job.url);
		await deps.prisma.source.updateMany({
			where: { id: job.sourceId },
			data: { archiveUrl }
		});
	} catch {
		job.attempts += 1;
		if (job.attempts >= options.maxRetries) {
			await deps.redis.lpush(DEAD, JSON.stringify(job));
		} else {
			const backoffMs = options.backoffSeconds * 1000 * 2 ** (job.attempts - 1);
			await deps.redis.zadd(DELAYED, now + backoffMs, JSON.stringify(job));
		}
	}
	return true;
}

// One worker tick: promote due retries, then drain the ready queue.
export async function runArchiveTick(
	deps: ArchiveQueueDeps,
	archive: Archiver,
	options: ArchiveQueueOptions,
	maxPerTick = 20
): Promise<void> {
	await promoteDelayed(deps.redis);
	for (let i = 0; i < maxPerTick; i++) {
		if (!(await processOne(deps, archive, options))) break;
	}
}

export async function archiveQueueDepth(
	redis: Redis
): Promise<{ ready: number; delayed: number; dead: number }> {
	const [ready, delayed, dead] = await Promise.all([
		redis.llen(QUEUE),
		redis.zcard(DELAYED),
		redis.llen(DEAD)
	]);
	return { ready, delayed, dead };
}
