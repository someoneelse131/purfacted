import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { setupTestDb, truncateAll } from '../helpers/test-db';
import { createTestRedis } from '../helpers/test-redis';
import { seedCategories, seedConfig } from '../../prisma/seed';
import {
	archiveQueueDepth,
	enqueueArchive,
	processOne,
	promoteDelayed,
	runArchiveTick
} from '../../src/lib/server/services/archive/queue';
import { queueArchiveIfEnabled } from '../../src/lib/server/services/archive/enqueue';
import { setConfigValue } from '../../src/lib/server/services/config';
import type { Archiver } from '../../src/lib/server/services/archive/provider';

let prisma: PrismaClient;
let redis: Redis;
let deps: { prisma: PrismaClient; redis: Redis };
let categoryId: string;

const OPTIONS = { maxRetries: 3, backoffSeconds: 60 };
const okArchiver: Archiver = async (url) => `https://web.archive.org/web/0/${url}`;
const failingArchiver: Archiver = async () => {
	throw new Error('archive.org down');
};

beforeAll(async () => {
	prisma = await setupTestDb();
	redis = createTestRedis();
	deps = { prisma, redis };
}, 120_000);

beforeEach(async () => {
	await truncateAll(prisma);
	await redis.flushdb();
	await seedConfig(prisma);
	await seedCategories(prisma);
	categoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: 'science' } })).id;
});

afterAll(async () => {
	await prisma.$disconnect();
	await redis.quit();
});

let counter = 0;
async function makeSource(): Promise<string> {
	counter += 1;
	const user = await prisma.user.create({
		data: {
			username: `arc${counter}`,
			email: `arc${counter}@example.com`,
			passwordHash: 'x'.repeat(60),
			emailVerifiedAt: new Date()
		}
	});
	const fact = await prisma.fact.create({
		data: {
			title: `Archive fixture fact ${counter}`,
			body: 'body',
			authorId: user.id,
			categoryId,
			reviewDeadline: new Date(Date.now() + 86_400_000)
		}
	});
	const source = await prisma.source.create({
		data: {
			factId: fact.id,
			side: 'PRO',
			url: `https://example.org/source-${counter}`,
			title: 'Source',
			type: 'NEWS',
			credibility: 3,
			addedById: user.id
		}
	});
	return source.id;
}

describe('archive queue (R26)', () => {
	it('stores the archive URL on the source on success', async () => {
		const sourceId = await makeSource();
		const url = (await prisma.source.findUniqueOrThrow({ where: { id: sourceId } })).url;
		await enqueueArchive(redis, { sourceId, url });

		expect(await processOne(deps, okArchiver, OPTIONS)).toBe(true);
		const source = await prisma.source.findUniqueOrThrow({ where: { id: sourceId } });
		expect(source.archiveUrl).toBe(`https://web.archive.org/web/0/${url}`);
		expect(await archiveQueueDepth(redis)).toEqual({ ready: 0, delayed: 0, dead: 0 });
	});

	it('returns false when the queue is empty', async () => {
		expect(await processOne(deps, okArchiver, OPTIONS)).toBe(false);
	});

	it('schedules a delayed retry with backoff on failure', async () => {
		const sourceId = await makeSource();
		await enqueueArchive(redis, { sourceId, url: 'https://example.org/x' });
		const now = Date.now();
		await processOne(deps, failingArchiver, OPTIONS, now);
		expect((await archiveQueueDepth(redis)).delayed).toBe(1);

		// not due yet, then due after the base backoff
		expect(await promoteDelayed(redis, now + 59_000)).toBe(0);
		expect(await promoteDelayed(redis, now + 61_000)).toBe(1);
		expect((await archiveQueueDepth(redis)).ready).toBe(1);
		// the source was never stamped
		expect(
			(await prisma.source.findUniqueOrThrow({ where: { id: sourceId } })).archiveUrl
		).toBeNull();
	});

	it('dead-letters after max retries', async () => {
		const sourceId = await makeSource();
		await enqueueArchive(redis, { sourceId, url: 'https://example.org/x' });
		let now = Date.now();
		for (let i = 0; i < OPTIONS.maxRetries; i++) {
			await processOne(deps, failingArchiver, OPTIONS, now);
			now += 10 * 60_000;
			await promoteDelayed(redis, now);
		}
		const depth = await archiveQueueDepth(redis);
		expect(depth.dead).toBe(1);
		expect(depth.ready).toBe(0);
		expect(depth.delayed).toBe(0);
	});

	it('a source removed before the job runs simply drops (guarded update)', async () => {
		const sourceId = await makeSource();
		await enqueueArchive(redis, { sourceId, url: 'https://example.org/x' });
		await prisma.source.delete({ where: { id: sourceId } });
		// no throw, job consumed
		expect(await processOne(deps, okArchiver, OPTIONS)).toBe(true);
		expect(await archiveQueueDepth(redis)).toEqual({ ready: 0, delayed: 0, dead: 0 });
	});

	it('runArchiveTick drains the ready queue', async () => {
		const ids = await Promise.all([makeSource(), makeSource(), makeSource()]);
		for (const id of ids) {
			const url = (await prisma.source.findUniqueOrThrow({ where: { id } })).url;
			await enqueueArchive(redis, { sourceId: id, url });
		}
		await runArchiveTick(deps, okArchiver, OPTIONS);
		expect((await archiveQueueDepth(redis)).ready).toBe(0);
		const stamped = await prisma.source.count({ where: { archiveUrl: { not: null } } });
		expect(stamped).toBe(3);
	});
});

describe('archive enqueue feature flag (R26)', () => {
	it('enqueues when sources.archive_enabled is true', async () => {
		await queueArchiveIfEnabled(deps, { sourceId: 's1', url: 'https://example.org/a' });
		expect((await archiveQueueDepth(redis)).ready).toBe(1);
	});

	it('skips cleanly when the flag is off', async () => {
		await setConfigValue(deps, 'sources.archive_enabled', 'false');
		await queueArchiveIfEnabled(deps, { sourceId: 's1', url: 'https://example.org/a' });
		expect((await archiveQueueDepth(redis)).ready).toBe(0);
	});

	it('never throws even if the flag read fails (best-effort)', async () => {
		const brokenDeps = {
			prisma,
			redis: { get: vi.fn().mockRejectedValue(new Error('redis down')) } as unknown as Redis
		};
		// getConfigValue falls through redis errors to the DB, so this still
		// resolves; the point is the wrapper never rejects into the caller
		await expect(
			queueArchiveIfEnabled(brokenDeps, { sourceId: 's1', url: 'https://example.org/a' })
		).resolves.toBeUndefined();
	});
});
