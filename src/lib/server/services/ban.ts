/**
 * R37-R38: Ban System and Account Flagging Service
 *
 * Progressive ban system with email/IP blocking.
 * Account flagging for negative veto users.
 */

import { db } from '../db';
import type { Ban, User, AccountFlag } from '@prisma/client';
import { createHash } from 'crypto';

// Configurable ban durations (in days)
const BAN_DURATION_LEVEL_1 = parseInt(process.env.BAN_DURATION_LEVEL_1 || '3', 10);
const BAN_DURATION_LEVEL_2 = parseInt(process.env.BAN_DURATION_LEVEL_2 || '30', 10);
// Level 3 is permanent

// Failed veto threshold for flagging
const FAILED_VETO_THRESHOLD = parseInt(process.env.FAILED_VETO_THRESHOLD || '5', 10);

export class BanError extends Error {
	code: string;
	constructor(message: string, code: string) {
		super(message);
		this.name = 'BanError';
		this.code = code;
	}
}

/**
 * Hash an IP address for privacy
 */
export function hashIp(ip: string): string {
	return createHash('sha256').update(ip).digest('hex');
}

/**
 * Get the current ban level for a user
 */
export async function getUserBanLevel(userId: string): Promise<number> {
	const user = await db.user.findUnique({
		where: { id: userId },
		select: { banLevel: true }
	});

	return user?.banLevel || 0;
}

/**
 * Check if a user is currently banned
 */
export async function isUserBanned(userId: string): Promise<{
	banned: boolean;
	level: number;
	expiresAt?: Date;
	reason?: string;
}> {
	const user = await db.user.findUnique({
		where: { id: userId },
		select: { banLevel: true, bannedUntil: true }
	});

	if (!user || user.banLevel === 0) {
		return { banned: false, level: 0 };
	}

	// Check if ban has expired
	if (user.bannedUntil && user.bannedUntil < new Date()) {
		// Ban expired, clear it
		await db.user.update({
			where: { id: userId },
			data: { bannedUntil: null }
		});
		return { banned: false, level: user.banLevel };
	}

	// Get latest ban reason
	const latestBan = await db.ban.findFirst({
		where: { userId },
		orderBy: { createdAt: 'desc' }
	});

	return {
		banned: true,
		level: user.banLevel,
		expiresAt: user.bannedUntil || undefined,
		reason: latestBan?.reason
	};
}

/**
 * Ban a user (progressive system)
 */
export async function banUser(
	userId: string,
	reason: string,
	bannedById?: string,
	ip?: string
): Promise<Ban> {
	const user = await db.user.findUnique({
		where: { id: userId }
	});

	if (!user) {
		throw new BanError('User not found', 'USER_NOT_FOUND');
	}

	// Calculate new ban level
	const newLevel = Math.min(user.banLevel + 1, 3);

	// Calculate expiration
	let expiresAt: Date | null = null;
	if (newLevel === 1) {
		expiresAt = new Date();
		expiresAt.setDate(expiresAt.getDate() + BAN_DURATION_LEVEL_1);
	} else if (newLevel === 2) {
		expiresAt = new Date();
		expiresAt.setDate(expiresAt.getDate() + BAN_DURATION_LEVEL_2);
	}
	// Level 3 is permanent (null expiresAt)

	// Create ban record
	const ban = await db.ban.create({
		data: {
			userId,
			level: newLevel,
			reason,
			bannedById,
			expiresAt
		}
	});

	// Update user ban level and expiration
	await db.user.update({
		where: { id: userId },
		data: {
			banLevel: newLevel,
			bannedUntil: expiresAt
		}
	});

	// For level 3, also block email and IP
	if (newLevel === 3) {
		await db.bannedEmail.upsert({
			where: { email: user.email },
			create: { email: user.email },
			update: {}
		});

		if (ip) {
			const ipHash = hashIp(ip);
			await db.bannedIp.upsert({
				where: { ipHash },
				create: { ipHash },
				update: {}
			});
		}
	}

	return ban;
}

/**
 * Unban a user
 */
export async function unbanUser(userId: string): Promise<User> {
	const user = await db.user.findUnique({
		where: { id: userId }
	});

	if (!user) {
		throw new BanError('User not found', 'USER_NOT_FOUND');
	}

	// Clear ban status (but keep ban level history)
	return db.user.update({
		where: { id: userId },
		data: {
			bannedUntil: null
		}
	});
}

/**
 * Check if an email is banned
 */
export async function isEmailBanned(email: string): Promise<boolean> {
	const banned = await db.bannedEmail.findUnique({
		where: { email }
	});

	return !!banned;
}

/**
 * Check if an IP is banned
 */
export async function isIpBanned(ip: string): Promise<boolean> {
	const ipHash = hashIp(ip);
	const banned = await db.bannedIp.findUnique({
		where: { ipHash }
	});

	return !!banned;
}

/**
 * Get user's ban history
 */
