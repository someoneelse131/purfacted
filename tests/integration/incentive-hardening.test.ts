import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient, Role } from '@prisma/client';
import type { Redis } from 'ioredis';
import { setupTestDb, truncateAll } from '../helpers/test-db';
import { createTestRedis } from '../helpers/test-redis';
import { seedCategories, seedConfig } from '../../prisma/seed';
import { editFact, hasForeignInteraction } from '../../src/lib/server/services/facts/submit';
import { evaluateFact } from '../../src/lib/server/services/facts/status-engine';
import { listFeed } from '../../src/lib/server/services/facts/feed';

// R24 - Scoring & Incentive Hardening. Confidence damping and the early-vote
// bonus are exercised in scoring.test.ts / status-engine.test.ts; this file
// covers probation quorum exclusion, claim immutability and "veto stays in
// feed".

let prisma: PrismaClient;
let redis: Redis;
let deps: { prisma: PrismaClient; redis: Redis };
let scienceId: string;

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
});

afterAll(async () => {
	await prisma.$disconnect();
	await redis.quit();
});

let counter = 0;
function userData(role: Role, opts: { fresh?: boolean; reputation?: number } = {}) {
	counter += 1;
	return {
		username: `ih${counter}`,
		email: `ih${counter}@example.com`,
		passwordHash: 'x'.repeat(60),
		role,
		reputation: opts.reputation ?? 0,
		emailVerifiedAt: new Date(),
		createdAt: opts.fresh ? new Date() : new Date(Date.now() - 30 * 86_400_000)
	};
}

async function makeFact(authorId: string, status: 'UNDER_REVIEW' = 'UNDER_REVIEW') {
	return prisma.fact.create({
		data: {
			title: 'Is this claim editable right now or not',
			body: 'original body',
			authorId,
			categoryId: scienceId,
			status,
			reviewStartedAt: new Date(Date.now() - 100 * 3_600_000),
			reviewDeadline: new Date(Date.now() + 86_400_000)
		}
	});
}

describe('probation excludes a reviewer from the quorum (R24)', () => {
	it('a probation vote adds weight but not a distinct reviewer', async () => {
		const author = await prisma.user.create({ data: userData('VERIFIED') });
		const established = await Promise.all(
			Array.from({ length: 4 }, () => prisma.user.create({ data: userData('VERIFIED') }))
		);
		const fresh = await prisma.user.create({ data: userData('VERIFIED', { fresh: true }) });

		const source = await prisma.source.create({
			data: {
				factId: (await makeFact(author.id)).id,
				side: 'PRO',
				url: 'https://example.org/s',
				title: 'Source',
				type: 'NEWS',
				credibility: 5,
				addedById: author.id
			}
		});
		// 4 established reviewers + 1 probation reviewer; total weight clears 15
		for (const u of established) {
			await prisma.sourceVote.create({
				data: { sourceId: source.id, userId: u.id, value: 1, weight: 4, onProbation: false }
			});
		}
		await prisma.sourceVote.create({
			data: { sourceId: source.id, userId: fresh.id, value: 1, weight: 4, onProbation: true }
		});

		const result = await evaluateFact(deps, source.factId);
		// total weight 20 >= 15, but only 4 distinct non-probation reviewers < 5
		expect(result?.quorum.reached).toBe(false);
		expect(result?.quorum.missingReviewers).toBe(1);
		expect(result?.decided).toBe(false);
	});
});

describe('claim immutability (R24)', () => {
	it('author may edit before any foreign interaction', async () => {
		const author = await prisma.user.create({ data: userData('VERIFIED') });
		const fact = await makeFact(author.id);

		expect(await hasForeignInteraction(deps, fact.id, author.id)).toBe(false);
		const result = await editFact(deps, {
			factId: fact.id,
			userId: author.id,
			role: 'VERIFIED',
			title: 'A clearly reworded claim about the topic',
			body: 'updated body'
		});
		expect(result.ok).toBe(true);
		const reloaded = await prisma.fact.findUniqueOrThrow({ where: { id: fact.id } });
		expect(reloaded.title).toBe('A clearly reworded claim about the topic');
		expect(reloaded.body).toBe('updated body');
	});

	it('locks the wording once another member votes', async () => {
		const author = await prisma.user.create({ data: userData('VERIFIED') });
		const other = await prisma.user.create({ data: userData('VERIFIED') });
		const fact = await makeFact(author.id);
		const source = await prisma.source.create({
			data: {
				factId: fact.id,
				side: 'PRO',
				url: 'https://example.org/s',
				title: 'Source',
				type: 'NEWS',
				credibility: 3,
				addedById: author.id
			}
		});
		await prisma.sourceVote.create({
			data: { sourceId: source.id, userId: other.id, value: 1, weight: 1 }
		});

		expect(await hasForeignInteraction(deps, fact.id, author.id)).toBe(true);
		const blocked = await editFact(deps, {
			factId: fact.id,
			userId: author.id,
			role: 'VERIFIED',
			title: 'Trying to swap the claim after the fact',
			body: 'sneaky'
		});
		expect(blocked.ok).toBe(false);

		// a moderator can still edit, and it is audited
		const mod = await prisma.user.create({ data: userData('MODERATOR') });
		const modEdit = await editFact(deps, {
			factId: fact.id,
			userId: mod.id,
			role: 'MODERATOR',
			title: 'Moderator-corrected claim wording here',
			body: 'corrected'
		});
		expect(modEdit.ok).toBe(true);
		const logged = await prisma.moderationAction.count({
			where: { action: 'edit_fact', targetId: fact.id }
		});
		expect(logged).toBe(1);
	});

	it('the author cannot edit once the fact is decided', async () => {
		const author = await prisma.user.create({ data: userData('VERIFIED') });
		const fact = await prisma.fact.create({
			data: {
				title: 'A claim that has already been verified now',
				body: 'b',
				authorId: author.id,
				categoryId: scienceId,
				status: 'VERIFIED',
				reviewDeadline: new Date(Date.now() + 86_400_000),
				decidedAt: new Date()
			}
		});
		const result = await editFact(deps, {
			factId: fact.id,
			userId: author.id,
			role: 'VERIFIED',
			title: 'Editing a decided claim should be refused',
			body: 'nope'
		});
		expect(result.ok).toBe(false);
	});
});

describe('veto stays in feed (R24)', () => {
	it('a fact back under review under an open veto shows as contested with its previous status', async () => {
		const author = await prisma.user.create({ data: userData('VERIFIED') });
		// the fact was VERIFIED, then a veto sent it back under review
		const fact = await prisma.fact.create({
			data: {
				title: 'A verified claim that is now contested by a veto',
				body: 'b',
				authorId: author.id,
				categoryId: scienceId,
				status: 'UNDER_REVIEW',
				reviewStartedAt: new Date(),
				reviewDeadline: new Date(Date.now() + 86_400_000)
			}
		});
		await prisma.veto.create({
			data: {
				factId: fact.id,
				submitterId: author.id,
				reason: 'this needs another look',
				status: 'OPEN',
				previousStatus: 'VERIFIED'
			}
		});

		const feed = await listFeed(deps, { sort: 'newest', page: 1 });
		const entry = feed.entries.find((e) => e.id === fact.id);
		expect(entry).toBeDefined();
		expect(entry!.status).toBe('VERIFIED'); // keeps previous decided status
		expect(entry!.contested).toBe(true);

		// it also matches a VERIFIED status filter via its effective status
		const filtered = await listFeed(deps, { sort: 'newest', page: 1, status: 'VERIFIED' });
		expect(filtered.entries.some((e) => e.id === fact.id)).toBe(true);
	});
});
