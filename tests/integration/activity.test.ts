import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient, User } from '@prisma/client';
import type { Redis } from 'ioredis';
import { setupTestDb, truncateAll } from '../helpers/test-db';
import { createTestRedis } from '../helpers/test-redis';
import { seedCategories, seedConfig } from '../../prisma/seed';
import {
	activityForActor,
	activityForCategory,
	emitActivity,
	pruneActivity,
	recentActivity
} from '../../src/lib/server/services/activity';
import { submitFact } from '../../src/lib/server/services/facts/submit';
import { addSource } from '../../src/lib/server/services/facts/evidence';
import { addComment } from '../../src/lib/server/services/comments';
import { submitVeto, resolveVetoes } from '../../src/lib/server/services/facts/veto';
import { evaluateFact, runStatusTick } from '../../src/lib/server/services/facts/status-engine';
import { evaluateBadges } from '../../src/lib/server/services/badges';

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
async function makeUser(): Promise<User> {
	counter += 1;
	return prisma.user.create({
		data: {
			username: `a${counter}`,
			email: `a${counter}@example.com`,
			passwordHash: 'x'.repeat(60),
			// established + verified so service guards never block the emit paths
			createdAt: new Date(Date.now() - 30 * 86_400_000),
			emailVerifiedAt: new Date()
		}
	});
}

async function eventsOfType(type: string) {
	return prisma.activityEvent.findMany({ where: { type }, orderBy: { createdAt: 'asc' } });
}

// A decided fact with sources/votes that clear quorum (mirrors the
// status-engine fixtures), used as the precondition for veto flows.
async function makeDecidedFact(authorId: string, status: 'VERIFIED' | 'REFUTED' = 'VERIFIED') {
	return prisma.fact.create({
		data: {
			title: 'A decided fixture claim for activity',
			body: 'body',
			authorId,
			categoryId,
			status,
			decidedAt: new Date(),
			reviewStartedAt: new Date(Date.now() - 100 * 3_600_000),
			reviewDeadline: new Date(Date.now() + 86_400_000)
		}
	});
}

describe('activity spine - core (R25)', () => {
	it('emitActivity writes the row exactly as given', async () => {
		const actor = await makeUser();
		await emitActivity(deps, {
			type: 'fact_submitted',
			actorId: actor.id,
			subjectType: 'FACT',
			subjectId: 'fact-xyz',
			categoryId,
			payload: { foo: 'bar' }
		});
		const [row] = await prisma.activityEvent.findMany();
		expect(row.type).toBe('fact_submitted');
		expect(row.actorId).toBe(actor.id);
		expect(row.subjectType).toBe('FACT');
		expect(row.subjectId).toBe('fact-xyz');
		expect(row.categoryId).toBe(categoryId);
		expect(row.payload).toEqual({ foo: 'bar' });
	});

	it('system events carry a null actor and default empty payload', async () => {
		await emitActivity(deps, {
			type: 'fact_decided',
			subjectType: 'FACT',
			subjectId: 'fact-1'
		});
		const [row] = await prisma.activityEvent.findMany();
		expect(row.actorId).toBeNull();
		expect(row.categoryId).toBeNull();
		expect(row.payload).toEqual({});
	});

	it('emitting is best-effort: a bad row never throws', async () => {
		// actorId references a non-existent user -> FK violation, swallowed
		await expect(
			emitActivity(deps, {
				type: 'fact_submitted',
				actorId: 'nope-not-a-user',
				subjectType: 'FACT',
				subjectId: 'fact-1'
			})
		).resolves.toBeUndefined();
		expect(await prisma.activityEvent.count()).toBe(0);
	});

	it('pruning removes events older than retention and keeps the rest', async () => {
		// retention default is 180 days
		const old = await prisma.activityEvent.create({
			data: { type: 'comment_added', subjectType: 'COMMENT', subjectId: 'c1' }
		});
		const fresh = await prisma.activityEvent.create({
			data: { type: 'comment_added', subjectType: 'COMMENT', subjectId: 'c2' }
		});
		await prisma.activityEvent.update({
			where: { id: old.id },
			data: { createdAt: new Date(Date.now() - 181 * 86_400_000) }
		});

		const removed = await pruneActivity(deps);
		expect(removed).toBe(1);
		const remaining = await prisma.activityEvent.findMany();
		expect(remaining.map((e) => e.id)).toEqual([fresh.id]);
	});
});

