import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { setupTestDb, truncateAll } from '../helpers/test-db';
import { createTestRedis } from '../helpers/test-redis';
import { seedCategories, seedConfig } from '../../prisma/seed';
import { listReviewHub } from '../../src/lib/server/services/facts/review-hub';
import { addSource } from '../../src/lib/server/services/facts/evidence';
import { setConfigValue } from '../../src/lib/server/services/config';

let prisma: PrismaClient;
let redis: Redis;
let deps: { prisma: PrismaClient; redis: Redis };
let scienceId: string;
let physicsId: string;
let sportsId: string;
let userId: string;

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
	scienceId = (await prisma.category.findUniqueOrThrow({ where: { slug: 'science' } })).id;
	sportsId = (await prisma.category.findUniqueOrThrow({ where: { slug: 'sports' } })).id;
	physicsId = (
		await prisma.category.create({
			data: { name: 'Physics', slug: 'physics', parentId: scienceId }
		})
	).id;
	userId = (
		await prisma.user.create({
			data: {
				username: 'hubber',
				email: 'hubber@example.com',
				passwordHash: 'x'.repeat(60),
				emailVerifiedAt: new Date()
			}
		})
	).id;
});

afterAll(async () => {
	await prisma.$disconnect();
	await redis.quit();
});

async function makeFact(
	title: string,
	categoryId: string,
	opts: { status?: 'UNDER_REVIEW' | 'UNSUBSTANTIATED'; votes?: number; ageHours?: number } = {}
) {
	const fact = await prisma.fact.create({
		data: {
			title,
			body: 'body',
			authorId: userId,
			categoryId,
			status: opts.status ?? 'UNDER_REVIEW',
			reviewStartedAt: new Date(Date.now() - (opts.ageHours ?? 1) * 3_600_000),
			reviewDeadline: new Date(Date.now() + 14 * 86_400_000)
		}
	});
	if (opts.votes) {
		const source = await prisma.source.create({
			data: {
				factId: fact.id,
				side: 'PRO',
				url: `https://example.org/${fact.id}`,
				title: 'src',
				type: 'NEWS',
				credibility: 3,
				addedById: userId
			}
		});
		for (let i = 0; i < opts.votes; i++) {
			const voter = await prisma.user.create({
				data: {
					username: `v-${fact.id}-${i}`,
					email: `v-${fact.id}-${i}@example.com`,
					passwordHash: 'x'.repeat(60),
					emailVerifiedAt: new Date()
				}
			});
			await prisma.sourceVote.create({
				data: { sourceId: source.id, userId: voter.id, value: 1, weight: 1 }
			});
		}
	}
	return fact;
}

describe('review hub (R13)', () => {
	it('lists under-review facts with quorum gaps and neutral participation', async () => {
		await makeFact('Two votes in', scienceId, { votes: 2, ageHours: 1 });
		const { entries } = await listReviewHub(deps, { tab: 'review', sort: 'newest' });
		expect(entries).toHaveLength(1);
		const entry = entries[0];
		expect(entry.missingReviewers).toBe(3); // 5 - 2
		expect(entry.missingWeight).toBe(13); // 15 - 2
		expect(entry.missingHours).toBe(47); // 48 - 1
		// blind review (R24): no balance is exposed, only the reviewer count
		expect(entry.reviewerCount).toBe(2);
		expect(entry).not.toHaveProperty('balance');
		expect(entry.quorumReached).toBe(false);
	});

	it('filters by category including children', async () => {
		await makeFact('In physics', physicsId);
		await makeFact('In sports', sportsId);

		const science = await listReviewHub(deps, {
			tab: 'review',
			sort: 'newest',
			categorySlug: 'science'
		});
		expect(science.entries.map((e) => e.title)).toEqual(['In physics']);

		const sports = await listReviewHub(deps, {
			tab: 'review',
			sort: 'newest',
			categorySlug: 'sports'
		});
		expect(sports.entries.map((e) => e.title)).toEqual(['In sports']);
	});

	it('sorts close-to-quorum by progress', async () => {
		await makeFact('Far from quorum', scienceId, { votes: 0, ageHours: 1 });
		await makeFact('Close to quorum', scienceId, { votes: 4, ageHours: 47 });
		const { entries } = await listReviewHub(deps, { tab: 'review', sort: 'close-to-quorum' });
		expect(entries[0].title).toBe('Close to quorum');
	});

	it('paginates with the page size from config, also for close-to-quorum', async () => {
		await setConfigValue(deps, 'review.page_size', '1');
		await makeFact('Far from quorum', scienceId, { votes: 0, ageHours: 1 });
		await makeFact('Close to quorum', scienceId, { votes: 4, ageHours: 47 });

		const page1 = await listReviewHub(deps, { tab: 'review', sort: 'newest', page: 1 });
		expect(page1.entries).toHaveLength(1);
		expect(page1.total).toBe(2);
		expect(page1.totalPages).toBe(2);
		const page2 = await listReviewHub(deps, { tab: 'review', sort: 'newest', page: 2 });
		expect(page2.entries).toHaveLength(1);
		expect(page2.entries[0].id).not.toBe(page1.entries[0].id);

		// close-to-quorum ranks across ALL matching facts before slicing the page
		const closest = await listReviewHub(deps, { tab: 'review', sort: 'close-to-quorum', page: 1 });
		expect(closest.entries.map((e) => e.title)).toEqual(['Close to quorum']);
		const second = await listReviewHub(deps, { tab: 'review', sort: 'close-to-quorum', page: 2 });
		expect(second.entries.map((e) => e.title)).toEqual(['Far from quorum']);
	});

	it('shows unsubstantiated facts on their own tab', async () => {
		await makeFact('Expired claim', scienceId, { status: 'UNSUBSTANTIATED' });
		await makeFact('Active claim', scienceId);
		const unsub = await listReviewHub(deps, { tab: 'unsubstantiated', sort: 'newest' });
		expect(unsub.entries.map((e) => e.title)).toEqual(['Expired claim']);
		const active = await listReviewHub(deps, { tab: 'review', sort: 'newest' });
		expect(active.entries.map((e) => e.title)).toEqual(['Active claim']);
	});
});

describe('revive flow (R13)', () => {
	it('adding evidence revives an unsubstantiated fact exactly once', async () => {
		const fact = await makeFact('Revive me', scienceId, { status: 'UNSUBSTANTIATED' });

		const first = await addSource(deps, {
			factId: fact.id,
			userId,
			side: 'PRO',
			url: 'https://example.org/revival-evidence',
			title: 'Fresh evidence',
			type: 'NEWS'
		});
		expect(first.ok).toBe(true);

		const revived = await prisma.fact.findUniqueOrThrow({ where: { id: fact.id } });
		expect(revived.status).toBe('UNDER_REVIEW');
		expect(revived.revivedAt).not.toBeNull();
		expect(revived.reviewDeadline.getTime()).toBeGreaterThan(Date.now() + 13 * 86_400_000);

		// expire again - the second revival is blocked
		await prisma.fact.update({
			where: { id: fact.id },
			data: { status: 'UNSUBSTANTIATED' }
		});
		const second = await addSource(deps, {
			factId: fact.id,
			userId,
			side: 'PRO',
			url: 'https://example.org/second-try',
			title: 'More evidence',
			type: 'NEWS'
		});
		expect(second.ok).toBe(false);
	});
});
