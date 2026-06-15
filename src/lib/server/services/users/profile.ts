import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { AuthDeps, SafeUser } from '../auth/session';
import { hashToken, invalidateAllSessions } from '../auth/session';
import { getConfigNumber, getConfigValue } from '../config';
import { verifyPassword } from '../password';
import { hitRateLimit } from '../rate-limit';
import { isDisposableEmail } from '../auth/disposable-domains';
import { enqueueEmail } from '../email/queue';
import { renderVerificationEmail } from '../email/templates';
import { listBadges } from '../badges';

export type ProfileResult = { ok: true } | { ok: false; error: string };

// Level n = highest threshold index the reputation reaches (1-based).
export function levelForReputation(thresholdsCsv: string, reputation: number): number {
	const thresholds = thresholdsCsv
		.split(',')
		.map((t) => Number(t.trim()))
		.filter((t) => !Number.isNaN(t));
	let level = 1;
	for (let i = 0; i < thresholds.length; i++) {
		if (reputation >= thresholds[i]) level = i + 1;
	}
	return level;
}

const avatarUrlSchema = z.string().url().startsWith('http').max(500);

export async function updateProfile(
	deps: AuthDeps,
	input: { userId: string; bio: string; avatarUrl: string }
): Promise<ProfileResult> {
	const bio = input.bio.trim();
	const avatarUrl = input.avatarUrl.trim();
	const maxBio = await getConfigNumber(deps, 'profile.bio_max_length');
	if (bio.length > maxBio) {
		return { ok: false, error: `Bio must be at most ${maxBio} characters.` };
	}
	if (avatarUrl !== '' && !avatarUrlSchema.safeParse(avatarUrl).success) {
		return { ok: false, error: 'Avatar must be a valid http(s) URL.' };
	}
	await deps.prisma.user.update({
		where: { id: input.userId },
		data: { bio: bio === '' ? null : bio, avatarUrl: avatarUrl === '' ? null : avatarUrl }
	});
	return { ok: true };
}

export async function updateSettings(
	deps: AuthDeps,
	input: { userId: string; hideStats: boolean; notifyEmail: boolean }
): Promise<ProfileResult> {
	await deps.prisma.user.update({
		where: { id: input.userId },
		data: { hideStats: input.hideStats, notifyEmail: input.notifyEmail }
	});
	return { ok: true };
}

export async function requestEmailChange(
	deps: AuthDeps,
	input: { userId: string; newEmail: string; currentPassword: string; origin: string }
): Promise<ProfileResult> {
	const newEmail = input.newEmail.trim().toLowerCase();
	if (!z.string().email().max(254).safeParse(newEmail).success) {
		return { ok: false, error: 'Enter a valid email address.' };
	}
	if (isDisposableEmail(newEmail)) {
		return { ok: false, error: 'Disposable email addresses are not allowed.' };
	}
	const user = await deps.prisma.user.findUniqueOrThrow({ where: { id: input.userId } });
	// session theft must not be enough to redirect the account's email
	if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
		return { ok: false, error: 'Password is incorrect.' };
	}
	// rate limit before the taken-check: it doubles as an enumeration probe
	const maxPerHour = await getConfigNumber(deps, 'auth.email_change_max_per_hour');
	const limit = await hitRateLimit(deps.redis, `email-change:${user.id}`, maxPerHour, 3600);
	if (!limit.allowed) {
		return { ok: false, error: 'Too many email change requests. Try again later.' };
	}
	const taken = await deps.prisma.user.findUnique({ where: { email: newEmail } });
	if (taken) {
		return { ok: false, error: 'This email is already registered.' };
	}

	const hours = await getConfigNumber(deps, 'auth.verification_token_hours');
	// only the SHA-256 hash is stored - a DB leak must not expose usable tokens
	const token = randomBytes(32).toString('base64url');
	await deps.prisma.user.update({ where: { id: user.id }, data: { pendingEmail: newEmail } });
	await deps.prisma.emailVerification.create({
		data: {
			token: hashToken(token),
			userId: user.id,
			newEmail,
			expiresAt: new Date(Date.now() + hours * 3_600_000)
		}
	});
	const rendered = renderVerificationEmail({
		username: user.username,
		verifyUrl: `${input.origin}/verify-email/${token}`,
		expiryHours: hours
	});
	await enqueueEmail(deps.redis, { to: newEmail, ...rendered });
	return { ok: true };
}