describe('activity spine - emitting services (R25)', () => {
	it('submitFact emits fact_submitted', async () => {
		const author = await makeUser();
		const result = await submitFact(deps, {
			userId: author.id,
			title: 'The earth orbits the sun',
			body: 'A well-established heliocentric claim.',
			categoryId,
			source: {
				url: 'https://example.org/helio',
				title: 'Helio source',
				type: 'NEWS',
				quote: 'The source documents the heliocentric model in its opening section.'
			}
		});
		expect(result.ok).toBe(true);
		const [event] = await eventsOfType('fact_submitted');
		expect(event.actorId).toBe(author.id);
		expect(event.subjectType).toBe('FACT');
		expect(event.factId).toBe(result.ok && result.fact.id);
		expect(event.categoryId).toBe(categoryId);
	});

	it('addSource emits source_added with the side', async () => {
		const author = await makeUser();
		const contributor = await makeUser();
		const submitted = await submitFact(deps, {
			userId: author.id,
			title: 'Coffee improves focus measurably',
			body: 'Claim under review.',
			categoryId,
			source: {
				url: 'https://example.org/coffee',
				title: 'Coffee source',
				type: 'NEWS',
				quote: 'The study abstract reports improved focus after moderate coffee intake.'
			}
		});
		expect(submitted.ok).toBe(true);
		if (!submitted.ok) return;

		const added = await addSource(deps, {
			factId: submitted.fact.id,
			userId: contributor.id,
			side: 'CONTRA',
			url: 'https://example.org/coffee-contra',
			title: 'Counter source',
			type: 'NEWS',
			quote: 'Cited passage establishing the claim across the pooled study cohorts.'
		});
		expect(added.ok).toBe(true);

		const [event] = await eventsOfType('source_added');
		expect(event.actorId).toBe(contributor.id);
		expect(event.subjectType).toBe('SOURCE');
		expect(event.factId).toBe(submitted.fact.id);
		expect(event.categoryId).toBe(categoryId);
		expect(event.payload).toEqual({ side: 'CONTRA' });
	});

	it('addComment emits comment_added carrying parentId', async () => {
		const author = await makeUser();
		const commenter = await makeUser();
		const fact = await makeDecidedFact(author.id);

		const result = await addComment(deps, {
			factId: fact.id,
			parentId: null,
			user: commenter,
			body: 'A first comment on this fact.'
		});
		expect(result.ok).toBe(true);

		const [event] = await eventsOfType('comment_added');
		expect(event.actorId).toBe(commenter.id);
		expect(event.subjectType).toBe('COMMENT');
		expect(event.factId).toBe(fact.id);
		expect(event.payload).toEqual({ parentId: null });
	});

	it('evaluateFact emits fact_decided with the resulting status', async () => {
		const author = await makeUser();
		const adder = await makeUser();
		const voters = await Promise.all([makeUser(), makeUser(), makeUser(), makeUser(), makeUser()]);
		const fact = await prisma.fact.create({
			data: {
				title: 'A claim that will be verified',
				body: 'body',
				authorId: author.id,
				categoryId,
				reviewStartedAt: new Date(Date.now() - 100 * 3_600_000),
				reviewDeadline: new Date(Date.now() + 86_400_000),
				sources: {
					create: {
						side: 'PRO',
						url: 'https://example.org/strong-pro',
						title: 'Strong PRO',
						type: 'NEWS',
						credibility: 5,
						addedById: adder.id,
						votes: { create: voters.map((v) => ({ userId: v.id, value: 1, weight: 4 })) }
					}
				}
			}
		});

		const result = await evaluateFact(deps, fact.id);
		expect(result?.decided).toBe(true);
		expect(result?.newStatus).toBe('VERIFIED');

		const [event] = await eventsOfType('fact_decided');
		expect(event.actorId).toBeNull();
		expect(event.factId).toBe(fact.id);
		expect(event.categoryId).toBe(categoryId);
		expect(event.payload).toEqual({ status: 'VERIFIED' });
	});

	it('an expired review emits fact_status_changed', async () => {
		const author = await makeUser();
		const fact = await prisma.fact.create({
			data: {
				title: 'A claim nobody reviews in time',
				body: 'body',
				authorId: author.id,
				categoryId,
				reviewStartedAt: new Date(Date.now() - 400 * 3_600_000),
				reviewDeadline: new Date(Date.now() - 1000)
			}
		});

		const tick = await runStatusTick(deps);
		expect(tick.expired).toBe(1);

		const [event] = await eventsOfType('fact_status_changed');
		expect(event.factId).toBe(fact.id);
		expect(event.categoryId).toBe(categoryId);
		expect(event.payload).toMatchObject({ status: 'UNSUBSTANTIATED', restored: false });
	});

	it('a veto emits veto_opened, and its resolution emits veto_resolved', async () => {
		const author = await makeUser();
		const vetoer = await makeUser();
		const fact = await makeDecidedFact(author.id, 'VERIFIED');

		const veto = await submitVeto(deps, {
			factId: fact.id,
			user: vetoer,
			reason: 'This was decided too hastily and ignores key evidence.',
			source: {
				side: 'CONTRA',
				url: 'https://example.org/veto-source',
				title: 'New contradicting source',
				type: 'NEWS',
				quote: 'Cited passage establishing the claim across the pooled study cohorts.'
			}
		});
		expect(veto.ok).toBe(true);
		if (!veto.ok) return;

		const [opened] = await eventsOfType('veto_opened');
		expect(opened.actorId).toBe(vetoer.id);
		expect(opened.subjectType).toBe('VETO');
		expect(opened.subjectId).toBe(veto.veto.id);
		expect(opened.factId).toBe(fact.id);
		expect(opened.categoryId).toBe(categoryId);

		// re-decide to a different status -> the veto succeeds
		await resolveVetoes(deps, fact.id, 'REFUTED');
		const [resolved] = await eventsOfType('veto_resolved');
		expect(resolved.subjectId).toBe(veto.veto.id);
		expect(resolved.actorId).toBeNull();
		expect(resolved.payload).toMatchObject({ outcome: 'SUCCEEDED', newStatus: 'REFUTED' });
	});

	it('evaluateBadges emits badge_earned for a newly granted badge', async () => {
		const author = await makeUser();
		const reviewer = await makeUser();
		const fact = await prisma.fact.create({
			data: {
				title: 'A claim with one source to vote on',
				body: 'body',
				authorId: author.id,
				categoryId,
				reviewStartedAt: new Date(),
				reviewDeadline: new Date(Date.now() + 86_400_000),
				sources: {
					create: {
						side: 'PRO',
						url: 'https://example.org/badge-src',
						title: 'Source',
						type: 'NEWS',
						credibility: 3,
						addedById: author.id
					}
				}
			}
		});
		const source = await prisma.source.findFirstOrThrow({ where: { factId: fact.id } });
		// first source vote -> qualifies for the "First Verdict" badge
		await prisma.sourceVote.create({
			data: { sourceId: source.id, userId: reviewer.id, value: 1, weight: 1 }
		});

		const awarded = await evaluateBadges(deps, reviewer.id);
		expect(awarded).toContain('first_verdict');

		const [event] = await eventsOfType('badge_earned');
		expect(event.actorId).toBe(reviewer.id);
		expect(event.subjectType).toBe('BADGE');
		expect(event.subjectId).toBe('first_verdict');
		expect(event.payload).toEqual({ badge: 'first_verdict' });
	});
});

