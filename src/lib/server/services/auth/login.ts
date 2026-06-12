import type { AuthDeps, SafeUser } from './session';
import { createSession } from './session';
import { getConfigNumber } from '../config';
import { verifyPassword } from '../password';
import { clearRateLimit, hitRateLimit, isRateLimited } from '../rate-limit';

export type LoginResult =
	| { ok: true; user: SafeUser; token: string; expiresAt: Date }
	| { ok: false; error: string; retryAfterSeconds?: number };

const GENERIC_ERROR = 'Invalid credentials.';

// Constant-shape failure handling: count the failed attempt against every
// applicable window (identifier, IP, resolved user), then return a generic error.
async function recordFailure(
	deps: AuthDeps,
	keys: string[],
	max: number,
	windowSeconds: number
): Promise<LoginResult> {
	await Promise.all(keys.map((key) => hitRateLimit(deps.redis, key, max, windowSeconds)));
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
			OR: [
				{ email: identifier.toLowerCase() },
				{ username: { equals: identifier, mode: 'insensitive' } }
			],
			deletedAt: null
		}
	});
	if (!user) {
		return recordFailure(deps, [accountKey, ipKey], max, windowSeconds);
	}

	// Canonical per-account bucket: identifier spelling (case, email vs.
	// username) must not open a fresh window, so failures also count against
	// the resolved user id.
	const userKey = `login:user:${user.id}`;
	const userLimit = await isRateLimited(deps.redis, userKey, max);
	if (!userLimit.allowed) {
		return {
			ok: false,
			error: 'Too many failed attempts. Try again later.',
			retryAfterSeconds: userLimit.retryAfterSeconds
		};
	}

	const valid = await verifyPassword(input.password, user.passwordHash);
	if (!valid) {
		return recordFailure(deps, [accountKey, ipKey, userKey], max, windowSeconds);
	}

	// banned users may log in (read-only with banner, R18)
	await Promise.all([
		clearRateLimit(deps.redis, accountKey),
		clearRateLimit(deps.redis, userKey),
		deps.prisma.user.update({
			where: { id: user.id },
			data: { lastLoginAt: new Date(), lastLoginIp: input.ip }
		})
	]);
	const { token, expiresAt } = await createSession(deps, user.id, input.rememberMe);
	const safe: Partial<typeof user> = { ...user };
	delete safe.passwordHash;
	return { ok: true, user: safe as SafeUser, token, expiresAt };
}
