import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { setupTestDb, truncateAll } from '../helpers/test-db';
import { createTestRedis } from '../helpers/test-redis';
import { tokenFromMail } from '../helpers/mail-token';
import { seedConfig } from '../../prisma/seed';
import { register, verifyEmail } from '../../src/lib/server/services/auth/registration';
import { login } from '../../src/lib/server/services/auth/login';
import { createSession, validateSession } from '../../src/lib/server/services/auth/session';
import {
	getPublicProfile,
	requestEmailChange,
	softDeleteAccount,
	updateProfile,
	updateSettings
} from '../../src/lib/server/services/users/profile';

let prisma: PrismaClient;
let redis: Redis;
let deps: { prisma: PrismaClient; redis: Redis };

const ORIGIN = 'http://localhost:4173';
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
});

afterAll(async () => {
	await prisma.$disconnect();
	await redis.quit();
});

async function makeUser(username = 'alice', email = 'alice@example.com'): Promise<string> {
	const result = await register(deps, { username, email, password: STRONG, origin: ORIGIN });
	if (!result.ok) throw new Error('register failed');
	return result.userId;
}

describe('profile editing (R7)', () => {
	it('saves bio and avatar, clears them when emptied', async () => {
		const userId = await makeUser();
		const saved = await updateProfile(deps, {
			userId,
			bio: 'I verify facts.',
			avatarUrl: 'https://example.com/me.png'
		});
		expect(saved.ok).toBe(true);
		let user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
		expect(user.bio).toBe('I verify facts.');
		expect(user.avatarUrl).toBe('https://example.com/me.png');

		await updateProfile(deps, { userId, bio: '', avatarUrl: '' });
		user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
		expect(user.bio).toBeNull();
		expect(user.avatarUrl).toBeNull();
	});

	it('rejects over-long bios and invalid avatar urls', async () => {
		const userId = await makeUser();
		const longBio = await updateProfile(deps, {
			userId,
			bio: 'x'.repeat(501),
			avatarUrl: ''
		});
		expect(longBio.ok).toBe(false);

		const badUrl = await updateProfile(deps, {
			userId,
			bio: '',
			avatarUrl: 'javascript:alert(1)'
		});
		expect(badUrl.ok).toBe(false);
	});

	it('persists settings toggles', async () => {
		const userId = await makeUser();
		await updateSettings(deps, { userId, hideStats: true, notifyEmail: false });
		const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
		expect(user.hideStats).toBe(true);
		expect(user.notifyEmail).toBe(false);
	});
});

