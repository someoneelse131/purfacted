import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { setupTestDb, truncateAll } from '../helpers/test-db';
import { createTestRedis } from '../helpers/test-redis';
import { seedCategories, seedConfig } from '../../prisma/seed';
import {
	evaluateFact,
	reopenReview,
	runStatusTick
} from '../../src/lib/server/services/facts/status-engine';
import { setConfigValue } from '../../src/lib/server/services/config';

let prisma: PrismaClient;
let redis: Redis;
let deps: { prisma: PrismaClient; redis: Redis };
let categoryId: string;

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
async function makeUser(reputation = 0) {
	counter += 1;
	return prisma.user.create({
		data: {
			username: `u${counter}`,
			email: `u${counter}@example.com`,
			passwordHash: 'x'.repeat(60),
			reputation,
			emailVerifiedAt: new Date()
		}
	});
}

interface FixtureSource {
	side: 'PRO' | 'CONTRA';
	credibility: number;
	adderId: string;
	votes: { userId: string; value: number; weight: number }[];
}

async function makeFact(
	authorId: string,
	sources: FixtureSource[],
	ageHours = 100
): Promise<string> {
	const fact = await prisma.fact.create({
		data: {
			title: 'Fixture claim for the status engine',
			body: 'body',
			authorId,
			categoryId,
			reviewStartedAt: new Date(Date.now() - ageHours * 3_600_000),
			reviewDeadline: new Date(Date.now() + 86_400_000)
		}
	});
	for (const [i, source] of sources.entries()) {
		await prisma.source.create({
			data: {
				factId: fact.id,
				side: source.side,
				url: `https://example.org/source-${i}`,
				title: `Source ${i}`,
				type: 'NEWS',
				credibility: source.credibility,
				addedById: source.adderId,
				votes: { create: source.votes }
			}
		});
	}
	return fact.id;
}

