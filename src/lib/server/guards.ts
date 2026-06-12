import { error, redirect } from '@sveltejs/kit';
import type { SafeUser } from '$lib/server/services/auth/session';

export function requireUser(user: SafeUser | null): SafeUser {
	if (!user) redirect(302, '/login');
	return user;
}

// Voting/posting requires a verified email (R3) and no active ban (R18).
export function requireVerified(user: SafeUser | null): SafeUser {
	const u = requireUser(user);
	if (!u.emailVerifiedAt) error(403, 'Verify your email address first.');
	if (u.bannedUntil && new Date(u.bannedUntil) > new Date()) {
		error(403, 'Your account is banned and read-only.');
	}
	return u;
}

export function requireModerator(user: SafeUser | null): SafeUser {
	const u = requireUser(user);
	if (u.role !== 'MODERATOR' && u.role !== 'ADMIN') error(403, 'Moderator access required.');
	return u;
}

export function requireAdmin(user: SafeUser | null): SafeUser {
	const u = requireUser(user);
	if (u.role !== 'ADMIN') error(403, 'Admin access required.');
	return u;
}
