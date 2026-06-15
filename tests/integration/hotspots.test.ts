import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Category, PrismaClient, User } from '@prisma/client';
import type { Redis } from 'ioredis';
import { setupTestDb, truncateAll } from '../helpers/test-db';
import { createTestRedis } from '../helpers/test-redis';
import { seedCategories, seedConfig } from '../../prisma/seed';
import { getHotspots } from '../../src/lib/server/services/facts/hotspots';

let prisma: PrismaClient;
let redis: Redis;
let deps: { prisma: PrismaClient; redis: Redis };

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
});

afterAll(async () => {
	await prisma.$disconnect();
	await redis.quit();
});

const HOUR = 3_600_000;
const DAY = 86_400_000;
let counter = 0;

async function makeUser(): Promise<User> {
	counter += 1;
	return prisma.user.create({
		data: {
			username: `ht${counter}`,
			email: `ht${counter}@example.com`,
			passwordHash: 'x'.repeat(60),
			emailVerifiedAt: new Date()
		}
	});
}

async function category(slug: string): Promise<Category> {
	return prisma.category.findUniqueOrThrow({ where: { slug } });
}

interface FactOpts {
	title: string;
	authorId: string;
	categoryId: string;
	ageHours?: number; // how long ago review started
	windowDays?: number;
}

async function makeUnderReviewFact(opts: FactOpts) {
	const ageHours = opts.ageHours ?? 1;
	const windowDays = opts.windowDays ?? 14;
	const reviewStartedAt = new Date(Date.now() - ageHours * HOUR);
	return prisma.fact.create({
		data: {
			title: opts.title,
			body: 'body for the under-review claim',
			authorId: opts.authorId,
			categoryId: opts.categoryId,
			status: 'UNDER_REVIEW',
			reviewStartedAt,
			reviewDeadline: new Date(reviewStartedAt.getTime() + windowDays * DAY)
		}
	});
}

async function addSourceWithVotes(factId: string, adderId: string, voters: User[]) {
	const source = await prisma.source.create({
		data: {
			factId,
			side: 'PRO',
			url: `https://example.org/${factId}/${counter++}`,
			title: 'A source',
			type: 'PEER_REVIEWED',
			credibility: 5,
			addedById: adderId
		}
	});
	for (const v of voters) {
		await prisma.sourceVote.create({
			data: { sourceId: source.id, userId: v.id, value: 1, weight: 1 }
		});
	}
	return source;
}

