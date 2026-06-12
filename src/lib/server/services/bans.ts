import type { AuthDeps } from './auth/session';
import { getConfigNumber } from './config';
import { invalidateAllSessions } from './auth/session';

// Progressive ban system (R18): level 1 = 3 days, level 2 = 30 days,
// level 3 = permanent (email + last known IP blocked). Banned users stay
// read-only; durations come from config.

export type BanResult = { ok: true; level: number } | { ok: false; error: string };

export const PERMANENT_BAN = new Date('9999-12-31T00:00:00Z');

export async function banUser(
	deps: AuthDeps,
	input: { userId: string; moderatorId: string; reason: string }
): Promise<BanResult> {
	const reason = input.reason.trim();
	if (reason.length < 3) return { ok: false, error: 'Give a ban reason.' };

	const user = await deps.prisma.user.findUnique({ where: { id: input.userId } });
	if (!user || user.deletedAt) return { ok: false, error: 'User not found.' };
	if (user.role === 'ADMIN') return { ok: false, error: 'Admins cannot be banned.' };

	const newLevel = Math.min(3, user.banLevel + 1);
	let bannedUntil: Date;
	if (newLevel === 1) {
		const days = await getConfigNumber(deps, 'ban.level1_days');
		bannedUntil = new Date(Date.now() + days * 86_400_000);
	} else if (newLevel === 2) {
		const days = await getConfigNumber(deps, 'ban.level2_days');
		bannedUntil = new Date(Date.now() + days * 86_400_000);
	} else {
		bannedUntil = PERMANENT_BAN;
	}

	await deps.prisma.user.update({
		where: { id: user.id },
		data: { banLevel: newLevel, bannedUntil, banReason: reason }
	});

	if (newLevel === 3) {
		// permanent: block the email and the last known IP for registration
		const blocks: { kind: string; value: string }[] = [
			{ kind: 'EMAIL', value: user.email.toLowerCase() }
		];
		if (user.lastLoginIp) blocks.push({ kind: 'IP', value: user.lastLoginIp });
		for (const block of blocks) {
			await deps.prisma.blockedIdentifier.upsert({
				where: { kind_value: { kind: block.kind, value: block.value } },
				update: {},
				create: block
			});
		}
		await invalidateAllSessions(deps, user.id);
	}

	await deps.prisma.moderationAction.create({
		data: {
			moderatorId: input.moderatorId,
			action: `ban_level_${newLevel}`,
			targetType: 'USER',
			targetId: user.id,
			detail: reason
		}
	});
	return { ok: true, level: newLevel };
}

export async function liftBan(
	deps: AuthDeps,
	input: { userId: string; adminId: string }
): Promise<BanResult> {
	const user = await deps.prisma.user.findUnique({ where: { id: input.userId } });
	if (!user) return { ok: false, error: 'User not found.' };
	if (!user.bannedUntil || user.bannedUntil <= new Date()) {
		return { ok: false, error: 'User is not banned.' };
	}
	await deps.prisma.user.update({
		where: { id: user.id },
		data: { bannedUntil: null, banReason: null }
	});
	await deps.prisma.blockedIdentifier.deleteMany({
		where: { kind: 'EMAIL', value: user.email.toLowerCase() }
	});
	await deps.prisma.moderationAction.create({
		data: {
			moderatorId: input.adminId,
			action: 'lift_ban',
			targetType: 'USER',
			targetId: user.id
		}
	});
	return { ok: true, level: user.banLevel };
}

export async function isRegistrationBlocked(
	deps: AuthDeps,
	input: { email: string; ip: string }
): Promise<boolean> {
	const blocked = await deps.prisma.blockedIdentifier.count({
		where: {
			OR: [
				{ kind: 'EMAIL', value: input.email.toLowerCase() },
				{ kind: 'IP', value: input.ip }
			]
		}
	});
	return blocked > 0;
}

export function isBanned(user: { bannedUntil: Date | null }): boolean {
	return user.bannedUntil !== null && user.bannedUntil > new Date();
}

export function isPermanentBan(bannedUntil: Date | null): boolean {
	return bannedUntil !== null && bannedUntil.getTime() >= PERMANENT_BAN.getTime();
}
