import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient, Role } from '@prisma/client';
import type { Redis } from 'ioredis';
import { setupTestDb, truncateAll } from '../helpers/test-db';
import { createTestRedis } from '../helpers/test-redis';
import { seedCategories, seedConfig } from '../../prisma/seed';
import {
	getVoteContext,
	getVoteWeight,
	isOnProbation,
	type VotingUser
} from '../../src/lib/server/services/vote-weight';
import { getConfigValue, setConfigValue } from '../../src/lib/server/services/config';

let prisma: PrismaClient;
let redis: Redis;
let deps: { prisma: PrismaClient; redis: Redis };
let scienceId: string;
let sportsId: string;
let physicsId: string;

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
});

afterAll(async () => {
	await prisma.$disconnect();
	await redis.quit();
});

let userCounter = 0;
async function makeUser(
	role: Role,
	reputation = 0,
	overrides: Partial<{ emailVerifiedAt: Date | null; bannedUntil: Date | null }> = {}
): Promise<VotingUser> {
	userCounter += 1;
	const user = await prisma.user.create({
		data: {
			username: `user${userCounter}`,
			email: `user${userCounter}@example.com`,
			passwordHash: 'x'.repeat(60),
			role,
			reputation,
			// established account (30d old) so probation never applies here
			createdAt: new Date(Date.now() - 30 * 86_400_000),
			emailVerifiedAt: 'emailVerifiedAt' in overrides ? overrides.emailVerifiedAt : new Date(),
			bannedUntil: overrides.bannedUntil ?? null
		}
	});
	return user;
}

async function makeExpert(reputation: number, categoryIds: string[]): Promise<VotingUser> {
	const user = await makeUser('EXPERT', reputation);
	for (const categoryId of categoryIds) {
		await prisma.expertCategory.create({ data: { userId: user.id, categoryId } });
	}
	return user;
}

describe('getVoteWeight (R9) - concept table', () => {
	it('anonymous, unverified, banned, deleted and organizations vote with 0', async () => {
		expect(await getVoteWeight(deps, null, scienceId)).toBe(0);

		const unverified = await makeUser('VERIFIED', 0, { emailVerifiedAt: null });
		expect(await getVoteWeight(deps, unverified, scienceId)).toBe(0);

		const banned = await makeUser('VERIFIED', 0, {
			bannedUntil: new Date(Date.now() + 86_400_000)
		});
		expect(await getVoteWeight(deps, banned, scienceId)).toBe(0);

		const expiredBan = await makeUser('VERIFIED', 0, {
			bannedUntil: new Date(Date.now() - 86_400_000)
		});
		expect(await getVoteWeight(deps, expiredBan, scienceId)).toBe(1);

		const org = await makeUser('ORGANIZATION');
		expect(await getVoteWeight(deps, org, scienceId)).toBe(0);

		const deleted = { ...(await makeUser('VERIFIED')), deletedAt: new Date() };
		expect(await getVoteWeight(deps, deleted, scienceId)).toBe(0);
	});

	it('verified 1.0, moderator 1.0, admin 1.0 at reputation 0', async () => {
		expect(await getVoteWeight(deps, await makeUser('VERIFIED'), scienceId)).toBe(1);
		expect(await getVoteWeight(deps, await makeUser('MODERATOR'), scienceId)).toBe(1);
		expect(await getVoteWeight(deps, await makeUser('ADMIN'), scienceId)).toBe(1);
	});

	it('experts get 3.0 only in their categories, 1.0 elsewhere', async () => {
		const expert = await makeExpert(0, [scienceId]);
		expect(await getVoteWeight(deps, expert, scienceId)).toBe(3);
		expect(await getVoteWeight(deps, expert, sportsId)).toBe(1);
		// expertise in the parent covers the child category
		expect(await getVoteWeight(deps, expert, physicsId)).toBe(3);
	});

	it('applies the reputation modifier clamp(1 + rep/200, 0.5, 1.5)', async () => {
		// max spread: expert with high rep = 4.5, low rep verified = 0.5
		const topExpert = await makeExpert(200, [scienceId]);
		expect(await getVoteWeight(deps, topExpert, scienceId)).toBe(4.5);

		const troll = await makeUser('VERIFIED', -500);
		expect(await getVoteWeight(deps, troll, scienceId)).toBe(0.5);

		const mid = await makeUser('VERIFIED', 50);
		expect(await getVoteWeight(deps, mid, scienceId)).toBe(1.25);

		const modWithRep = await makeUser('MODERATOR', 100);
		expect(await getVoteWeight(deps, modWithRep, scienceId)).toBe(1.5);
	});

	it('reads every number from config (changing config changes the result)', async () => {
		await setConfigValue(deps, 'weight.expert', '5');
		const expert = await makeExpert(0, [scienceId]);
		expect(await getVoteWeight(deps, expert, scienceId)).toBe(5);

		await setConfigValue(deps, 'rep.modifier.max', '2');
		const power = await makeUser('VERIFIED', 1000);
		expect(await getVoteWeight(deps, power, scienceId)).toBe(2);
	});
});

