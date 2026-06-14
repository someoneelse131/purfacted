import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FactStatus, PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { setupTestDb, truncateAll } from '../helpers/test-db';
import { createTestRedis } from '../helpers/test-redis';
import { seedCategories, seedConfig } from '../../prisma/seed';
import { resolveVetoes, submitVeto } from '../../src/lib/server/services/facts/veto';
import { evaluateFact, runStatusTick } from '../../src/lib/server/services/facts/status-engine';
import { setConfigValue } from '../../src/lib/server/services/config';
import type { VotingUser } from '../../src/lib/server/services/vote-weight';

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
	// low quorum so re-decisions are easy to trigger
	await setConfigValue(deps, 'quorum.min_total_weight', '1');
	await setConfigValue(deps, 'quorum.min_reviewers', '1');
	await setConfigValue(deps, 'quorum.min_review_hours', '0');
});

afterAll(async () => {
	await prisma.$disconnect();
	await redis.quit();
});

let counter = 0;
async function makeUser(): Promise<VotingUser> {
	counter += 1;
	return prisma.user.create({
		data: {
			username: `vt${counter}`,
			email: `vt${counter}@example.com`,
			passwordHash: 'x'.repeat(60),
			emailVerifiedAt: new Date()
		}
	});
}

async function makeDecidedFact(status: FactStatus = 'VERIFIED'): Promise<string> {
	counter += 1;
	const author = await makeUser();
	const fact = await prisma.fact.create({
		data: {
			title: `Decided fact ${counter}`,
			body: 'body',
			status,
			authorId: author.id,
			categoryId,
			reviewDeadline: new Date(Date.now() + 86_400_000),
			decidedAt: new Date(),
			sources: {
				create: {
					side: 'PRO',
					url: `https://example.org/original-${counter}`,
					title: 'Original source',
					type: 'NEWS',
					credibility: 3,
					addedById: author.id
				}
			}
		}
	});
	return fact.id;
}

function vetoInput(user: VotingUser, factId: string, url: string) {
	return {
		factId,
		user,
		reason: 'A newer study contradicts the verdict.',
		source: {
			side: 'CONTRA',
			url,
			title: 'Newer study',
			type: 'PEER_REVIEWED',
			quote: 'A newer cohort study reports the opposite effect at the same dose.'
		}
	};
}

describe('veto submission (R16)', () => {
	it('sends the fact back under review and stores the previous status', async () => {
		const factId = await makeDecidedFact('VERIFIED');
		const user = await makeUser();
		const result = await submitVeto(deps, vetoInput(user, factId, 'https://example.org/new-study'));
		expect(result.ok).toBe(true);

		const fact = await prisma.fact.findUniqueOrThrow({ where: { id: factId } });
		expect(fact.status).toBe('UNDER_REVIEW');
		expect(fact.decidedAt).toBeNull();

		const veto = await prisma.veto.findFirstOrThrow({ where: { factId } });
		expect(veto.status).toBe('OPEN');
		expect(veto.previousStatus).toBe('VERIFIED');
		expect(await prisma.source.count({ where: { factId } })).toBe(2);
	});

	it('rejects vetoes without a NEW source and restores the decided state', async () => {
		const factId = await makeDecidedFact('VERIFIED');
		const user = await makeUser();
		const fact = await prisma.fact.findUniqueOrThrow({ where: { id: factId } });
		const existingUrl = (await prisma.source.findFirstOrThrow({ where: { factId } })).url;

		const dup = await submitVeto(deps, vetoInput(user, factId, existingUrl));
		expect(dup.ok).toBe(false);
		if (!dup.ok) expect(dup.error).toContain('already on the fact');

		const restored = await prisma.fact.findUniqueOrThrow({ where: { id: factId } });
		expect(restored.status).toBe('VERIFIED');
		expect(restored.decidedAt?.getTime()).toBe(fact.decidedAt?.getTime());
		expect(await prisma.veto.count({ where: { factId } })).toBe(0);
	});

	it('only decided facts can be vetoed; max one open veto; rate limited', async () => {
		const underReview = await prisma.fact.create({
			data: {
				title: 'Still reviewing',
				body: 'body',
				authorId: (await makeUser()).id,
				categoryId,
				reviewDeadline: new Date(Date.now() + 86_400_000)
			}
		});
		const user = await makeUser();
		expect(
			(await submitVeto(deps, vetoInput(user, underReview.id, 'https://example.org/x'))).ok
		).toBe(false);

		const factId = await makeDecidedFact();
		const first = await submitVeto(deps, vetoInput(user, factId, 'https://example.org/a'));
		expect(first.ok).toBe(true);
		// the fact is now UNDER_REVIEW -> "already open veto" guard is reached
		// via the decided-state check; create another decided fact to verify
		// the open-veto rule directly
		await prisma.fact.update({ where: { id: factId }, data: { status: 'VERIFIED' } });
		const second = await submitVeto(deps, vetoInput(user, factId, 'https://example.org/b'));
		expect(second.ok).toBe(false);
		if (!second.ok) expect(second.error).toContain('open veto');

		// rate limit: 3/day (one used already)
		const otherUser = user;
		const f2 = await makeDecidedFact();
		const f3 = await makeDecidedFact();
		const f4 = await makeDecidedFact();
		expect((await submitVeto(deps, vetoInput(otherUser, f2, 'https://example.org/c'))).ok).toBe(
			true
		);
		expect((await submitVeto(deps, vetoInput(otherUser, f3, 'https://example.org/d'))).ok).toBe(
			true
		);
		const limited = await submitVeto(deps, vetoInput(otherUser, f4, 'https://example.org/e'));
		expect(limited.ok).toBe(false);
		if (!limited.ok) expect(limited.error).toContain('limit');
	});
});

