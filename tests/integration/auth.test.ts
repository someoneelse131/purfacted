import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { setupTestDb, truncateAll } from '../helpers/test-db';
import { createTestRedis } from '../helpers/test-redis';
import { tokenFromMail } from '../helpers/mail-token';
import { seedConfig } from '../../prisma/seed';
import { register, verifyEmail } from '../../src/lib/server/services/auth/registration';
import { login } from '../../src/lib/server/services/auth/login';
import {
	createSession,
	hashToken,
	invalidateAllSessions,
	invalidateSession,
	validateSession
} from '../../src/lib/server/services/auth/session';
import {
	changePassword,
	requestPasswordReset,
	resetPassword
} from '../../src/lib/server/services/auth/password-reset';
import { queueDepth } from '../../src/lib/server/services/email/queue';

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

async function registerUser(username = 'alice', email = 'alice@example.com') {
	const result = await register(deps, { username, email, password: STRONG, origin: ORIGIN });
	expect(result.ok).toBe(true);
	return result.ok ? result.userId : '';
}

describe('registration (R3)', () => {
	it('creates an unverified user with reputation 0 and queues a verification email', async () => {
		const userId = await registerUser();
		const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
		expect(user.emailVerifiedAt).toBeNull();
		expect(user.reputation).toBe(0);
		expect(user.role).toBe('VERIFIED');
		expect((await queueDepth(redis)).ready).toBe(1);
		expect(await prisma.emailVerification.count({ where: { userId } })).toBe(1);
	});

	it('verifies the account via token and consumes it', async () => {
		const userId = await registerUser();
		const token = await tokenFromMail(redis, 'alice@example.com', '/verify-email/');
		const user = await verifyEmail(deps, token);
		expect(user?.emailVerifiedAt).not.toBeNull();
		expect(await prisma.emailVerification.count({ where: { userId } })).toBe(0);
		// second use fails
		expect(await verifyEmail(deps, token)).toBeNull();
	});

	it('stores only the token hash, never the raw token', async () => {
		const userId = await registerUser();
		const token = await tokenFromMail(redis, 'alice@example.com', '/verify-email/');
		const record = await prisma.emailVerification.findFirstOrThrow({ where: { userId } });
		expect(record.token).not.toBe(token);
		expect(record.token).toBe(hashToken(token));
		// the stored (hashed) value is not a usable token
		expect(await verifyEmail(deps, record.token)).toBeNull();
	});

	it('rejects expired verification tokens', async () => {
		const userId = await registerUser();
		await prisma.emailVerification.updateMany({
			where: { userId },
			data: { expiresAt: new Date(Date.now() - 1000) }
		});
		const token = await tokenFromMail(redis, 'alice@example.com', '/verify-email/');
		expect(await verifyEmail(deps, token)).toBeNull();
	});

	it('rejects verification for soft-deleted accounts', async () => {
		const userId = await registerUser();
		await prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });
		const token = await tokenFromMail(redis, 'alice@example.com', '/verify-email/');
		expect(await verifyEmail(deps, token)).toBeNull();
	});

	it('treats usernames as case-insensitively unique', async () => {
		await registerUser();
		const dup = await register(deps, {
			username: 'Alice',
			email: 'alice2@example.com',
			password: STRONG,
			origin: ORIGIN
		});
		expect(dup).toMatchObject({ ok: false, field: 'username' });
	});

	it('rejects duplicates, disposable emails, weak passwords and bad usernames', async () => {
		await registerUser();
		const dupEmail = await register(deps, {
			username: 'other',
			email: 'alice@example.com',
			password: STRONG,
			origin: ORIGIN
		});
		expect(dupEmail).toMatchObject({ ok: false, field: 'email' });

		const dupName = await register(deps, {
			username: 'alice',
			email: 'new@example.com',
			password: STRONG,
			origin: ORIGIN
		});
		expect(dupName).toMatchObject({ ok: false, field: 'username' });

		const disposable = await register(deps, {
			username: 'bot',
			email: 'bot@mailinator.com',
			password: STRONG,
			origin: ORIGIN
		});
		expect(disposable).toMatchObject({ ok: false, field: 'email' });

		const weak = await register(deps, {
			username: 'weakling',
			email: 'weak@example.com',
			password: 'password12345',
			origin: ORIGIN
		});
		expect(weak).toMatchObject({ ok: false, field: 'password' });

		const badName = await register(deps, {
			username: 'a b!',
			email: 'ab@example.com',
			password: STRONG,
			origin: ORIGIN
		});
		expect(badName).toMatchObject({ ok: false, field: 'username' });
	});
});

