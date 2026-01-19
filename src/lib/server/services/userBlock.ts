import { db } from '../db';
import type { UserBlock } from '@prisma/client';

// ============================================
// Types
// ============================================

export interface BlockedUser {
	id: string;
	firstName: string;
	lastName: string;
	blockedAt: Date;
}

// ============================================
// Error Handling
// ============================================

export class UserBlockError extends Error {
	code: string;

	constructor(message: string, code: string) {
		super(message);
		this.name = 'UserBlockError';
		this.code = code;
	}
}

// ============================================
// User Blocking
// ============================================

/**
 * Block a user
 */
export async function blockUser(blockerId: string, blockedId: string): Promise<UserBlock> {
	if (blockerId === blockedId) {
		throw new UserBlockError('You cannot block yourself', 'SELF_BLOCK');
	}

	// Check if user exists
	const blockedUser = await db.user.findUnique({
		where: { id: blockedId }
	});

	if (!blockedUser) {
		throw new UserBlockError('User not found', 'USER_NOT_FOUND');
	}

	// Check if already blocked
	const existing = await db.userBlock.findUnique({
		where: {
			blockerId_blockedId: {
				blockerId,
				blockedId
			}
		}
	});

	if (existing) {
		throw new UserBlockError('User is already blocked', 'ALREADY_BLOCKED');
	}

	return db.userBlock.create({
		data: {
			blockerId,
			blockedId
		}
	});
}

/**
 * Unblock a user
 */
export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
	const block = await db.userBlock.findUnique({
		where: {
			blockerId_blockedId: {
				blockerId,
				blockedId
			}
		}
	});

	if (!block) {
		throw new UserBlockError('User is not blocked', 'NOT_BLOCKED');
	}

	await db.userBlock.delete({
		where: {
			blockerId_blockedId: {
				blockerId,
				blockedId
			}
		}
	});
}

/**
 * Check if a user is blocked by another user
 */
export async function isUserBlocked(blockerId: string, blockedId: string): Promise<boolean> {
	const block = await db.userBlock.findUnique({
		where: {
			blockerId_blockedId: {
				blockerId,
				blockedId
			}
		}
	});

	return block !== null;
}

/**
 * Check if either user has blocked the other
 */
export async function isInteractionBlocked(userId1: string, userId2: string): Promise<boolean> {
	const block = await db.userBlock.findFirst({
		where: {
			OR: [
				{ blockerId: userId1, blockedId: userId2 },
				{ blockerId: userId2, blockedId: userId1 }
			]
		}
	});

	return block !== null;
}

/**
 * Get list of users blocked by a user
 */
export async function getBlockedUsers(userId: string): Promise<BlockedUser[]> {
	const blocks = await db.userBlock.findMany({
		where: { blockerId: userId },
		include: {
			blocked: {
				select: {
					id: true,
					firstName: true,
					lastName: true
				}
			}
		},
		orderBy: { createdAt: 'desc' }
	});

	return blocks.map((b) => ({
		id: b.blocked.id,
		firstName: b.blocked.firstName,
		lastName: b.blocked.lastName,
		blockedAt: b.createdAt
	}));
}

/**
 * Get count of users who have blocked a user
 */
export async function getBlockedByCount(userId: string): Promise<number> {
	return db.userBlock.count({
		where: { blockedId: userId }
	});
}