describe('veto resolution (R16)', () => {
	it('succeeds (+5) when the re-decision changes the status', async () => {
		const factId = await makeDecidedFact('VERIFIED');
		const vetoer = await makeUser();
		const voter = await makeUser();
		await submitVeto(deps, vetoInput(vetoer, factId, 'https://example.org/contra-study'));

		// upvote the CONTRA source heavily -> re-decision REFUTED
		const contra = await prisma.source.findFirstOrThrow({
			where: { factId, side: 'CONTRA' }
		});
		await prisma.sourceVote.create({
			data: { sourceId: contra.id, userId: voter.id, value: 1, weight: 5 }
		});
		const result = await evaluateFact(deps, factId);
		expect(result?.newStatus).toBe('REFUTED');

		const veto = await prisma.veto.findFirstOrThrow({ where: { factId } });
		expect(veto.status).toBe('SUCCEEDED');
		expect(veto.resolvedAt).not.toBeNull();
		const submitter = await prisma.user.findUniqueOrThrow({ where: { id: vetoer.id } });
		// +5 veto success, +2 source consensus, +1 matched vote? vetoer added
		// the contra source (+2) but did not vote on it; voter gets +1
		expect(submitter.reputation).toBe(5 + 2);
	});

	it('fails (-5) when the re-decision confirms the previous status', async () => {
		const factId = await makeDecidedFact('VERIFIED');
		const vetoer = await makeUser();
		const voter = await makeUser();
		await submitVeto(deps, vetoInput(vetoer, factId, 'https://example.org/weak-study'));

		// the community re-confirms: upvote the original PRO source
		const pro = await prisma.source.findFirstOrThrow({ where: { factId, side: 'PRO' } });
		await prisma.sourceVote.create({
			data: { sourceId: pro.id, userId: voter.id, value: 1, weight: 5 }
		});
		const result = await evaluateFact(deps, factId);
		expect(result?.newStatus).toBe('VERIFIED');

		const veto = await prisma.veto.findFirstOrThrow({ where: { factId } });
		expect(veto.status).toBe('FAILED');
		const submitter = await prisma.user.findUniqueOrThrow({ where: { id: vetoer.id } });
		expect(submitter.reputation).toBe(-5);
	});

	it('expiring re-review restores the previous status and fails the veto', async () => {
		// a veto must never succeed just because the re-review ran out of
		// quorum - otherwise stalling would farm +5 and unlist decided facts
		const factId = await makeDecidedFact('VERIFIED');
		const vetoer = await makeUser();
		await submitVeto(deps, vetoInput(vetoer, factId, 'https://example.org/expiring'));
		await prisma.fact.update({
			where: { id: factId },
			data: { reviewDeadline: new Date(Date.now() - 1000) }
		});
		await runStatusTick(deps);

		const veto = await prisma.veto.findFirstOrThrow({ where: { factId } });
		expect(veto.status).toBe('FAILED');
		expect(veto.resolvedAt).not.toBeNull();
		const fact = await prisma.fact.findUniqueOrThrow({ where: { id: factId } });
		expect(fact.status).toBe('VERIFIED'); // restored, not UNSUBSTANTIATED
		expect(fact.decidedAt).not.toBeNull();
		const submitter = await prisma.user.findUniqueOrThrow({ where: { id: vetoer.id } });
		expect(submitter.reputation).toBe(-5);
	});

	it('normal first-review expiry (no veto) still goes UNSUBSTANTIATED', async () => {
		const author = await makeUser();
		const fact = await prisma.fact.create({
			data: {
				title: 'Never vetoed',
				body: 'body',
				authorId: author.id,
				categoryId,
				reviewDeadline: new Date(Date.now() - 1000)
			}
		});
		await runStatusTick(deps);
		expect((await prisma.fact.findUniqueOrThrow({ where: { id: fact.id } })).status).toBe(
			'UNSUBSTANTIATED'
		);
	});

	it('resolves each veto exactly once (no double award on repeated resolution)', async () => {
		const factId = await makeDecidedFact('VERIFIED');
		const vetoer = await makeUser();
		await submitVeto(deps, vetoInput(vetoer, factId, 'https://example.org/once'));

		await resolveVetoes(deps, factId, 'VERIFIED'); // FAILED, -5
		await resolveVetoes(deps, factId, 'REFUTED'); // already claimed -> no-op
		await resolveVetoes(deps, factId, 'VERIFIED'); // no-op

		const veto = await prisma.veto.findFirstOrThrow({ where: { factId } });
		expect(veto.status).toBe('FAILED');
		const submitter = await prisma.user.findUniqueOrThrow({ where: { id: vetoer.id } });
		expect(submitter.reputation).toBe(-5);
		expect(await prisma.reputationEvent.count({ where: { subjectId: veto.id } })).toBe(1);
	});
});