describe('email change (R7)', () => {
	it('requires confirmation from the new address before switching', async () => {
		const userId = await makeUser();
		const result = await requestEmailChange(deps, {
			userId,
			newEmail: 'new@example.com',
			currentPassword: STRONG,
			origin: ORIGIN
		});
		expect(result.ok).toBe(true);

		let user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
		expect(user.email).toBe('alice@example.com');
		expect(user.pendingEmail).toBe('new@example.com');

		const token = await tokenFromMail(redis, 'new@example.com', '/verify-email/');
		const verified = await verifyEmail(deps, token);
		expect(verified?.email).toBe('new@example.com');

		user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
		expect(user.email).toBe('new@example.com');
		expect(user.pendingEmail).toBeNull();

		// login works with the new address
		const relog = await login(deps, {
			identifier: 'new@example.com',
			password: STRONG,
			ip: '10.1.0.1',
			rememberMe: false
		});
		expect(relog.ok).toBe(true);
	});

	it('rejects taken and disposable addresses and a wrong password', async () => {
		const userId = await makeUser();
		await makeUser('bob', 'bob@example.com');
		expect(
			(
				await requestEmailChange(deps, {
					userId,
					newEmail: 'bob@example.com',
					currentPassword: STRONG,
					origin: ORIGIN
				})
			).ok
		).toBe(false);
		expect(
			(
				await requestEmailChange(deps, {
					userId,
					newEmail: 'x@mailinator.com',
					currentPassword: STRONG,
					origin: ORIGIN
				})
			).ok
		).toBe(false);
		// session alone is not enough - the current password is required
		const wrongPassword = await requestEmailChange(deps, {
			userId,
			newEmail: 'fresh@example.com',
			currentPassword: 'not my password',
			origin: ORIGIN
		});
		expect(wrongPassword.ok).toBe(false);
		const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
		expect(user.pendingEmail).toBeNull();
	});

	it('rate-limits email change requests per account', async () => {
		const userId = await makeUser();
		for (let i = 0; i < 3; i++) {
			const ok = await requestEmailChange(deps, {
				userId,
				newEmail: `change${i}@example.com`,
				currentPassword: STRONG,
				origin: ORIGIN
			});
			expect(ok.ok).toBe(true);
		}
		const fourth = await requestEmailChange(deps, {
			userId,
			newEmail: 'change4@example.com',
			currentPassword: STRONG,
			origin: ORIGIN
		});
		expect(fourth.ok).toBe(false);
		if (!fourth.ok) expect(fourth.error).toContain('Too many');
	});

	it('fails the confirmation when the address was taken in the meantime', async () => {
		const userId = await makeUser();
		await requestEmailChange(deps, {
			userId,
			newEmail: 'race@example.com',
			currentPassword: STRONG,
			origin: ORIGIN
		});
		const token = await tokenFromMail(redis, 'race@example.com', '/verify-email/');
		await makeUser('raceuser', 'race@example.com');
		expect(await verifyEmail(deps, token)).toBeNull();
		// the stale pending state and the dead token are cleaned up
		const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
		expect(user.pendingEmail).toBeNull();
		expect(
			await prisma.emailVerification.count({ where: { userId, newEmail: 'race@example.com' } })
		).toBe(0);
	});
});

describe('account deletion (R7)', () => {
	it('soft-deletes with password confirmation and blocks further access', async () => {
		const userId = await makeUser();
		const session = await createSession(deps, userId, false);

		const wrong = await softDeleteAccount(deps, { userId, password: 'nope nope nope' });
		expect(wrong.ok).toBe(false);

		const result = await softDeleteAccount(deps, { userId, password: STRONG });
		expect(result.ok).toBe(true);

		const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
		expect(user.deletedAt).not.toBeNull();
		expect(await validateSession(deps, session.token)).toBeNull();

		const relog = await login(deps, {
			identifier: 'alice',
			password: STRONG,
			ip: '10.1.0.2',
			rememberMe: false
		});
		expect(relog.ok).toBe(false);
		expect(await getPublicProfile(deps, 'alice')).toBeNull();
	});

	it('frees the email for a new registration after deletion', async () => {
		const userId = await makeUser('alice', 'alice@example.com');
		await softDeleteAccount(deps, { userId, password: STRONG });

		// the deleted record no longer holds the original address
		const deleted = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
		expect(deleted.email).not.toBe('alice@example.com');
		expect(deleted.pendingEmail).toBeNull();

		// the address can be reused (different username, since the old one stays reserved)
		const fresh = await register(deps, {
			username: 'alice2',
			email: 'alice@example.com',
			password: STRONG,
			origin: ORIGIN
		});
		expect(fresh.ok).toBe(true);
	});
});

