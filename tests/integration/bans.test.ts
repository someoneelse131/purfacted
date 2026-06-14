import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { setupTestDb, truncateAll } from '../helpers/test-db';
import { createTestRedis } from '../helpers/test-redis';
import { seedCategories, seedConfig } from '../../prisma/seed';
import { banUser, isPermanentBan, liftBan } from '../../src/lib/server/services/bans';
import { register } from '../../src/lib/server/services/auth/registration';
import { login } from '../../src/lib/server/services/auth/login';
import { submitFact } from '../../src/lib/server/services/facts/submit';
import { addComment } from '../../src/lib/server/services/comments';
import { getVoteWeight } from '../../src/lib/server/services/vote-weight';

let prisma: PrismaClient;
let redis: Redis;
let deps: { prisma: PrismaClient; redis: Redis };
let categoryId: string;

const STRONG = 'correct horse battery staple';

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
async function makeUser(role: 'VERIFIED' | 'MODERATOR' | 'ADMIN' = 'VERIFIED') {
	counter += 1;
	return prisma.user.create({
		data: {
			username: `b${counter}`,
			email: `b${counter}@example.com`,
			passwordHash: 'x'.repeat(60),
			role,
			emailVerifiedAt: new Date()
		}
	});
}

describe('progressive bans (R18)', () => {
	it('escalates 3 days -> 30 days -> permanent and logs each step', async () => {
		const target = await makeUser();
		const moderator = await makeUser('MODERATOR');

		const first = await banUser(deps, {
			userId: target.id,
			moderatorId: moderator.id,
			reason: 'spamming'
		});
		expect(first).toMatchObject({ ok: true, level: 1 });
		let user = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
		const threeDays = Date.now() + 3 * 86_400_000;
		expect(Math.abs(user.bannedUntil!.getTime() - threeDays)).toBeLessThan(60_000);

		const second = await banUser(deps, {
			userId: target.id,
			moderatorId: moderator.id,
			reason: 'again'
		});
		expect(second).toMatchObject({ ok: true, level: 2 });
		user = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
		const thirtyDays = Date.now() + 30 * 86_400_000;
		expect(Math.abs(user.bannedUntil!.getTime() - thirtyDays)).toBeLessThan(60_000);

		const third = await banUser(deps, {
			userId: target.id,
			moderatorId: moderator.id,
			reason: 'incorrigible'
		});
		expect(third).toMatchObject({ ok: true, level: 3 });
		user = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
		expect(isPermanentBan(user.bannedUntil)).toBe(true);

		const log = await prisma.moderationAction.findMany({ orderBy: { createdAt: 'asc' } });
		expect(log.map((l) => l.action)).toEqual(['ban_level_1', 'ban_level_2', 'ban_level_3']);
	});

	it('banned users are read-only but can still log in', async () => {
		await register(deps, {
			username: 'troll',
			email: 'troll@example.com',
			password: STRONG,
			origin: 'http://localhost'
		});
		const target = await prisma.user.findUniqueOrThrow({ where: { username: 'troll' } });
		await prisma.user.update({
			where: { id: target.id },
			data: { emailVerifiedAt: new Date() }
		});
		const moderator = await makeUser('MODERATOR');
		await banUser(deps, { userId: target.id, moderatorId: moderator.id, reason: 'trolling' });
		const banned = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });

		// login still works (read-only access with banner)
		const relog = await login(deps, {
			identifier: 'troll',
			password: STRONG,
			ip: '10.9.0.1',
			rememberMe: false
		});
		expect(relog.ok).toBe(true);

		// posting and voting are blocked
		const fact = await submitFact(deps, {
			userId: banned.id,
			title: 'Banned user tries to post here',
			body: 'body',
			categoryId,
			source: {
				url: 'https://example.org/x',
				title: 'src',
				type: 'NEWS',
				quote: 'A short justification of why this source supports the claim here.'
			}
		});
		expect(fact.ok).toBe(false);

		const comment = await addComment(deps, {
			factId: 'whatever',
			parentId: null,
			user: banned,
			body: 'hi'
		});
		expect(comment.ok).toBe(false);

		expect(await getVoteWeight(deps, banned, categoryId)).toBe(0);
	});

	it('permanent bans block re-registration by email and IP', async () => {
		await register(deps, {
			username: 'evader',
			email: 'evader@example.com',
			password: STRONG,
			origin: 'http://localhost'
		});
		// log in once so the IP is known
		await login(deps, {
			identifier: 'evader',
			password: STRONG,
			ip: '10.9.0.99',
			rememberMe: false
		});
		const target = await prisma.user.findUniqueOrThrow({ where: { username: 'evader' } });
		const moderator = await makeUser('MODERATOR');
		for (let i = 0; i < 3; i++) {
			await banUser(deps, { userId: target.id, moderatorId: moderator.id, reason: 'evading' });
		}

		// same email rejected (even though the account still owns it -> dup
		// check would also hit; use the blocklist path with a free address)
		const sameEmail = await register(deps, {
			username: 'evader2',
			email: 'evader@example.com',
			password: STRONG,
			origin: 'http://localhost',
			ip: '10.0.0.50'
		});
		expect(sameEmail.ok).toBe(false);

		// same IP with a fresh email rejected
		const sameIp = await register(deps, {
			username: 'evader3',
			email: 'fresh@example.com',
			password: STRONG,
			origin: 'http://localhost',
			ip: '10.9.0.99'
		});
		expect(sameIp.ok).toBe(false);

		// unrelated user from another IP is fine
		const clean = await register(deps, {
			username: 'cleanuser',
			email: 'clean@example.com',
			password: STRONG,
			origin: 'http://localhost',
			ip: '10.0.0.51'
		});
		expect(clean.ok).toBe(true);

		// permanent ban kills all sessions
		expect(await prisma.session.count({ where: { userId: target.id } })).toBe(0);
	});

	it('admins can lift bans (and unblock the email)', async () => {
		const target = await makeUser();
		const moderator = await makeUser('MODERATOR');
		const admin = await makeUser('ADMIN');
		for (let i = 0; i < 3; i++) {
			await banUser(deps, { userId: target.id, moderatorId: moderator.id, reason: 'spam' });
		}
		expect(await prisma.blockedIdentifier.count({ where: { kind: 'EMAIL' } })).toBe(1);

		const lifted = await liftBan(deps, { userId: target.id, adminId: admin.id });
		expect(lifted.ok).toBe(true);
		const user = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
		expect(user.bannedUntil).toBeNull();
		expect(await prisma.blockedIdentifier.count({ where: { kind: 'EMAIL' } })).toBe(0);

		// lift on a non-banned user fails
		expect((await liftBan(deps, { userId: target.id, adminId: admin.id })).ok).toBe(false);
	});

	it('admins cannot be banned', async () => {
		const admin = await makeUser('ADMIN');
		const moderator = await makeUser('MODERATOR');
		const result = await banUser(deps, {
			userId: admin.id,
			moderatorId: moderator.id,
			reason: 'nope'
		});
		expect(result.ok).toBe(false);
	});
});
