import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { setupTestDb, truncateAll } from '../helpers/test-db';
import { createTestRedis } from '../helpers/test-redis';
import { seedConfig } from '../../prisma/seed';
import {
	awardMany,
	awardReputation,
	getReputationHistory,
	recalculateReputation
} from '../../src/lib/server/services/reputation';

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
			username: `r${counter}`,
			email: `r${counter}@example.com`,
			passwordHash: 'x'.repeat(60),
			// established account (30d old) so probation never applies here
			createdAt: new Date(Date.now() - 30 * 86_400_000)
		}
	});
}

describe('reputation engine (R21)', () => {
	it('applies points and records an append-only event', async () => {
		const user = await makeUser();
		const applied = await awardReputation(deps, {
			userId: user.id,
			action: 'fact_verified',
			subjectId: 'fact-1'
		});
		expect(applied).toBe(10);

		const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
		expect(fresh.reputation).toBe(10);
		const events = await prisma.reputationEvent.findMany({ where: { userId: user.id } });
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({ action: 'fact_verified', subjectId: 'fact-1', points: 10 });
	});

	it('is idempotent per (user, action, subject)', async () => {
		const user = await makeUser();
		const first = await awardReputation(deps, {
			userId: user.id,
			action: 'veto_succeeded',
			subjectId: 'veto-1'
		});
		const second = await awardReputation(deps, {
			userId: user.id,
			action: 'veto_succeeded',
			subjectId: 'veto-1'
		});
		expect(first).toBe(5);
		expect(second).toBe(0); // duplicate, no-op

		const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
		expect(fresh.reputation).toBe(5);
		expect(await prisma.reputationEvent.count({ where: { userId: user.id } })).toBe(1);
	});

	it('distinguishes the same action on different subjects', async () => {
		const user = await makeUser();
		await awardReputation(deps, { userId: user.id, action: 'source_consensus', subjectId: 's1' });
		await awardReputation(deps, { userId: user.id, action: 'source_consensus', subjectId: 's2' });
		const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
		expect(fresh.reputation).toBe(4); // 2 + 2
	});

	it('handles negative actions (refuted, source removed)', async () => {
		const user = await makeUser();
		await awardMany(deps, [
			{ userId: user.id, action: 'fact_refuted', subjectId: 'f1' },
			{ userId: user.id, action: 'source_removed', subjectId: 's1' }
		]);
		const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
		expect(fresh.reputation).toBe(-2 - 3); // R24: fact_refuted -2, source_removed -3
	});

	it('awardMany dedupes within and across calls', async () => {
		const user = await makeUser();
		await awardMany(deps, [
			{ userId: user.id, action: 'vote_matched_consensus', subjectId: 's1' },
			{ userId: user.id, action: 'vote_matched_consensus', subjectId: 's1' }, // dup in-batch
			{ userId: user.id, action: 'vote_matched_consensus', subjectId: 's2' }
		]);
		await awardMany(deps, [
			{ userId: user.id, action: 'vote_matched_consensus', subjectId: 's1' } // dup cross-call
		]);
		const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
		expect(fresh.reputation).toBe(2); // s1 + s2, each +1
		expect(await prisma.reputationEvent.count({ where: { userId: user.id } })).toBe(2);
	});

	it('recalculation reproduces user.reputation from the ledger', async () => {
		const user = await makeUser();
		await awardMany(deps, [
			{ userId: user.id, action: 'fact_verified', subjectId: 'f1' },
			{ userId: user.id, action: 'veto_failed', subjectId: 'v1' },
			{ userId: user.id, action: 'source_consensus', subjectId: 's1' }
		]);
		// corrupt the cached value, then recompute
		await prisma.user.update({ where: { id: user.id }, data: { reputation: 9999 } });
		const recomputed = await recalculateReputation(deps, user.id);
		expect(recomputed).toBe(10 - 5 + 2);
		const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
		expect(fresh.reputation).toBe(10 - 5 + 2);

		const history = await getReputationHistory(deps, user.id);
		expect(history).toHaveLength(3);
	});
});