describe('isOnProbation (R24) - decision table', () => {
	const cfg = { minReputation: 10, minAccountAgeDays: 7, endMode: 'ANY' as const };

	it('ANY: ends as soon as reputation OR age passes its threshold', () => {
		expect(isOnProbation(0, 0, cfg)).toBe(true); // both below
		expect(isOnProbation(10, 0, cfg)).toBe(false); // reputation passed
		expect(isOnProbation(0, 7, cfg)).toBe(false); // age passed
		expect(isOnProbation(9, 6.9, cfg)).toBe(true); // both still below
	});

	it('ALL: stays on probation until both thresholds pass', () => {
		const all = { ...cfg, endMode: 'ALL' as const };
		expect(isOnProbation(0, 0, all)).toBe(true);
		expect(isOnProbation(10, 0, all)).toBe(true); // age still below
		expect(isOnProbation(0, 7, all)).toBe(true); // reputation still below
		expect(isOnProbation(10, 7, all)).toBe(false); // both passed
	});
});

describe('probation weight (R24)', () => {
	function freshUser(reputation: number): VotingUser {
		return {
			id: 'x',
			role: 'VERIFIED',
			reputation,
			emailVerifiedAt: new Date(),
			bannedUntil: null,
			deletedAt: null,
			createdAt: new Date() // brand-new account
		};
	}

	it('halves the weight of a fresh, low-reputation account and flags it', async () => {
		const ctx = await getVoteContext(deps, freshUser(0), scienceId);
		expect(ctx.onProbation).toBe(true);
		expect(ctx.weight).toBe(0.5); // base 1 x probation factor 0.5
	});

	it('an established account is not on probation (full weight)', async () => {
		const established: VotingUser = {
			...freshUser(0),
			createdAt: new Date(Date.now() - 30 * 86_400_000)
		};
		const ctx = await getVoteContext(deps, established, scienceId);
		expect(ctx.onProbation).toBe(false);
		expect(ctx.weight).toBe(1);
	});

	it('reputation alone (>=10) ends probation even for a brand-new account', async () => {
		const ctx = await getVoteContext(deps, freshUser(10), scienceId);
		expect(ctx.onProbation).toBe(false);
		expect(ctx.weight).toBeCloseTo(1 + 10 / 200); // modifier, no probation cut
	});
});

describe('config service cache (R9)', () => {
	it('caches reads and invalidates on set', async () => {
		expect(await getConfigValue(deps, 'weight.verified')).toBe('1');
		// behind the cache's back
		await prisma.config.update({ where: { key: 'weight.verified' }, data: { value: '9' } });
		expect(await getConfigValue(deps, 'weight.verified')).toBe('1'); // still cached

		await setConfigValue(deps, 'weight.verified', '2'); // invalidates
		expect(await getConfigValue(deps, 'weight.verified')).toBe('2');
	});

	it('throws on unknown keys', async () => {
		await expect(getConfigValue(deps, 'nope.unknown')).rejects.toThrow('Missing config key');
	});
});