describe('veto hardening', () => {
	it('rejects vetoes on soft-deleted facts', async () => {
		const factId = await makeDecidedFact('VERIFIED');
		await prisma.fact.update({ where: { id: factId }, data: { deletedAt: new Date() } });
		const user = await makeUser();
		const result = await submitVeto(deps, vetoInput(user, factId, 'https://example.org/gone'));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('not found');
		expect((await prisma.fact.findUniqueOrThrow({ where: { id: factId } })).status).toBe(
			'VERIFIED'
		);
	});

	it('rejected vetoes do not consume the daily limit', async () => {
		const user = await makeUser();
		const factId = await makeDecidedFact('VERIFIED');
		const existingUrl = (await prisma.source.findFirstOrThrow({ where: { factId } })).url;

		// 3 invalid attempts (duplicate source) - daily limit is 3
		for (let i = 0; i < 3; i++) {
			expect((await submitVeto(deps, vetoInput(user, factId, existingUrl))).ok).toBe(false);
		}
		// a valid veto still goes through
		const valid = await submitVeto(deps, vetoInput(user, factId, 'https://example.org/fresh'));
		expect(valid.ok).toBe(true);
	});

	it('the database allows at most one OPEN veto per fact', async () => {
		const factId = await makeDecidedFact('VERIFIED');
		const a = await makeUser();
		const b = await makeUser();
		await prisma.veto.create({
			data: { factId, submitterId: a.id, reason: 'first objection', previousStatus: 'VERIFIED' }
		});
		await expect(
			prisma.veto.create({
				data: { factId, submitterId: b.id, reason: 'second objection', previousStatus: 'VERIFIED' }
			})
		).rejects.toMatchObject({ code: 'P2002' });
		// a resolved veto does not block a new open one
		await prisma.veto.updateMany({ where: { factId }, data: { status: 'FAILED' } });
		await expect(
			prisma.veto.create({
				data: { factId, submitterId: b.id, reason: 'second objection', previousStatus: 'VERIFIED' }
			})
		).resolves.toBeTruthy();
	});
});
