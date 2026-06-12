import { randomBytes } from 'node:crypto';
import type { AuthDeps } from './session';
import { hashToken, invalidateAllSessions } from './session';
import { getConfigNumber } from '../config';
import { hashPassword, verifyPassword } from '../password';
import { checkPassword } from '../password-policy';
import { hitRateLimit } from '../rate-limit';
import { enqueueEmail } from '../email/queue';
import { renderPasswordResetEmail } from '../email/templates';

// Always resolves "ok" towards the caller (no account enumeration); the mail
// is only sent when the account exists and the rate limit allows it.
export async function requestPasswordReset(
	deps: AuthDeps,
	input: { email: string; origin: string }
): Promise<{ ok: true }> {
	const email = input.email.trim().toLowerCase();
	const user = await deps.prisma.user.findUnique({ where: { email } });
	if (!user || user.deletedAt) return { ok: true };

	const maxPerHour = await getConfigNumber(deps, 'auth.reset_max_requests_per_hour');
	const limit = await hitRateLimit(deps.redis, `reset:acct:${user.id}`, maxPerHour, 3600);
	if (!limit.allowed) return { ok: true };

	const hours = await getConfigNumber(deps, 'auth.reset_token_hours');
	// only the SHA-256 hash is stored - a DB leak must not expose usable tokens
	const token = randomBytes(32).toString('base64url');
	await deps.prisma.passwordReset.create({
		data: {
			token: hashToken(token),
			userId: user.id,
			expiresAt: new Date(Date.now() + hours * 3_600_000)
		}
	});
	const rendered = renderPasswordResetEmail({
		username: user.username,
		resetUrl: `${input.origin}/reset-password/${token}`,
		expiryHours: hours
	});
	await enqueueEmail(deps.redis, { to: email, ...rendered });
	return { ok: true };
}

export type PasswordChangeResult = { ok: true; userId: string } | { ok: false; error: string };

export async function resetPassword(
	deps: AuthDeps,
	input: { token: string; newPassword: string }
): Promise<PasswordChangeResult> {
	const record = await deps.prisma.passwordReset.findUnique({
		where: { token: hashToken(input.token) },
		include: { user: true }
	});
	if (!record || record.expiresAt <= new Date() || record.user.deletedAt) {
		return { ok: false, error: 'This reset link is invalid or expired.' };
	}

	const policyError = await checkAgainstPolicy(deps, input.newPassword, record.user.username);
	if (policyError) return { ok: false, error: policyError };

	await deps.prisma.user.update({
		where: { id: record.userId },
		data: { passwordHash: await hashPassword(input.newPassword) }
	});
	await deps.prisma.passwordReset.deleteMany({ where: { userId: record.userId } });
	await invalidateAllSessions(deps, record.userId);
	return { ok: true, userId: record.userId };
}

export async function changePassword(
	deps: AuthDeps,
	input: { userId: string; currentPassword: string; newPassword: string }
): Promise<PasswordChangeResult> {
	const user = await deps.prisma.user.findUnique({ where: { id: input.userId } });
	if (!user) return { ok: false, error: 'User not found.' };

	if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
		return { ok: false, error: 'Current password is incorrect.' };
	}

	const policyError = await checkAgainstPolicy(deps, input.newPassword, user.username);
	if (policyError) return { ok: false, error: policyError };

	await deps.prisma.user.update({
		where: { id: user.id },
		data: { passwordHash: await hashPassword(input.newPassword) }
	});
	await invalidateAllSessions(deps, user.id);
	return { ok: true, userId: user.id };
}

async function checkAgainstPolicy(
	deps: AuthDeps,
	password: string,
	username: string
): Promise<string | null> {
	const [minLength, minScore] = await Promise.all([
		getConfigNumber(deps, 'auth.password_min_length'),
		getConfigNumber(deps, 'auth.password_min_score')
	]);
	const result = checkPassword(password, { minLength, minScore }, [username]);
	return result.ok ? null : (result.error ?? 'Password too weak.');
}
