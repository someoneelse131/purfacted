import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FactStatus, PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { setupTestDb, truncateAll } from '../helpers/test-db';
import { createTestRedis } from '../helpers/test-redis';
import { seedCategories, seedConfig } from '../../prisma/seed';
import { listFeed } from '../../src/lib/server/services/facts/feed';

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
				username: 'feeder',
				email: 'feeder@example.com',
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

let factCounter = 0;
async function makeFact(
	title: string,
	status: FactStatus,
	categoryId: string,
	opts: { body?: string; votes?: number; decidedAt?: Date } = {}
) {
	factCounter += 1;
	const fact = await prisma.fact.create({
		data: {
			title,
			body: opts.body ?? 'body',
			status,
			authorId: userId,
			categoryId,
			reviewDeadline: new Date(Date.now() + 86_400_000),
			decidedAt:
				status === 'UNDER_REVIEW'
					? null
					: (opts.decidedAt ?? new Date(Date.now() - factCounter * 1000))
		}
	});
	if (opts.votes) {
		const source = await prisma.source.create({
			data: {
				factId: fact.id,
				side: 'PRO',
				url: `https://example.org/feed-${factCounter}`,
				title: 'src',
				type: 'NEWS',
				credibility: 3,
				addedById: userId
			}
		});
		for (let i = 0; i < opts.votes; i++) {
			const voter = await prisma.user.create({
				data: {
					username: `fv-${factCounter}-${i}`,
					email: `fv-${factCounter}-${i}@example.com`,
					passwordHash: 'x'.repeat(60)
				}
			});
			await prisma.sourceVote.create({
				data: { sourceId: source.id, userId: voter.id, value: 1, weight: 1 }
			});
		}
	}
	return fact;
}

describe('main feed (R14)', () => {
	it('shows only decided facts, newest first', async () => {
		await makeFact('Verified claim', 'VERIFIED', scienceId);
		await makeFact('Refuted claim', 'REFUTED', scienceId);
		await makeFact('Still under review', 'UNDER_REVIEW', scienceId);
		await makeFact('Unsubstantiated claim', 'UNSUBSTANTIATED', scienceId);

		const feed = await listFeed(deps, { sort: 'newest', page: 1 });
		expect(feed.entries.map((e) => e.title)).toEqual(['Verified claim', 'Refuted claim']);
		expect(feed.total).toBe(2);
	});

	it('filters by status and category (incl. children)', async () => {
		await makeFact('Physics verified', 'VERIFIED', physicsId);
		await makeFact('Sports disputed', 'DISPUTED', sportsId);

		const verified = await listFeed(deps, { sort: 'newest', status: 'VERIFIED', page: 1 });
		expect(verified.entries.map((e) => e.title)).toEqual(['Physics verified']);

		const science = await listFeed(deps, {
			sort: 'newest',
			categorySlug: 'science',
			page: 1
		});
		expect(science.entries.map((e) => e.title)).toEqual(['Physics verified']);
	});

	it('sorts by review activity and controversy', async () => {
		await makeFact('Quiet fact', 'VERIFIED', scienceId, { votes: 1 });
		await makeFact('Busy fact', 'VERIFIED', scienceId, { votes: 5 });
		await makeFact('Disputed fact', 'DISPUTED', scienceId, { votes: 2 });

		const mostReviewed = await listFeed(deps, { sort: 'most-reviewed', page: 1 });
		expect(mostReviewed.entries[0].title).toBe('Busy fact');
		expect(mostReviewed.entries[0].reviewCount).toBe(5);

		const controversial = await listFeed(deps, { sort: 'controversial', page: 1 });
		expect(controversial.entries[0].title).toBe('Disputed fact');
	});

	it('paginates', async () => {
		for (let i = 1; i <= 5; i++) {
			await makeFact(`Numbered claim ${i}`, 'VERIFIED', scienceId);
		}
		const page1 = await listFeed(deps, { sort: 'newest', page: 1, pageSize: 2 });
		expect(page1.entries).toHaveLength(2);
		expect(page1.total).toBe(5);
		expect(page1.totalPages).toBe(3);

		const page3 = await listFeed(deps, { sort: 'newest', page: 3, pageSize: 2 });
		expect(page3.entries).toHaveLength(1);
		// no overlap between pages
		const ids = new Set([...page1.entries, ...page3.entries].map((e) => e.id));
		expect(ids.size).toBe(3);
	});
});

describe('full-text search (R14)', () => {
	it('finds facts by stemmed words in title and body', async () => {
		await makeFact('Water boils at 100 degrees at sea level', 'VERIFIED', scienceId, {
			body: 'Standard atmospheric pressure assumed.'
		});
		await makeFact('Unrelated football statistics', 'VERIFIED', sportsId);

		const byTitle = await listFeed(deps, { sort: 'newest', query: 'boiling water', page: 1 });
		expect(byTitle.entries.map((e) => e.title)).toEqual([
			'Water boils at 100 degrees at sea level'
		]);

		const byBody = await listFeed(deps, { sort: 'newest', query: 'atmospheric', page: 1 });
		expect(byBody.entries).toHaveLength(1);

		const noHit = await listFeed(deps, {
			sort: 'newest',
			query: 'quantum chromodynamics',
			page: 1
		});
		expect(noHit.entries).toHaveLength(0);
	});

	it('combines search with status filter', async () => {
		await makeFact('Coffee is healthy says study', 'VERIFIED', scienceId);
		await makeFact('Coffee is unhealthy says other study', 'REFUTED', scienceId);
		const result = await listFeed(deps, {
			sort: 'newest',
			query: 'coffee',
			status: 'REFUTED',
			page: 1
		});
		expect(result.entries.map((e) => e.title)).toEqual(['Coffee is unhealthy says other study']);
	});
});