describe('login & sessions (R4)', () => {
	it('logs in with email or username and persists the session', async () => {
		await registerUser();
		const byEmail = await login(deps, {
			identifier: 'ALICE@example.com'.toLowerCase(),
			password: STRONG,
			ip: '10.0.0.1',
			rememberMe: false
		});
		expect(byEmail.ok).toBe(true);

		const byName = await login(deps, {
			identifier: 'alice',
			password: STRONG,
			ip: '10.0.0.1',
			rememberMe: false
		});
		expect(byName.ok).toBe(true);
		if (!byName.ok) return;

		// username resolution is case-insensitive
		const byUpperName = await login(deps, {
			identifier: 'ALICE',
			password: STRONG,
			ip: '10.0.0.1',
			rememberMe: false
		});
		expect(byUpperName.ok).toBe(true);

		const validated = await validateSession(deps, byName.token);
		expect(validated?.user.username).toBe('alice');
		expect(validated && 'passwordHash' in validated.user).toBe(false);

		const user = await prisma.user.findFirstOrThrow({ where: { username: 'alice' } });
		expect(user.lastLoginAt).not.toBeNull();
	});

	it('remember-me sessions get the longer expiry window', async () => {
		const userId = await registerUser();
		const short = await createSession(deps, userId, false);
		const long = await createSession(deps, userId, true);
		const diffDays = (long.expiresAt.getTime() - short.expiresAt.getTime()) / 86_400_000;
		expect(Math.round(diffDays)).toBe(23); // 30 - 7
	});

	it('slides the expiry when less than half the window remains', async () => {
		const userId = await registerUser();
		const { token } = await createSession(deps, userId, false);
		// Age the session so only 2 of 7 days remain
		const aged = new Date(Date.now() + 2 * 86_400_000);
		await prisma.session.updateMany({ where: { userId }, data: { expiresAt: aged } });
		const validated = await validateSession(deps, token);
		expect(validated).not.toBeNull();
		const refreshed = await prisma.session.findFirstOrThrow({ where: { userId } });
		expect(refreshed.expiresAt.getTime()).toBeGreaterThan(aged.getTime() + 4 * 86_400_000);
	});

	it('rejects expired sessions and deletes them', async () => {
		const userId = await registerUser();
		const { token } = await createSession(deps, userId, false);
		await prisma.session.updateMany({
			where: { userId },
			data: { expiresAt: new Date(Date.now() - 1000) }
		});
		expect(await validateSession(deps, token)).toBeNull();
		expect(await prisma.session.count({ where: { userId } })).toBe(0);
	});

	it('logout invalidates exactly the current session, logout-everywhere all', async () => {
		const userId = await registerUser();
		const a = await createSession(deps, userId, false);
		const b = await createSession(deps, userId, false);
		await invalidateSession(deps, a.token);
		expect(await validateSession(deps, a.token)).toBeNull();
		expect(await validateSession(deps, b.token)).not.toBeNull();
		await invalidateAllSessions(deps, userId);
		expect(await validateSession(deps, b.token)).toBeNull();
	});

	it('locks the account after 5 failed attempts within the window', async () => {
		await registerUser();
		for (let i = 0; i < 5; i++) {
			const attempt = await login(deps, {
				identifier: 'alice',
				password: 'wrong password!',
				ip: '10.0.0.2',
				rememberMe: false
			});
			expect(attempt.ok).toBe(false);
		}
		// correct password now also blocked
		const blocked = await login(deps, {
			identifier: 'alice',
			password: STRONG,
			ip: '10.0.0.2',
			rememberMe: false
		});
		expect(blocked.ok).toBe(false);
		if (!blocked.ok) {
			expect(blocked.error).toContain('Too many');
			expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
		}
	});

	it('counts failures against the account regardless of identifier spelling', async () => {
		await registerUser();
		// mix username and email so the per-identifier buckets stay below the
		// cap - only the canonical per-user bucket sees all five failures
		const identifiers = ['alice', 'alice@example.com', 'ALICE', 'Alice@Example.com', 'alice'];
		for (const [i, identifier] of identifiers.entries()) {
			const attempt = await login(deps, {
				identifier,
				password: 'wrong password!',
				ip: `10.0.5.${i}`,
				rememberMe: false
			});
			expect(attempt.ok).toBe(false);
		}
		const blocked = await login(deps, {
			identifier: 'alice@example.com',
			password: STRONG,
			ip: '10.0.5.99',
			rememberMe: false
		});
		expect(blocked.ok).toBe(false);
		if (!blocked.ok) expect(blocked.error).toContain('Too many');
	});

	it('also limits per IP across accounts', async () => {
		await registerUser();
		await registerUser('bob', 'bob@example.com');
		for (let i = 0; i < 5; i++) {
			await login(deps, {
				identifier: `ghost${i}`,
				password: 'whatever123!',
				ip: '10.0.0.3',
				rememberMe: false
			});
		}
		const blocked = await login(deps, {
			identifier: 'bob',
			password: STRONG,
			ip: '10.0.0.3',
			rememberMe: false
		});
		expect(blocked.ok).toBe(false);
		if (!blocked.ok) expect(blocked.error).toContain('Too many');
	});

	it('uses a generic error for unknown user and wrong password alike', async () => {
		await registerUser();
		const unknown = await login(deps, {
			identifier: 'nobody',
			password: STRONG,
			ip: '10.0.0.4',
			rememberMe: false
		});
		const wrongPw = await login(deps, {
			identifier: 'alice',
			password: 'wrong password!',
			ip: '10.0.0.4',
			rememberMe: false
		});
		expect(unknown.ok).toBe(false);
		expect(wrongPw.ok).toBe(false);
		if (!unknown.ok && !wrongPw.ok) expect(unknown.error).toBe(wrongPw.error);
	});
});

