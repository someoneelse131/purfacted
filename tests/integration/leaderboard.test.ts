import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { setupTestDb, truncateAll } from '../helpers/test-db';
import { createTestRedis } from '../helpers/test-redis';
import { seedConfig } from '../../prisma/seed';
import {
	computeLeaderboard,
	getLeaderboard,
	leaderboardCacheKey,
	refreshLeaderboards
} from '../../src/lib/server/services/leaderboard';

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

const DAY = 86_400_000;
let counter = 0;

async function makeUser(opts: { hideStats?: boolean } = {}) {
	counter += 1;
	return prisma.user.create({
		data: {
			username: `lb${counter}`,
			email: `lb${counter}@example.com`,
			passwordHash: 'x'.repeat(60),
			hideStats: opts.hideStats ?? false
		}
	});
}

// Insert a reputation event directly with a chosen age so the window logic can
// be exercised deterministically (awardReputation always stamps now()).
async function award(userId: string, points: number, subjectId: string, ageDays = 0) {
	await prisma.reputationEvent.create({
		data: {
			userId,
			action: 'fact_verified',
			subjectId,
			points,
			createdAt: new Date(Date.now() - ageDays * DAY)
		}
	});
}

async function makeCategory(slug: string) {
	return prisma.category.create({ data: { name: slug, slug } });
}

async function makeFact(authorId: string, categoryId: string, title: string) {
	return prisma.fact.create({
		data: {
			title,
			body: 'b',
			authorId,
			categoryId,
			reviewDeadline: new Date(Date.now() + 14 * DAY)
		}
	});
}

describe('leaderboard ranking windows (R28)', () => {
	it('ranks users by reputation gained in the window, descending', async () => {
		const a = await makeUser();
		const b = await makeUser();
		const c = await makeUser();
		await award(a.id, 30, 's-a1');
		await award(b.id, 50, 's-b1');
		await award(c.id, 10, 's-c1');

		const board = await computeLeaderboard(deps, { window: 'all' });
		expect(board.map((e) => e.username)).toEqual([b.username, a.username, c.username]);
		expect(board.map((e) => e.gained)).toEqual([50, 30, 10]);
		expect(board.map((e) => e.rank)).toEqual([1, 2, 3]);
	});

	it('the week window only counts events from the last 7 days', async () => {
		const a = await makeUser();
		const b = await makeUser();
		await award(a.id, 5, 's-a-fresh', 1); // inside the week
		await award(a.id, 100, 's-a-old', 20); // outside the week
		await award(b.id, 40, 's-b-fresh', 2); // inside the week

		const week = await computeLeaderboard(deps, { window: 'week' });
		expect(week.map((e) => e.username)).toEqual([b.username, a.username]);
		expect(week.map((e) => e.gained)).toEqual([40, 5]);

		const all = await computeLeaderboard(deps, { window: 'all' });
		expect(all.map((e) => e.username)).toEqual([a.username, b.username]);
		expect(all.map((e) => e.gained)).toEqual([105, 40]);
	});

	it('the month window counts the last 30 days', async () => {
		const a = await makeUser();
		await award(a.id, 7, 's-a-25', 25); // inside the month, outside the week
		const month = await computeLeaderboard(deps, { window: 'month' });
		expect(month).toHaveLength(1);
		expect(month[0].gained).toBe(7);
		const week = await computeLeaderboard(deps, { window: 'week' });
		expect(week).toHaveLength(0);
	});

	it('excludes users who hid their stats', async () => {
		const visible = await makeUser();
		const hidden = await makeUser({ hideStats: true });
		await award(visible.id, 10, 's-v');
		await award(hidden.id, 99, 's-h');

		const board = await computeLeaderboard(deps, { window: 'all' });
		expect(board.map((e) => e.username)).toEqual([visible.username]);
	});

	it('excludes users with no net gain in the window', async () => {
		const winner = await makeUser();
		const neutral = await makeUser();
		await award(winner.id, 10, 's-w');
		await award(neutral.id, 5, 's-n+');
		await award(neutral.id, -5, 's-n-');

		const board = await computeLeaderboard(deps, { window: 'all' });
		expect(board.map((e) => e.username)).toEqual([winner.username]);
	});

	it('honours the size limit', async () => {
		for (let i = 0; i < 4; i++) {
			const u = await makeUser();
			await award(u.id, (i + 1) * 10, `s-${i}`);
		}
		const board = await computeLeaderboard(deps, { window: 'all', limit: 2 });
		expect(board).toHaveLength(2);
		expect(board.map((e) => e.gained)).toEqual([40, 30]);
	});
});

describe('per-category leaderboards (R28)', () => {
	it('counts only reputation earned on facts in the category', async () => {
		const author = await makeUser();
		const catA = await makeCategory('cat-a');
		const catB = await makeCategory('cat-b');
		const factA = await makeFact(author.id, catA.id, 'fact in A');
		const factB = await makeFact(author.id, catB.id, 'fact in B');

		const expert = await makeUser();
		// fact_verified events are keyed by the fact id (subjectId)
		await award(expert.id, 10, factA.id);
		await award(expert.id, 3, factB.id);

		const boardA = await computeLeaderboard(deps, { window: 'all', categoryId: catA.id });
		expect(boardA).toHaveLength(1);
		expect(boardA[0].gained).toBe(10);

		const boardB = await computeLeaderboard(deps, { window: 'all', categoryId: catB.id });
		expect(boardB[0].gained).toBe(3);
	});
});

describe('leaderboard caching + refresh (R28)', () => {
	it('getLeaderboard caches the computed board', async () => {
		const a = await makeUser();
		await award(a.id, 10, 's-a');

		const key = leaderboardCacheKey('all');
		expect(await redis.get(key)).toBeNull();

		const first = await getLeaderboard(deps, { window: 'all' });
		expect(first[0].username).toBe(a.username);

		const cached = await redis.get(key);
		expect(cached).not.toBeNull();

		// a later award is invisible to a cache hit until the cache is refreshed
		const b = await makeUser();
		await award(b.id, 100, 's-b');
		const second = await getLeaderboard(deps, { window: 'all' });
		expect(second).toEqual(first);
	});

	it('refreshLeaderboards recomputes and overwrites the cache', async () => {
		const a = await makeUser();
		await award(a.id, 10, 's-a');
		await getLeaderboard(deps, { window: 'all' }); // warm the cache

		const b = await makeUser();
		await award(b.id, 100, 's-b');
		await refreshLeaderboards(deps);

		const board = await getLeaderboard(deps, { window: 'all' });
		expect(board.map((e) => e.username)).toEqual([b.username, a.username]);
	});
});
