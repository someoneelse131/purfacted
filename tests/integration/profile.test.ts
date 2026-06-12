import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { setupTestDb, truncateAll } from '../helpers/test-db';
import { createTestRedis } from '../helpers/test-redis';
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
			origin: ORIGIN
		});
		expect(result.ok).toBe(true);

		let user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
		expect(user.email).toBe('alice@example.com');
		expect(user.pendingEmail).toBe('new@example.com');

		const record = await prisma.emailVerification.findFirstOrThrow({
			where: { userId, newEmail: 'new@example.com' }
		});
		const verified = await verifyEmail(deps, record.token);
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

	it('rejects taken and disposable addresses', async () => {
		const userId = await makeUser();
		await makeUser('bob', 'bob@example.com');
		expect(
			(await requestEmailChange(deps, { userId, newEmail: 'bob@example.com', origin: ORIGIN })).ok
		).toBe(false);
		expect(
			(await requestEmailChange(deps, { userId, newEmail: 'x@mailinator.com', origin: ORIGIN })).ok
		).toBe(false);
	});

	it('fails the confirmation when the address was taken in the meantime', async () => {
		const userId = await makeUser();
		await requestEmailChange(deps, { userId, newEmail: 'race@example.com', origin: ORIGIN });
		await makeUser('raceuser', 'race@example.com');
		const record = await prisma.emailVerification.findFirstOrThrow({
			where: { userId, newEmail: 'race@example.com' }
		});
		expect(await verifyEmail(deps, record.token)).toBeNull();
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
		expect(profile?.reputation).toBe(60);
		expect(profile?.level).toBe(2); // thresholds 0,50,...
		expect(profile?.activity.map((a) => a.type).sort()).toEqual(['fact', 'source']);
	});

	it('respects hideStats', async () => {
		const userId = await makeUser();
		await updateSettings(deps, { userId, hideStats: true, notifyEmail: true });
		const profile = await getPublicProfile(deps, 'alice');
		expect(profile?.reputation).toBeNull();
		expect(profile?.level).toBeNull();
		expect(profile?.activity).toEqual([]);
		// identity stays visible
		expect(profile?.username).toBe('alice');
	});
});