export async function getUserBanHistory(userId: string): Promise<Ban[]> {
	return db.ban.findMany({
		where: { userId },
		orderBy: { createdAt: 'desc' }
	});
}

/**
 * Get all currently banned users
 */
export async function getBannedUsers(): Promise<User[]> {
	return db.user.findMany({
		where: {
			OR: [
				{ banLevel: 3 },
				{ bannedUntil: { gte: new Date() } }
			]
		},
		orderBy: { bannedUntil: 'asc' }
	});
}

// ============================================
// Account Flagging (R38)
// ============================================

/**
 * Count failed vetos for a user
 */
export async function getFailedVetoCount(userId: string): Promise<number> {
	return db.veto.count({
		where: {
			userId,
			status: 'REJECTED'
		}
	});
}

/**
 * Check if user should be flagged for negative vetos
 */
export async function shouldFlagForNegativeVetos(userId: string): Promise<boolean> {
	const failedCount = await getFailedVetoCount(userId);
	return failedCount >= FAILED_VETO_THRESHOLD;
}

/**
 * Flag an account for review
 */
export async function flagAccount(
	userId: string,
	reason: string,
	details?: string
): Promise<AccountFlag> {
	const user = await db.user.findUnique({
		where: { id: userId }
	});

	if (!user) {
		throw new BanError('User not found', 'USER_NOT_FOUND');
	}

	// Check for existing pending flag
	const existingFlag = await db.accountFlag.findFirst({
		where: {
			userId,
			status: { in: ['PENDING', 'REVIEWING'] }
		}
	});

	if (existingFlag) {
		throw new BanError('Account already has a pending flag', 'ALREADY_FLAGGED');
	}

	return db.accountFlag.create({
		data: {
			userId,
			reason,
			details,
			status: 'PENDING'
		}
	});
}

/**
 * Check if user is flagged (blocked from actions during review)
 */
export async function isAccountFlagged(userId: string): Promise<{
	flagged: boolean;
	reason?: string;
	status?: string;
}> {
	const flag = await db.accountFlag.findFirst({
		where: {
			userId,
			status: { in: ['PENDING', 'REVIEWING'] }
		}
	});

	if (!flag) {
		return { flagged: false };
	}

	return {
		flagged: true,
		reason: flag.reason,
		status: flag.status
	};
}

/**
 * Review a flagged account
 */
export async function reviewFlaggedAccount(
	flagId: string,
	reviewerId: string,
	resolution: 'dismiss' | 'warn' | 'ban',
	comment?: string
): Promise<AccountFlag> {
	const flag = await db.accountFlag.findUnique({
		where: { id: flagId }
	});

	if (!flag) {
		throw new BanError('Flag not found', 'FLAG_NOT_FOUND');
	}

	if (flag.status === 'RESOLVED' || flag.status === 'DISMISSED') {
		throw new BanError('Flag already resolved', 'ALREADY_RESOLVED');
	}

	// Update flag status
	const updatedFlag = await db.accountFlag.update({
		where: { id: flagId },
		data: {
			status: resolution === 'dismiss' ? 'DISMISSED' : 'RESOLVED',
			reviewedById: reviewerId,
			resolution: comment || resolution,
			resolvedAt: new Date()
		}
	});

	// Take action if not dismissed
	if (resolution === 'ban') {
		await banUser(flag.userId, `Account flagged: ${flag.reason}`, reviewerId);
	}

	return updatedFlag;
}

/**
 * Get pending account flags
 */
export async function getPendingFlags(): Promise<(AccountFlag & { user: User })[]> {
	return db.accountFlag.findMany({
		where: { status: { in: ['PENDING', 'REVIEWING'] } },
		include: { user: true },
		orderBy: { createdAt: 'asc' }
	});
}

/**
 * Auto-flag users with too many failed vetos
 */
export async function autoFlagNegativeVetoUsers(): Promise<AccountFlag[]> {
	const flaggedAccounts: AccountFlag[] = [];

	// Find users with many failed vetos
	const userVetoCounts = await db.veto.groupBy({
		by: ['userId'],
		where: { status: 'REJECTED' },
		_count: { id: true }
	});

	for (const record of userVetoCounts) {
		if (record._count.id >= FAILED_VETO_THRESHOLD) {
			try {
				const flag = await flagAccount(
					record.userId,
					'NEGATIVE_VETO_THRESHOLD',
					`User has ${record._count.id} failed vetos`
				);
				flaggedAccounts.push(flag);
			} catch {
				// Already flagged or other error, skip
			}
		}
	}

	return flaggedAccounts;
}

/**
 * Get ban configuration
 */
export function getBanConfig(): {
	level1Duration: number;
	level2Duration: number;
	failedVetoThreshold: number;
} {
	return {
		level1Duration: BAN_DURATION_LEVEL_1,
		level2Duration: BAN_DURATION_LEVEL_2,
		failedVetoThreshold: FAILED_VETO_THRESHOLD
	};
}
