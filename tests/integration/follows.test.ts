import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { setupTestDb, truncateAll } from '../helpers/test-db';
import { createTestRedis } from '../helpers/test-redis';
import { seedConfig } from '../../prisma/seed';
import {
	followTarget,
	getFollowedIds,
	getFollowerCount,
	isFollowing,
	listFollows,
	unfollowTarget
} from '../../src/lib/server/services/follows';

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

async function makeUser(opts: { deleted?: boolean } = {}) {
	counter += 1;
	return prisma.user.create({
		data: {
			username: `fl${counter}`,
			email: `fl${counter}@example.com`,
			passwordHash: 'x'.repeat(60),
			deletedAt: opts.deleted ? new Date() : null
		}
	});
}

async function makeCategory(slug: string, status: 'ACTIVE' | 'DISABLED' = 'ACTIVE') {
	return prisma.category.create({ data: { name: slug, slug, status } });
}

describe('follow system', () => {
	it('follows a user and reports it as followed', async () => {
		const follower = await makeUser();
		const target = await makeUser();

		const result = await followTarget(deps, {
			followerId: follower.id,
			targetType: 'USER',
			targetId: target.id
		});
		expect(result.ok).toBe(true);
		expect(await isFollowing(deps, follower.id, 'USER', target.id)).toBe(true);
		expect(await getFollowerCount(deps, 'USER', target.id)).toBe(1);
	});

	it('is idempotent: following twice keeps a single edge', async () => {
		const follower = await makeUser();
		const target = await makeUser();
		await followTarget(deps, { followerId: follower.id, targetType: 'USER', targetId: target.id });
		await followTarget(deps, { followerId: follower.id, targetType: 'USER', targetId: target.id });
		expect(await getFollowerCount(deps, 'USER', target.id)).toBe(1);
	});

	it('unfollows and is idempotent when not following', async () => {
		const follower = await makeUser();
		const target = await makeUser();
		await followTarget(deps, { followerId: follower.id, targetType: 'USER', targetId: target.id });
		await unfollowTarget(deps, {
			followerId: follower.id,
			targetType: 'USER',
			targetId: target.id
		});
		expect(await isFollowing(deps, follower.id, 'USER', target.id)).toBe(false);
		// second unfollow does not throw
		const again = await unfollowTarget(deps, {
			followerId: follower.id,
			targetType: 'USER',
			targetId: target.id
		});
		expect(again.ok).toBe(true);
	});

	it('refuses to follow yourself', async () => {
		const user = await makeUser();
		const result = await followTarget(deps, {
			followerId: user.id,
			targetType: 'USER',
			targetId: user.id
		});
		expect(result.ok).toBe(false);
		expect(await getFollowerCount(deps, 'USER', user.id)).toBe(0);
	});

	it('refuses to follow a deleted user or a disabled category', async () => {
		const follower = await makeUser();
		const deletedUser = await makeUser({ deleted: true });
		const disabled = await makeCategory('disabled-cat', 'DISABLED');

		expect(
			(
				await followTarget(deps, {
					followerId: follower.id,
					targetType: 'USER',
					targetId: deletedUser.id
				})
			).ok
		).toBe(false);
		expect(
			(
				await followTarget(deps, {
					followerId: follower.id,
					targetType: 'CATEGORY',
					targetId: disabled.id
				})
			).ok
		).toBe(false);
	});

	it('follows categories independently of users', async () => {
		const follower = await makeUser();
		const cat = await makeCategory('science-cat');
		await followTarget(deps, {
			followerId: follower.id,
			targetType: 'CATEGORY',
			targetId: cat.id
		});
		expect(await isFollowing(deps, follower.id, 'CATEGORY', cat.id)).toBe(true);
		expect(await getFollowerCount(deps, 'CATEGORY', cat.id)).toBe(1);
		// not counted as a user follow
		expect(await getFollowerCount(deps, 'USER', cat.id)).toBe(0);
	});

	it('lists followed users and categories, newest first, omitting removed targets', async () => {
		const follower = await makeUser();
		const u1 = await makeUser();
		const u2 = await makeUser();
		const goneUser = await makeUser();
		const c1 = await makeCategory('cat-1');

		await followTarget(deps, { followerId: follower.id, targetType: 'USER', targetId: u1.id });
		await followTarget(deps, { followerId: follower.id, targetType: 'USER', targetId: u2.id });
		await followTarget(deps, {
			followerId: follower.id,
			targetType: 'CATEGORY',
			targetId: c1.id
		});
		// follow then soft-delete the target: it must drop out of the list
		await followTarget(deps, {
			followerId: follower.id,
			targetType: 'USER',
			targetId: goneUser.id
		});
		await prisma.user.update({ where: { id: goneUser.id }, data: { deletedAt: new Date() } });

		const lists = await listFollows(deps, follower.id);
		expect(lists.users.map((u) => u.id)).toEqual([u2.id, u1.id]);
		expect(lists.categories.map((c) => c.id)).toEqual([c1.id]);
	});

	it('exposes raw followed ids for feed consumers', async () => {
		const follower = await makeUser();
		const u1 = await makeUser();
		const c1 = await makeCategory('feed-cat');
		await followTarget(deps, { followerId: follower.id, targetType: 'USER', targetId: u1.id });
		await followTarget(deps, {
			followerId: follower.id,
			targetType: 'CATEGORY',
			targetId: c1.id
		});
		const ids = await getFollowedIds(deps, follower.id);
		expect(ids.userIds).toEqual([u1.id]);
		expect(ids.categoryIds).toEqual([c1.id]);
	});

	it('cascades follows when the follower is deleted (hard FK)', async () => {
		const follower = await makeUser();
		const target = await makeUser();
		await followTarget(deps, { followerId: follower.id, targetType: 'USER', targetId: target.id });
		await prisma.user.delete({ where: { id: follower.id } });
		expect(await getFollowerCount(deps, 'USER', target.id)).toBe(0);
	});
});
