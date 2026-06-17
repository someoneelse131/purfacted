import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { AuthDeps, SafeUser } from './session';
import { hashToken } from './session';
import { getConfigNumber } from '../config';
import { hashPassword } from '../password';
import { checkPassword, passwordConfirmationError } from '../password-policy';
import { isDisposableEmail } from './disposable-domains';
import { isRegistrationBlocked } from '../bans';
import { enqueueEmail } from '../email/queue';
import { renderVerificationEmail } from '../email/templates';

export type RegistrationResult =
	| { ok: true; userId: string }
	| { ok: false; field: 'username' | 'email' | 'password'; error: string };

const usernameSchema = z
	.string()
	.min(3, 'Username must be at least 3 characters.')
	.max(30, 'Username must be at most 30 characters.')
	.regex(/^[a-zA-Z0-9_-]+$/, 'Only letters, digits, "_" and "-" are allowed.');

const emailSchema = z.string().email('Enter a valid email address.').max(254);

export async function register(
	deps: AuthDeps,
	input: {
		username: string;
		email: string;
		password: string;
		confirmPassword?: string;
		origin: string;
		ip?: string;
	}
): Promise<RegistrationResult> {
	const username = input.username.trim();
	const email = input.email.trim().toLowerCase();

	const usernameParsed = usernameSchema.safeParse(username);
	if (!usernameParsed.success) {
		return { ok: false, field: 'username', error: usernameParsed.error.issues[0].message };
	}
	const emailParsed = emailSchema.safeParse(email);
	if (!emailParsed.success) {
		return { ok: false, field: 'email', error: emailParsed.error.issues[0].message };
	}
	if (isDisposableEmail(email)) {
		return { ok: false, field: 'email', error: 'Disposable email addresses are not allowed.' };
	}
	// banned identifiers cannot re-register (R18)
	if (await isRegistrationBlocked(deps, { email, ip: input.ip ?? '' })) {
		return { ok: false, field: 'email', error: 'Registration is not possible.' };
	}

	if (input.confirmPassword !== undefined) {
		const mismatch = passwordConfirmationError(input.password, input.confirmPassword);
		if (mismatch) return { ok: false, field: 'password', error: mismatch };
	}

	const [minLength, minScore] = await Promise.all([
		getConfigNumber(deps, 'auth.password_min_length'),
		getConfigNumber(deps, 'auth.password_min_score')
	]);
	const policy = checkPassword(input.password, { minLength, minScore }, [username, email]);
	if (!policy.ok) {
		return { ok: false, field: 'password', error: policy.error ?? 'Password too weak.' };
	}

	// username uniqueness is case-insensitive: "Alice" must not be able to
	// impersonate an existing "alice"
	const existing = await deps.prisma.user.findFirst({
		where: { OR: [{ email }, { username: { equals: username, mode: 'insensitive' } }] },
		select: { email: true, username: true }
	});
	if (existing) {
		return existing.email === email
			? { ok: false, field: 'email', error: 'This email is already registered.' }
			: { ok: false, field: 'username', error: 'This username is taken.' };
	}

	const passwordHash = await hashPassword(input.password);
	const user = await deps.prisma.user.create({
		data: { email, username, passwordHash } // role VERIFIED, reputation 0 via defaults
	});

	await sendVerificationEmail(deps, user.id, username, email, input.origin);
	return { ok: true, userId: user.id };
}

export async function sendVerificationEmail(
	deps: AuthDeps,
	userId: string,
	username: string,
	email: string,
	origin: string
): Promise<void> {
	const hours = await getConfigNumber(deps, 'auth.verification_token_hours');
	// only the SHA-256 hash is stored - a DB leak must not expose usable tokens
	const token = randomBytes(32).toString('base64url');
	await deps.prisma.emailVerification.create({
		data: { token: hashToken(token), userId, expiresAt: new Date(Date.now() + hours * 3_600_000) }
	});
	const rendered = renderVerificationEmail({
		username,
		verifyUrl: `${origin}/verify-email/${token}`,
		expiryHours: hours
	});
	await enqueueEmail(deps.redis, { to: email, ...rendered });
}

export async function verifyEmail(deps: AuthDeps, token: string): Promise<SafeUser | null> {
	const record = await deps.prisma.emailVerification.findUnique({
		where: { token: hashToken(token) },
		include: { user: true }
	});
	if (!record || record.expiresAt <= new Date() || record.user.deletedAt) return null;

	let user;
	if (record.newEmail) {
		// email-change confirmation (R7): claim the new address
		const taken = await deps.prisma.user.findUnique({ where: { email: record.newEmail } });
		if (taken) {
			// the address was registered in the meantime - drop the stale
			// pending state so the account does not point at a dead change
			await deps.prisma.user.update({
				where: { id: record.userId },
				data: { pendingEmail: null }
			});
			await deps.prisma.emailVerification.delete({ where: { id: record.id } });
			return null;
		}
		user = await deps.prisma.user.update({
			where: { id: record.userId },
			data: { email: record.newEmail, pendingEmail: null, emailVerifiedAt: new Date() }
		});
	} else {
		user = await deps.prisma.user.update({
			where: { id: record.userId },
			data: { emailVerifiedAt: new Date() }
		});
	}
	await deps.prisma.emailVerification.deleteMany({ where: { userId: record.userId } });
	const safe: Partial<typeof user> = { ...user };
	delete safe.passwordHash;
	return safe as SafeUser;
}
