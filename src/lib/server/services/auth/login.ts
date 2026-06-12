import type { AuthDeps, SafeUser } from './session';
import { createSession } from './session';
import { getConfigNumber } from '../config';
import { verifyPassword } from '../password';
import { clearRateLimit, hitRateLimit, isRateLimited } from '../rate-limit';

export type LoginResult =
	| { ok: true; user: SafeUser; token: string; expiresAt: Date }
	| { ok: false; error: string; retryAfterSeconds?: number };

const GENERIC_ERROR = 'Invalid credentials.';

// Constant-shape failure handling: count the failed attempt against both
// account and IP windows, then return a generic error.
async function recordFailure(
	deps: AuthDeps,
	accountKey: string,
	ipKey: string,
	max: number,
	windowSeconds: number
): Promise<LoginResult> {
	await Promise.all([
		hitRateLimit(deps.redis, accountKey, max, windowSeconds),
		hitRateLimit(deps.redis, ipKey, max, windowSeconds)
	]);
	return { ok: false, error: GENERIC_ERROR };
}

export async function login(
	deps: AuthDeps,
	input: { identifier: string; password: string; ip: string; rememberMe: boolean }
): Promise<LoginResult> {
	const identifier = input.identifier.trim();
	const [max, windowMinutes] = await Promise.all([
		getConfigNumber(deps, 'auth.login_max_attempts'),
		getConfigNumber(deps, 'auth.login_window_minutes')
	]);
	const windowSeconds = windowMinutes * 60;
	const accountKey = `login:acct:${identifier.toLowerCase()}`;
	const ipKey = `login:ip:${input.ip}`;

	const [acctLimit, ipLimit] = await Promise.all([
		isRateLimited(deps.redis, accountKey, max),
		isRateLimited(deps.redis, ipKey, max)
	]);
	if (!acctLimit.allowed || !ipLimit.allowed) {
		const retryAfterSeconds = Math.max(acctLimit.retryAfterSeconds, ipLimit.retryAfterSeconds);
		return {
			ok: false,
			error: 'Too many failed attempts. Try again later.',
			retryAfterSeconds
		};
	}

	const user = await deps.prisma.user.findFirst({
		where: {
			OR: [{ email: identifier.toLowerCase() }, { username: identifier }],
			deletedAt: null
		}
	});
	if (!user) {
		return recordFailure(deps, accountKey, ipKey, max, windowSeconds);
	}

	const valid = await verifyPassword(input.password, user.passwordHash);
	if (!valid) {
		return recordFailure(deps, accountKey, ipKey, max, windowSeconds);
	}

	if (user.bannedUntil && user.bannedUntil > new Date()) {
		return { ok: false, error: 'This account is currently banned.' };
	}

	await Promise.all([
		clearRateLimit(deps.redis, accountKey),
		deps.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
	]);
	const { token, expiresAt } = await createSession(deps, user.id, input.rememberMe);
	const safe: Partial<typeof user> = { ...user };
	delete safe.passwordHash;
	return { ok: true, user: safe as SafeUser, token, expiresAt };
}
