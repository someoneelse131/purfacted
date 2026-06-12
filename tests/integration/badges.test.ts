import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { setupTestDb, truncateAll } from '../helpers/test-db';
import { createTestRedis } from '../helpers/test-redis';
import { seedCategories, seedConfig } from '../../prisma/seed';
import { evaluateBadges, listBadges } from '../../src/lib/server/services/badges';
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
async function makeUser() {
	counter += 1;
	return prisma.user.create({
		data: {
			username: `bd${counter}`,
			email: `bd${counter}@example.com`,
			passwordHash: 'x'.repeat(60),
			emailVerifiedAt: new Date()
		}
	});
}

async function makeFactWithSource(authorId: string) {
	counter += 1;
	const fact = await prisma.fact.create({
		data: {
			title: `Badge fact ${counter}`,
			body: 'body',
			authorId,
			categoryId,
			reviewDeadline: new Date(Date.now() + 86_400_000)
		}
	});
	const source = await prisma.source.create({
		data: {
			factId: fact.id,
			side: 'PRO',
			url: `https://example.org/badge-${counter}`,
			title: 'src',
			type: 'NEWS',
			credibility: 3,
			addedById: authorId
		}
	});
	return { fact, source };
}

describe('badge engine (R22)', () => {
	it('awards First Verdict on the first source vote', async () => {
		const author = await makeUser();
		const voter = await makeUser();
		const { source } = await makeFactWithSource(author.id);

		expect(await evaluateBadges(deps, voter.id)).not.toContain('first_verdict');
		await prisma.sourceVote.create({
			data: { sourceId: source.id, userId: voter.id, value: 1, weight: 1 }
		});
		const awarded = await evaluateBadges(deps, voter.id);
		expect(awarded).toContain('first_verdict');

		const badges = await listBadges(deps, voter.id);
		expect(badges.map((b) => b.key)).toContain('first_verdict');
	});

	it('grants each badge exactly once', async () => {
		const author = await makeUser();
		const voter = await makeUser();
		const { source } = await makeFactWithSource(author.id);
		await prisma.sourceVote.create({
			data: { sourceId: source.id, userId: voter.id, value: 1, weight: 1 }
		});
		expect(await evaluateBadges(deps, voter.id)).toContain('first_verdict');
		// second evaluation does not re-award
		expect(await evaluateBadges(deps, voter.id)).not.toContain('first_verdict');
		expect(
			await prisma.userBadge.count({ where: { userId: voter.id, badge: 'first_verdict' } })
		).toBe(1);
	});

	it('awards Source Hunter at the configured consensus count', async () => {
		await setConfigValue(deps, 'badge.source_hunter_count', '3');
		const user = await makeUser();
		// 2 consensus events -> not yet
		for (let i = 0; i < 2; i++) {
			await prisma.reputationEvent.create({
				data: { userId: user.id, action: 'source_consensus', subjectId: `s${i}`, points: 2 }
			});
		}
		expect(await evaluateBadges(deps, user.id)).not.toContain('source_hunter');
		// 3rd consensus event -> earned
		await prisma.reputationEvent.create({
			data: { userId: user.id, action: 'source_consensus', subjectId: 's2', points: 2 }
		});
		expect(await evaluateBadges(deps, user.id)).toContain('source_hunter');
	});

	it('awards Veto Verified on a successful veto event', async () => {
		const user = await makeUser();
		await prisma.reputationEvent.create({
			data: { userId: user.id, action: 'veto_succeeded', subjectId: 'v1', points: 5 }
		});
		expect(await evaluateBadges(deps, user.id)).toContain('veto_verified');
	});

	it('awards Streak after the configured consecutive review days', async () => {
		await setConfigValue(deps, 'badge.streak_days', '3');
		const author = await makeUser();
		const user = await makeUser();
		const { source } = await makeFactWithSource(author.id);
		// votes on three consecutive days
		const base = Date.parse('2026-06-01T12:00:00Z');
		for (let d = 0; d < 3; d++) {
			await prisma.sourceVote.create({
				data: {
					sourceId: source.id,
					userId: user.id,
					value: 1,
					weight: 1,
					createdAt: new Date(base + d * 86_400_000)
				}
			});
			// upsert semantics not used here; one vote per source per user, so
			// delete before next day to simulate distinct-day activity
			if (d < 2) await prisma.sourceVote.deleteMany({ where: { userId: user.id } });
		}
		// recreate the full 3-day history via sources instead (sources have no
		// uniqueness per user) to keep three distinct days
		await prisma.sourceVote.deleteMany({ where: { userId: user.id } });
		for (let d = 0; d < 3; d++) {
			await prisma.source.create({
				data: {
					factId: source.factId,
					side: 'CONTRA',
					url: `https://example.org/streak-${user.id}-${d}`,
					title: 'streak src',
					type: 'NEWS',
					credibility: 3,
					addedById: user.id,
					createdAt: new Date(base + d * 86_400_000)
				}
			});
		}
		expect(await evaluateBadges(deps, user.id)).toContain('streak');
	});
});