describe('status engine (R12)', () => {
	it('decides VERIFIED on strong PRO balance and pays out reputation', async () => {
		const author = await makeUser();
		const adder = await makeUser();
		const voters = await Promise.all([makeUser(), makeUser(), makeUser(), makeUser(), makeUser()]);

		// 5 reviewers, total weight 16 (>15), all upvoting one PRO source
		const factId = await makeFact(author.id, [
			{
				side: 'PRO',
				credibility: 5,
				adderId: adder.id,
				votes: voters.map((v, i) => ({ userId: v.id, value: 1, weight: i === 0 ? 4 : 3 }))
			}
		]);

		const result = await evaluateFact(deps, factId);
		expect(result?.quorum.reached).toBe(true);
		expect(result?.decided).toBe(true);
		expect(result?.newStatus).toBe('VERIFIED');

		const fact = await prisma.fact.findUniqueOrThrow({ where: { id: factId } });
		expect(fact.status).toBe('VERIFIED');
		expect(fact.decidedAt).not.toBeNull();

		// payouts: author +10, adder +2 (positive consensus), each voter +1
		expect((await prisma.user.findUniqueOrThrow({ where: { id: author.id } })).reputation).toBe(10);
		expect((await prisma.user.findUniqueOrThrow({ where: { id: adder.id } })).reputation).toBe(2);
		for (const voter of voters) {
			expect((await prisma.user.findUniqueOrThrow({ where: { id: voter.id } })).reputation).toBe(1);
		}
	});

	it('decides REFUTED on strong CONTRA balance (-15 for the author)', async () => {
		const author = await makeUser();
		const adder = await makeUser();
		const voters = await Promise.all([makeUser(), makeUser(), makeUser(), makeUser(), makeUser()]);
		const factId = await makeFact(author.id, [
			{
				side: 'CONTRA',
				credibility: 4,
				adderId: adder.id,
				votes: voters.map((v) => ({ userId: v.id, value: 1, weight: 3.2 }))
			}
		]);

		const result = await evaluateFact(deps, factId);
		expect(result?.newStatus).toBe('REFUTED');
		expect((await prisma.user.findUniqueOrThrow({ where: { id: author.id } })).reputation).toBe(
			-15
		);
	});

	it('decides DISPUTED when the balance sits between the thresholds', async () => {
		const author = await makeUser();
		const adder = await makeUser();
		const voters = await Promise.all([makeUser(), makeUser(), makeUser(), makeUser(), makeUser()]);
		// both sides score 22.5 -> balance 0; total weight 6 x 2.5 = 15
		const factId = await makeFact(author.id, [
			{
				side: 'PRO',
				credibility: 3,
				adderId: adder.id,
				votes: voters.slice(0, 3).map((v) => ({ userId: v.id, value: 1, weight: 2.5 }))
			},
			{
				side: 'CONTRA',
				credibility: 3,
				adderId: adder.id,
				votes: voters.slice(2).map((v) => ({ userId: v.id, value: 1, weight: 2.5 }))
			}
		]);

		const result = await evaluateFact(deps, factId);
		expect(result?.quorum.reached).toBe(true);
		expect(result?.newStatus).toBe('DISPUTED');
		// disputed: author neutral, adder still +2 per positively-rated source
		expect((await prisma.user.findUniqueOrThrow({ where: { id: author.id } })).reputation).toBe(0);
		expect((await prisma.user.findUniqueOrThrow({ where: { id: adder.id } })).reputation).toBe(4);
	});

	it('does not decide before quorum (weight, reviewers, age gates)', async () => {
		const author = await makeUser();
		const adder = await makeUser();
		const voters = await Promise.all([makeUser(), makeUser(), makeUser(), makeUser(), makeUser()]);

		// enough weight+reviewers but too young
		const young = await makeFact(
			author.id,
			[
				{
					side: 'PRO',
					credibility: 5,
					adderId: adder.id,
					votes: voters.map((v) => ({ userId: v.id, value: 1, weight: 4 }))
				}
			],
			10 // hours < 48
		);
		const youngResult = await evaluateFact(deps, young);
		expect(youngResult?.quorum.reached).toBe(false);
		expect(youngResult?.quorum.missingHours).toBeGreaterThan(0);
		expect((await prisma.fact.findUniqueOrThrow({ where: { id: young } })).status).toBe(
			'UNDER_REVIEW'
		);

		// only 2 reviewers
		const fewReviewers = await makeFact(author.id, [
			{
				side: 'PRO',
				credibility: 5,
				adderId: adder.id,
				votes: [
					{ userId: voters[0].id, value: 1, weight: 10 },
					{ userId: voters[1].id, value: 1, weight: 10 }
				]
			}
		]);
		const fewResult = await evaluateFact(deps, fewReviewers);
		expect(fewResult?.quorum.reached).toBe(false);
		expect(fewResult?.quorum.missingReviewers).toBe(3);
	});

	it('pays out exactly once even when evaluated repeatedly', async () => {
		const author = await makeUser();
		const adder = await makeUser();
		const voters = await Promise.all([makeUser(), makeUser(), makeUser(), makeUser(), makeUser()]);
		const factId = await makeFact(author.id, [
			{
				side: 'PRO',
				credibility: 5,
				adderId: adder.id,
				votes: voters.map((v) => ({ userId: v.id, value: 1, weight: 4 }))
			}
		]);

		await evaluateFact(deps, factId);
		await evaluateFact(deps, factId);
		await runStatusTick(deps);
		expect((await prisma.user.findUniqueOrThrow({ where: { id: author.id } })).reputation).toBe(10);
	});

	it('expires overdue reviews to UNSUBSTANTIATED via the tick', async () => {
		const author = await makeUser();
		const factId = await makeFact(author.id, [], 400);
		await prisma.fact.update({
			where: { id: factId },
			data: { reviewDeadline: new Date(Date.now() - 1000) }
		});

		const tick = await runStatusTick(deps);
		expect(tick.expired).toBe(1);
		const fact = await prisma.fact.findUniqueOrThrow({ where: { id: factId } });
		expect(fact.status).toBe('UNSUBSTANTIATED');
		// no payouts for unsubstantiated
		expect((await prisma.user.findUniqueOrThrow({ where: { id: author.id } })).reputation).toBe(0);
	});

	it('the tick also decides facts whose age gate just opened', async () => {
		const author = await makeUser();
		const adder = await makeUser();
		const voters = await Promise.all([makeUser(), makeUser(), makeUser(), makeUser(), makeUser()]);
		const factId = await makeFact(author.id, [
			{
				side: 'PRO',
				credibility: 5,
				adderId: adder.id,
				votes: voters.map((v) => ({ userId: v.id, value: 1, weight: 4 }))
			}
		]);
		const tick = await runStatusTick(deps);
		expect(tick.decided).toBe(1);
		expect((await prisma.fact.findUniqueOrThrow({ where: { id: factId } })).status).toBe(
			'VERIFIED'
		);
	});

	it('respects config overrides (thresholds and quorum)', async () => {
		await setConfigValue(deps, 'quorum.min_total_weight', '2');
		await setConfigValue(deps, 'quorum.min_reviewers', '1');
		await setConfigValue(deps, 'quorum.min_review_hours', '0');

		const author = await makeUser();
		const adder = await makeUser();
		const voter = await makeUser();
		const factId = await makeFact(
			author.id,
			[
				{
					side: 'PRO',
					credibility: 5,
					adderId: adder.id,
					votes: [{ userId: voter.id, value: 1, weight: 2 }]
				}
			],
			0
		);
		const result = await evaluateFact(deps, factId);
		expect(result?.decided).toBe(true);
		expect(result?.newStatus).toBe('VERIFIED');
	});

	it('reopenReview puts a fact back under review with a fresh window', async () => {
		const author = await makeUser();
		const factId = await makeFact(author.id, [], 400);
		await prisma.fact.update({
			where: { id: factId },
			data: { status: 'UNSUBSTANTIATED', decidedAt: new Date() }
		});

		expect(await reopenReview(deps, factId, { from: ['UNSUBSTANTIATED'] })).toBe(true);
		const fact = await prisma.fact.findUniqueOrThrow({ where: { id: factId } });
		expect(fact.status).toBe('UNDER_REVIEW');
		expect(fact.decidedAt).toBeNull();
		expect(fact.reviewDeadline.getTime()).toBeGreaterThan(Date.now() + 13 * 86_400_000);
	});

	it('reopenReview is a guarded claim: wrong source status fails', async () => {
		const author = await makeUser();
		const factId = await makeFact(author.id, [], 400);
		await prisma.fact.update({ where: { id: factId }, data: { status: 'VERIFIED' } });
		expect(await reopenReview(deps, factId, { from: ['UNSUBSTANTIATED'] })).toBe(false);
		expect((await prisma.fact.findUniqueOrThrow({ where: { id: factId } })).status).toBe(
			'VERIFIED'
		);
	});
});