describe('password self-service (R5)', () => {
	it('runs the full reset flow and invalidates all sessions', async () => {
		const userId = await registerUser();
		const session = await createSession(deps, userId, false);
		await requestPasswordReset(deps, { email: 'alice@example.com', origin: ORIGIN });
		const token = await tokenFromMail(redis, 'alice@example.com', '/reset-password/');

		// stored hashed at rest
		const record = await prisma.passwordReset.findFirstOrThrow({ where: { userId } });
		expect(record.token).toBe(hashToken(token));

		const result = await resetPassword(deps, {
			token,
			newPassword: 'an entirely new passphrase'
		});
		expect(result.ok).toBe(true);
		expect(await validateSession(deps, session.token)).toBeNull();
		expect(await prisma.passwordReset.count({ where: { userId } })).toBe(0);

		const relog = await login(deps, {
			identifier: 'alice',
			password: 'an entirely new passphrase',
			ip: '10.0.1.1',
			rememberMe: false
		});
		expect(relog.ok).toBe(true);
	});

	it('does not reveal whether an email exists and limits requests to 3/h', async () => {
		const userId = await registerUser();
		const ghost = await requestPasswordReset(deps, {
			email: 'ghost@example.com',
			origin: ORIGIN
		});
		expect(ghost.ok).toBe(true);

		for (let i = 0; i < 5; i++) {
			await requestPasswordReset(deps, { email: 'alice@example.com', origin: ORIGIN });
		}
		expect(await prisma.passwordReset.count({ where: { userId } })).toBe(3);
		expect((await queueDepth(redis)).ready).toBe(1 + 3); // 1 verification + 3 resets
	});

	it('rejects expired reset tokens', async () => {
		const userId = await registerUser();
		await requestPasswordReset(deps, { email: 'alice@example.com', origin: ORIGIN });
		await prisma.passwordReset.updateMany({
			where: { userId },
			data: { expiresAt: new Date(Date.now() - 1000) }
		});
		const token = await tokenFromMail(redis, 'alice@example.com', '/reset-password/');
		const result = await resetPassword(deps, { token, newPassword: STRONG });
		expect(result.ok).toBe(false);
	});

	it('change password requires the current password and invalidates sessions', async () => {
		const userId = await registerUser();
		const session = await createSession(deps, userId, false);

		const wrong = await changePassword(deps, {
			userId,
			currentPassword: 'not my password',
			newPassword: 'an entirely new passphrase'
		});
		expect(wrong.ok).toBe(false);
		expect(await validateSession(deps, session.token)).not.toBeNull();

		const right = await changePassword(deps, {
			userId,
			currentPassword: STRONG,
			newPassword: 'an entirely new passphrase'
		});
		expect(right.ok).toBe(true);
		expect(await validateSession(deps, session.token)).toBeNull();
	});
});
