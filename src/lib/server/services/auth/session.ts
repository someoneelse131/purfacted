import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient, User } from '@prisma/client';
import type { Redis } from 'ioredis';
import { getConfigNumber } from '../config';

// DB-backed sessions (Lucia-style): the client holds a random token, the DB
// stores only its SHA-256 hash as session id. Sliding expiry per config.

export interface AuthDeps {
	prisma: PrismaClient;
	redis: Redis;
}

export type SafeUser = Omit<User, 'passwordHash'>;

export interface SessionInfo {
	id: string;
	expiresAt: Date;
	rememberMe: boolean;
}

export const SESSION_COOKIE = 'session';

export function generateToken(): string {
	return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

function toSafeUser(user: User): SafeUser {
	const safe: Partial<User> = { ...user };
	delete safe.passwordHash;
	return safe as SafeUser;
}

async function sessionDays(deps: AuthDeps, rememberMe: boolean): Promise<number> {
	return getConfigNumber(deps, rememberMe ? 'auth.session_remember_days' : 'auth.session_days');
}

export async function createSession(
	deps: AuthDeps,
	userId: string,
	rememberMe: boolean
): Promise<{ token: string; expiresAt: Date }> {
	const token = generateToken();
	const days = await sessionDays(deps, rememberMe);
	const expiresAt = new Date(Date.now() + days * 86_400_000);
	await deps.prisma.session.create({
		data: { id: hashToken(token), userId, expiresAt, rememberMe }
	});
	return { token, expiresAt };
}

export async function validateSession(
	deps: AuthDeps,
	token: string
): Promise<{ user: SafeUser; session: SessionInfo } | null> {
	const id = hashToken(token);
	const session = await deps.prisma.session.findUnique({
		where: { id },
		include: { user: true }
	});
	if (!session) return null;
	if (session.expiresAt <= new Date()) {
		await deps.prisma.session.delete({ where: { id } }).catch(() => {});
		return null;
	}
	if (session.user.deletedAt) return null;

	// Sliding expiry: extend once less than half the window remains.
	const days = await sessionDays(deps, session.rememberMe);
	const windowMs = days * 86_400_000;
	let expiresAt = session.expiresAt;
	if (session.expiresAt.getTime() - Date.now() < windowMs / 2) {
		expiresAt = new Date(Date.now() + windowMs);
		await deps.prisma.session.update({ where: { id }, data: { expiresAt } });
	}

	return {
		user: toSafeUser(session.user),
		session: { id, expiresAt, rememberMe: session.rememberMe }
	};
}

export async function invalidateSession(deps: AuthDeps, token: string): Promise<void> {
	await deps.prisma.session.delete({ where: { id: hashToken(token) } }).catch(() => {});
}

export async function invalidateAllSessions(deps: AuthDeps, userId: string): Promise<void> {
	await deps.prisma.session.deleteMany({ where: { userId } });
}