describe('soft-deleted facts are inert (R17)', () => {
	it('the engine never evaluates, expires or pays out removed facts', async () => {
		const author = await makeUser();
		const adder = await makeUser();
		const voters = await Promise.all([makeUser(), makeUser(), makeUser(), makeUser(), makeUser()]);
		const factId = await makeFact(author.id, [
			{
				side: 'PRO',
				credibility: 5,
				adderId: adder.id,
				votes: voters.map((v) => ({ userId: v.id, value: 1, weight: 4 }))
			}
		]);
		await prisma.fact.update({
			where: { id: factId },
			data: { deletedAt: new Date(), reviewDeadline: new Date(Date.now() - 1000) }
		});

		expect(await evaluateFact(deps, factId)).toBeNull();
		const tick = await runStatusTick(deps);
		expect(tick.expired).toBe(0);
		expect(tick.decided).toBe(0);

		const fact = await prisma.fact.findUniqueOrThrow({ where: { id: factId } });
		expect(fact.status).toBe('UNDER_REVIEW'); // untouched
		expect((await prisma.user.findUniqueOrThrow({ where: { id: author.id } })).reputation).toBe(0);
	});
});

describe('decision repair pass (crash recovery)', () => {
	it('re-applies lost payouts for recently decided facts, idempotently', async () => {
		const author = await makeUser();
		const adder = await makeUser();
		const voters = await Promise.all([makeUser(), makeUser(), makeUser(), makeUser(), makeUser()]);
		const factId = await makeFact(author.id, [
			{
				side: 'PRO',
				credibility: 5,
				adderId: adder.id,
				votes: voters.map((v) => ({ userId: v.id, value: 1, weight: 4 }))
			}
		]);
		// simulate a crash right after the decision claim: the row is decided
		// but no payouts/veto resolutions ever ran
		await prisma.fact.update({
			where: { id: factId },
			data: { status: 'VERIFIED', decidedAt: new Date() }
		});
		expect((await prisma.user.findUniqueOrThrow({ where: { id: author.id } })).reputation).toBe(0);

		await runStatusTick(deps);
		expect((await prisma.user.findUniqueOrThrow({ where: { id: author.id } })).reputation).toBe(10);
		expect((await prisma.user.findUniqueOrThrow({ where: { id: adder.id } })).reputation).toBe(2);

		// repeated repair changes nothing (ledger dedup)
		await runStatusTick(deps);
		await runStatusTick(deps);
		expect((await prisma.user.findUniqueOrThrow({ where: { id: author.id } })).reputation).toBe(10);
		expect((await prisma.user.findUniqueOrThrow({ where: { id: adder.id } })).reputation).toBe(2);
		expect(await prisma.reputationEvent.count()).toBe(1 + 1 + voters.length);
	});

	it('also resolves vetoes that were left OPEN by a crash', async () => {
		const author = await makeUser();
		const vetoer = await makeUser();
		const factId = await makeFact(author.id, []);
		await prisma.fact.update({
			where: { id: factId },
			data: { status: 'VERIFIED', decidedAt: new Date() }
		});
		await prisma.veto.create({
			data: { factId, submitterId: vetoer.id, reason: 'stale veto', previousStatus: 'REFUTED' }
		});

		await runStatusTick(deps);
		const veto = await prisma.veto.findFirstOrThrow({ where: { factId } });
		expect(veto.status).toBe('SUCCEEDED'); // REFUTED -> VERIFIED = status changed
		expect((await prisma.user.findUniqueOrThrow({ where: { id: vetoer.id } })).reputation).toBe(5);
	});
});