describe('hotspots', () => {
	it('flags an under-reviewed source (too few votes) as a hotspot', async () => {
		const author = await makeUser();
		const voter = await makeUser();
		const sci = await category('science');
		const fact = await makeUnderReviewFact({
			title: 'Sparse evidence claim',
			authorId: author.id,
			categoryId: sci.id
		});
		// one source with a single vote -> under min_source_votes (2)
		await addSourceWithVotes(fact.id, author.id, [voter]);

		const hotspots = await getHotspots(deps);
		const entry = hotspots.find((h) => h.id === fact.id);
		expect(entry).toBeDefined();
		expect(entry!.flags.underReviewedSources).toBe(true);
		expect(entry!.underReviewedSourceCount).toBe(1);
	});

	it('flags a freshly contested fact (open veto) and excludes a stale veto', async () => {
		const author = await makeUser();
		const submitter = await makeUser();
		const sci = await category('science');

		const fresh = await makeUnderReviewFact({
			title: 'Freshly contested claim',
			authorId: author.id,
			categoryId: sci.id
		});
		await prisma.veto.create({
			data: {
				factId: fresh.id,
				submitterId: submitter.id,
				reason: 'needs another look',
				status: 'OPEN',
				createdAt: new Date(Date.now() - 1 * HOUR)
			}
		});

		const stale = await makeUnderReviewFact({
			title: 'Stale veto claim with full evidence',
			authorId: author.id,
			categoryId: sci.id,
			ageHours: 1
		});
		// it still qualifies as a hotspot via a sparse source (so it appears in
		// the list at all), but its OPEN veto was opened long ago -> not fresh
		await addSourceWithVotes(stale.id, author.id, []);
		await prisma.veto.create({
			data: {
				factId: stale.id,
				submitterId: submitter.id,
				reason: 'old veto',
				status: 'OPEN',
				createdAt: new Date(Date.now() - 10 * DAY) // older than veto_fresh_hours
			}
		});

		const hotspots = await getHotspots(deps);
		expect(hotspots.find((h) => h.id === fresh.id)?.flags.freshVeto).toBe(true);
		expect(hotspots.find((h) => h.id === stale.id)?.flags.freshVeto).toBe(false);
	});

	it('excludes decided facts and facts that already reached quorum', async () => {
		const author = await makeUser();
		const sci = await category('science');

		// a decided (VERIFIED) fact must never appear
		const decided = await prisma.fact.create({
			data: {
				title: 'Already verified',
				body: 'body',
				authorId: author.id,
				categoryId: sci.id,
				status: 'VERIFIED',
				reviewStartedAt: new Date(Date.now() - 3 * DAY),
				reviewDeadline: new Date(Date.now() + 11 * DAY),
				decidedAt: new Date()
			}
		});

		// an under-review fact that already cleared quorum is not a review hotspot
		const atQuorum = await makeUnderReviewFact({
			title: 'Already at quorum',
			authorId: author.id,
			categoryId: sci.id,
			ageHours: 72 // past min_review_hours (48)
		});
		const voters = await Promise.all([makeUser(), makeUser(), makeUser(), makeUser(), makeUser()]);
		// 5 distinct reviewers, weight 5 each -> >= min_total_weight (15) and >= min_reviewers (5)
		const source = await prisma.source.create({
			data: {
				factId: atQuorum.id,
				side: 'PRO',
				url: `https://example.org/quorum`,
				title: 'A source',
				type: 'PEER_REVIEWED',
				credibility: 5,
				addedById: author.id
			}
		});
		for (const v of voters) {
			await prisma.sourceVote.create({
				data: { sourceId: source.id, userId: v.id, value: 1, weight: 4 }
			});
		}

		const hotspots = await getHotspots(deps);
		expect(hotspots.find((h) => h.id === decided.id)).toBeUndefined();
		expect(hotspots.find((h) => h.id === atQuorum.id)).toBeUndefined();
	});

	it('ranks by urgency: a near-deadline low-quorum fact outranks a fresh one', async () => {
		const author = await makeUser();
		const sci = await category('science');

		// near deadline (13.5 of 14 days elapsed), no votes -> high urgency
		const atRisk = await makeUnderReviewFact({
			title: 'About to expire unproven',
			authorId: author.id,
			categoryId: sci.id,
			ageHours: 13.5 * 24
		});
		await addSourceWithVotes(atRisk.id, author.id, []); // sparse source, no votes

		// just started -> low urgency, but still a hotspot via sparse source
		const fresh = await makeUnderReviewFact({
			title: 'Only just opened',
			authorId: author.id,
			categoryId: sci.id,
			ageHours: 1
		});
		await addSourceWithVotes(fresh.id, author.id, []);

		const hotspots = await getHotspots(deps);
		const atRiskRank = hotspots.findIndex((h) => h.id === atRisk.id);
		const freshRank = hotspots.findIndex((h) => h.id === fresh.id);
		expect(atRiskRank).toBeGreaterThanOrEqual(0);
		expect(freshRank).toBeGreaterThanOrEqual(0);
		expect(atRiskRank).toBeLessThan(freshRank);
		expect(hotspots[atRiskRank].urgency).toBeGreaterThan(hotspots[freshRank].urgency);
	});

	it('filters by category and honors the limit', async () => {
		const author = await makeUser();
		const sci = await category('science');
		const hist = await category('history');

		const inSci = await makeUnderReviewFact({
			title: 'Science hotspot',
			authorId: author.id,
			categoryId: sci.id
		});
		await addSourceWithVotes(inSci.id, author.id, []);
		const inHist = await makeUnderReviewFact({
			title: 'History hotspot',
			authorId: author.id,
			categoryId: hist.id
		});
		await addSourceWithVotes(inHist.id, author.id, []);

		const sciOnly = await getHotspots(deps, { categorySlug: 'science' });
		expect(sciOnly.map((h) => h.id)).toContain(inSci.id);
		expect(sciOnly.map((h) => h.id)).not.toContain(inHist.id);

		const limited = await getHotspots(deps, { limit: 1 });
		expect(limited).toHaveLength(1);
	});
});