describe('public profile (R7)', () => {
	it('shows stats, level and activity', async () => {
		const userId = await makeUser();
		await prisma.user.update({ where: { id: userId }, data: { reputation: 60 } });
		const category = await prisma.category.create({ data: { name: 'Science', slug: 'science' } });
		const fact = await prisma.fact.create({
			data: {
				title: 'A claim',
				body: 'Body',
				authorId: userId,
				categoryId: category.id,
				reviewDeadline: new Date(Date.now() + 14 * 86_400_000)
			}
		});
		await prisma.source.create({
			data: {
				factId: fact.id,
				side: 'PRO',
				url: 'https://example.org/src',
				title: 'A source',
				type: 'NEWS',
				credibility: 3,
				addedById: userId
			}
		});

		const profile = await getPublicProfile(deps, 'alice');
		expect(profile).not.toBeNull();
		expect(profile?.statsHidden).toBe(false);
		expect(profile?.reputation).toBe(60);
		expect(profile?.level).toBe(2); // thresholds 0,50,...
		expect(profile?.activity.map((a) => a.type).sort()).toEqual(['fact', 'source']);
	});

	it('gives every activity item a unique id even for same-fact, same-second events', async () => {
		// Regression: the profile page keys its activity {#each} by a per-item id.
		// Two sources added to the same fact within the same second previously
		// collided (the old key dropped sub-second precision), which crashed the
		// client-side render with `each_key_duplicate` so the page never loaded.
		const userId = await makeUser();
		const category = await prisma.category.create({
			data: { name: 'Science', slug: 'science' }
		});
		const fact = await prisma.fact.create({
			data: {
				title: 'A claim',
				body: 'Body',
				authorId: userId,
				categoryId: category.id,
				reviewDeadline: new Date(Date.now() + 14 * 86_400_000)
			}
		});
		const sameSecond = new Date('2026-06-12T21:14:13.000Z');
		for (let i = 0; i < 2; i++) {
			await prisma.source.create({
				data: {
					factId: fact.id,
					side: 'PRO',
					url: `https://example.org/src${i}`,
					title: `Source ${i}`,
					type: 'NEWS',
					credibility: 3,
					addedById: userId,
					// 3ms apart - identical once truncated to seconds
					createdAt: new Date(sameSecond.getTime() + i * 3)
				}
			});
		}

		const profile = await getPublicProfile(deps, 'alice');
		const ids = profile?.activity.map((a) => a.id) ?? [];
		expect(ids).toHaveLength(3); // 1 fact + 2 sources
		expect(new Set(ids).size).toBe(ids.length); // all unique
	});

	it('looks up the username case-insensitively', async () => {
		await makeUser('Alice', 'alice@example.com');
		expect((await getPublicProfile(deps, 'alice'))?.username).toBe('Alice');
		expect((await getPublicProfile(deps, 'ALICE'))?.username).toBe('Alice');
		expect((await getPublicProfile(deps, 'Alice'))?.username).toBe('Alice');
	});

	it('lists comments separately, excluding deleted comments and comments on deleted facts', async () => {
		const userId = await makeUser();
		const category = await prisma.category.create({
			data: { name: 'Science', slug: 'science' }
		});
		const deadline = new Date(Date.now() + 14 * 86_400_000);
		const liveFact = await prisma.fact.create({
			data: {
				title: 'Live',
				body: 'b',
				authorId: userId,
				categoryId: category.id,
				reviewDeadline: deadline
			}
		});
		const deadFact = await prisma.fact.create({
			data: {
				title: 'Dead',
				body: 'b',
				authorId: userId,
				categoryId: category.id,
				reviewDeadline: deadline,
				deletedAt: new Date()
			}
		});
		await prisma.comment.create({
			data: { factId: liveFact.id, authorId: userId, body: 'visible comment' }
		});
		await prisma.comment.create({
			data: {
				factId: liveFact.id,
				authorId: userId,
				body: 'deleted comment',
				deletedAt: new Date()
			}
		});
		await prisma.comment.create({
			data: { factId: deadFact.id, authorId: userId, body: 'comment on dead fact' }
		});

		const profile = await getPublicProfile(deps, 'alice');
		const bodies = profile?.comments.map((c) => c.body) ?? [];
		expect(bodies).toContain('visible comment');
		expect(bodies).not.toContain('deleted comment');
		expect(bodies).not.toContain('comment on dead fact');
		// comments stay out of the verification activity list
		expect(profile?.activity.some((a) => a.type === 'fact')).toBe(true);
	});

	it('respects hideStats', async () => {
		const userId = await makeUser();
		await updateSettings(deps, { userId, hideStats: true, notifyEmail: true });
		const profile = await getPublicProfile(deps, 'alice');
		expect(profile?.statsHidden).toBe(true);
		expect(profile?.reputation).toBeNull();
		expect(profile?.level).toBeNull();
		expect(profile?.activity).toEqual([]);
		expect(profile?.comments).toEqual([]);
		// identity stays visible
		expect(profile?.username).toBe('alice');
	});
});