export async function softDeleteAccount(
	deps: AuthDeps,
	input: { userId: string; password: string }
): Promise<ProfileResult> {
	const user = await deps.prisma.user.findUniqueOrThrow({ where: { id: input.userId } });
	if (!(await verifyPassword(input.password, user.passwordHash))) {
		return { ok: false, error: 'Password is incorrect.' };
	}
	await deps.prisma.user.update({
		where: { id: user.id },
		data: { deletedAt: new Date() }
	});
	await invalidateAllSessions(deps, user.id);
	return { ok: true };
}

export interface PublicActivityItem {
	type: 'fact' | 'source' | 'veto';
	title: string;
	factId: string;
	createdAt: Date;
}

export interface ProfileBadge {
	key: string;
	name: string;
	description: string;
}

export interface PublicProfile {
	username: string;
	role: SafeUser['role'];
	bio: string | null;
	avatarUrl: string | null;
	joinedAt: Date;
	// null when the user hides stats
	reputation: number | null;
	level: number | null;
	followerCount: number;
	badges: ProfileBadge[];
	activity: PublicActivityItem[];
}

export async function getPublicProfile(
	deps: AuthDeps,
	username: string
): Promise<PublicProfile | null> {
	const user = await deps.prisma.user.findFirst({
		where: { username, deletedAt: null }
	});
	if (!user) return null;

	let activity: PublicActivityItem[] = [];
	if (!user.hideStats) {
		const [facts, sources, vetoes] = await Promise.all([
			deps.prisma.fact.findMany({
				where: { authorId: user.id, deletedAt: null },
				orderBy: { createdAt: 'desc' },
				take: 10,
				select: { id: true, title: true, createdAt: true }
			}),
			deps.prisma.source.findMany({
				where: { addedById: user.id, status: 'ACTIVE', fact: { deletedAt: null } },
				orderBy: { createdAt: 'desc' },
				take: 10,
				select: { factId: true, title: true, createdAt: true }
			}),
			deps.prisma.veto.findMany({
				where: { submitterId: user.id, fact: { deletedAt: null } },
				orderBy: { createdAt: 'desc' },
				take: 10,
				select: { factId: true, reason: true, createdAt: true }
			})
		]);
		activity = [
			...facts.map((f) => ({
				type: 'fact' as const,
				title: f.title,
				factId: f.id,
				createdAt: f.createdAt
			})),
			...sources.map((s) => ({
				type: 'source' as const,
				title: s.title,
				factId: s.factId,
				createdAt: s.createdAt
			})),
			...vetoes.map((v) => ({
				type: 'veto' as const,
				title: v.reason,
				factId: v.factId,
				createdAt: v.createdAt
			}))
		]
			.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
			.slice(0, 10);
	}

	const followerCount = await deps.prisma.follow.count({
		where: { targetType: 'USER', targetId: user.id }
	});
	const thresholds = await getConfigValue(deps, 'levels.thresholds');
	const badges = user.hideStats
		? []
		: (await listBadges(deps, user.id)).map((b) => ({
				key: b.key,
				name: b.name,
				description: b.description
			}));
	return {
		username: user.username,
		role: user.role,
		bio: user.bio,
		avatarUrl: user.avatarUrl,
		joinedAt: user.createdAt,
		reputation: user.hideStats ? null : user.reputation,
		level: user.hideStats ? null : levelForReputation(thresholds, user.reputation),
		followerCount,
		badges,
		activity
	};
}