describe('activity spine - feed-shaped reads (R25)', () => {
	it('recentActivity returns newest first', async () => {
		const actor = await makeUser();
		for (let i = 0; i < 3; i++) {
			await emitActivity(deps, {
				type: 'comment_added',
				actorId: actor.id,
				subjectType: 'COMMENT',
				subjectId: `c${i}`,
				categoryId
			});
		}
		// spread the timestamps so ordering is deterministic
		const all = await prisma.activityEvent.findMany({ orderBy: { subjectId: 'asc' } });
		for (let i = 0; i < all.length; i++) {
			await prisma.activityEvent.update({
				where: { id: all[i].id },
				data: { createdAt: new Date(Date.now() - (all.length - i) * 1000) }
			});
		}

		const feed = await recentActivity(deps, 10);
		expect(feed.map((e) => e.subjectId)).toEqual(['c2', 'c1', 'c0']);
	});

	it('activityForCategory and activityForActor filter correctly', async () => {
		const actorA = await makeUser();
		const actorB = await makeUser();
		const otherCategory = await prisma.category.findUniqueOrThrow({ where: { slug: 'history' } });

		await emitActivity(deps, {
			type: 'fact_submitted',
			actorId: actorA.id,
			subjectType: 'FACT',
			subjectId: 'fa',
			categoryId
		});
		await emitActivity(deps, {
			type: 'fact_submitted',
			actorId: actorB.id,
			subjectType: 'FACT',
			subjectId: 'fb',
			categoryId: otherCategory.id
		});

		const science = await activityForCategory(deps, categoryId);
		expect(science.map((e) => e.subjectId)).toEqual(['fa']);

		const byA = await activityForActor(deps, actorA.id);
		expect(byA.map((e) => e.subjectId)).toEqual(['fa']);
		const byB = await activityForActor(deps, actorB.id);
		expect(byB.map((e) => e.subjectId)).toEqual(['fb']);
	});
});
