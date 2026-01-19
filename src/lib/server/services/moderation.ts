/**
 * R44-R46: Moderation Service
 *
 * Manages the moderation queue and moderator actions.
 */

import { db } from '../db';
import type {
	ModerationQueueItem,
	ModerationQueueType,
	ModerationStatus,
	User
} from '@prisma/client';

export class ModerationError extends Error {
	code: string;
	constructor(message: string, code: string) {
		super(message);
		this.name = 'ModerationError';
		this.code = code;
	}
}

export interface CreateQueueItemInput {
	type: ModerationQueueType;
	contentId: string;
	contentType: string;
	reason?: string;
	details?: Record<string, unknown>;
	priority?: number;
}

export interface QueueFilter {
	type?: ModerationQueueType;
	status?: ModerationStatus;
	assignedToId?: string;
	contentType?: string;
	minPriority?: number;
}

/**
 * Add item to moderation queue
 */
export async function addToQueue(input: CreateQueueItemInput): Promise<ModerationQueueItem> {
	// Check if already in queue
	const existing = await db.moderationQueueItem.findFirst({
		where: {
			contentId: input.contentId,
			contentType: input.contentType,
			status: { in: ['PENDING', 'IN_PROGRESS'] }
		}
	});

	if (existing) {
		// Update priority if higher
		if (input.priority && input.priority > existing.priority) {
			return db.moderationQueueItem.update({
				where: { id: existing.id },
				data: { priority: input.priority }
			});
		}
		return existing;
	}

	return db.moderationQueueItem.create({
		data: {
			type: input.type,
			contentId: input.contentId,
			contentType: input.contentType,
			reason: input.reason,
			details: input.details ?? null,
			priority: input.priority ?? 0
		}
	});
}

/**
 * Get queue items with optional filters
 */
export async function getQueueItems(
	filter: QueueFilter = {},
	options: { limit?: number; offset?: number } = {}
): Promise<ModerationQueueItem[]> {
	const { limit = 50, offset = 0 } = options;

	const where: Record<string, unknown> = {};

	if (filter.type) where.type = filter.type;
	if (filter.status) where.status = filter.status;
	if (filter.assignedToId) where.assignedToId = filter.assignedToId;
	if (filter.contentType) where.contentType = filter.contentType;
	if (filter.minPriority !== undefined) {
		where.priority = { gte: filter.minPriority };
	}

	return db.moderationQueueItem.findMany({
		where,
		include: {
			assignedTo: {
				select: {
					id: true,
					firstName: true,
					lastName: true
				}
			}
		},
		orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
		take: limit,
		skip: offset
	});
}

/**
 * Get queue item by ID
 */
export async function getQueueItem(id: string): Promise<ModerationQueueItem | null> {
	return db.moderationQueueItem.findUnique({
		where: { id },
		include: {
			assignedTo: {
				select: {
					id: true,
					firstName: true,
					lastName: true
				}
			}
		}
	});
}

/**
 * Get queue counts by status and type
 */
export async function getQueueStats(): Promise<{
	byStatus: Record<ModerationStatus, number>;
	byType: Record<ModerationQueueType, number>;
	total: number;
	pendingHighPriority: number;
}> {
	const [byStatus, byType, total, pendingHighPriority] = await Promise.all([
		db.moderationQueueItem.groupBy({
			by: ['status'],
			_count: { id: true }
		}),
		db.moderationQueueItem.groupBy({
			by: ['type'],
			where: { status: 'PENDING' },
			_count: { id: true }
		}),
		db.moderationQueueItem.count({
			where: { status: 'PENDING' }
		}),
		db.moderationQueueItem.count({
			where: { status: 'PENDING', priority: { gte: 5 } }
		})
	]);

	const statusCounts: Record<ModerationStatus, number> = {
		PENDING: 0,
		IN_PROGRESS: 0,
		RESOLVED: 0,
		DISMISSED: 0
	};

	for (const item of byStatus) {
		statusCounts[item.status] = item._count.id;
	}

	const typeCounts: Record<ModerationQueueType, number> = {
		REPORTED_CONTENT: 0,
		EDIT_REQUEST: 0,
		DUPLICATE_MERGE: 0,
		VETO_REVIEW: 0,
		ORG_APPROVAL: 0,
		VERIFICATION_REVIEW: 0,
		FLAGGED_ACCOUNT: 0
	};

	for (const item of byType) {
		typeCounts[item.type] = item._count.id;
	}

	return {
		byStatus: statusCounts,
		byType: typeCounts,
		total,
		pendingHighPriority
	};
}

/**
 * Claim a queue item (assign to moderator)
 */
export async function claimQueueItem(
	itemId: string,
	moderatorId: string
): Promise<ModerationQueueItem> {
	const item = await db.moderationQueueItem.findUnique({
		where: { id: itemId }
	});

	if (!item) {
		throw new ModerationError('Queue item not found', 'NOT_FOUND');
	}

	if (item.status !== 'PENDING') {
		throw new ModerationError('Item is not pending', 'NOT_PENDING');
	}

	// Verify user is a moderator
	const moderator = await db.user.findUnique({
		where: { id: moderatorId }
	});

	if (!moderator || moderator.userType !== 'MODERATOR') {
		throw new ModerationError('User is not a moderator', 'NOT_MODERATOR');
	}

	return db.moderationQueueItem.update({
		where: { id: itemId },
		data: {
			assignedToId: moderatorId,
			status: 'IN_PROGRESS'
		}
	});
}

/**
 * Release a claimed item back to the queue
 */
export async function releaseQueueItem(
	itemId: string,
	moderatorId: string
): Promise<ModerationQueueItem> {
	const item = await db.moderationQueueItem.findUnique({
		where: { id: itemId }
	});

	if (!item) {
		throw new ModerationError('Queue item not found', 'NOT_FOUND');
	}

	if (item.assignedToId !== moderatorId) {
		throw new ModerationError('Not assigned to this moderator', 'NOT_ASSIGNED');
	}

	return db.moderationQueueItem.update({
		where: { id: itemId },
		data: {
			assignedToId: null,
			status: 'PENDING'
		}
	});
}

/**
 * Resolve a queue item
 */
export async function resolveQueueItem(
	itemId: string,
	moderatorId: string,
	resolution: string
): Promise<ModerationQueueItem> {
	const item = await db.moderationQueueItem.findUnique({
		where: { id: itemId }
	});

	if (!item) {
		throw new ModerationError('Queue item not found', 'NOT_FOUND');
	}

	if (item.status === 'RESOLVED' || item.status === 'DISMISSED') {
		throw new ModerationError('Item already resolved', 'ALREADY_RESOLVED');
	}

	// Verify moderator
	const moderator = await db.user.findUnique({
		where: { id: moderatorId }
	});

	if (!moderator || moderator.userType !== 'MODERATOR') {
		throw new ModerationError('User is not a moderator', 'NOT_MODERATOR');
	}

	return db.moderationQueueItem.update({
		where: { id: itemId },
		data: {
			status: 'RESOLVED',
			resolution,
			assignedToId: moderatorId,
			resolvedAt: new Date()
		}
	});
}

/**
 * Dismiss a queue item (no action needed)
 */
export async function dismissQueueItem(
	itemId: string,
	moderatorId: string,
	reason: string
): Promise<ModerationQueueItem> {
	const item = await db.moderationQueueItem.findUnique({
		where: { id: itemId }
	});

	if (!item) {
		throw new ModerationError('Queue item not found', 'NOT_FOUND');
	}

	if (item.status === 'RESOLVED' || item.status === 'DISMISSED') {
		throw new ModerationError('Item already resolved', 'ALREADY_RESOLVED');
	}

	// Verify moderator
	const moderator = await db.user.findUnique({
		where: { id: moderatorId }
	});

	if (!moderator || moderator.userType !== 'MODERATOR') {
		throw new ModerationError('User is not a moderator', 'NOT_MODERATOR');
	}

	return db.moderationQueueItem.update({
		where: { id: itemId },
		data: {
			status: 'DISMISSED',
			resolution: `Dismissed: ${reason}`,
			assignedToId: moderatorId,
			resolvedAt: new Date()
		}
	});
}

/**
 * Get items assigned to a specific moderator
 */
export async function getModeratorAssignments(
	moderatorId: string
): Promise<ModerationQueueItem[]> {
	return db.moderationQueueItem.findMany({
		where: {
			assignedToId: moderatorId,
			status: 'IN_PROGRESS'
		},
		orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }]
	});
}

/**
 * Get next item from queue (oldest pending with highest priority)
 */
export async function getNextQueueItem(
	type?: ModerationQueueType
): Promise<ModerationQueueItem | null> {
	return db.moderationQueueItem.findFirst({
		where: {
			status: 'PENDING',
			...(type ? { type } : {})
		},
		orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }]
	});
}

/**
 * Auto-assign next available item to a moderator
 */
export async function autoAssignNextItem(
	moderatorId: string,
	preferredType?: ModerationQueueType
): Promise<ModerationQueueItem | null> {
	const nextItem = await getNextQueueItem(preferredType);

	if (!nextItem) {
		return null;
	}

	return claimQueueItem(nextItem.id, moderatorId);
}

/**
 * Get moderator activity stats
 */
export async function getModeratorStats(
	moderatorId: string,
	days: number = 30
): Promise<{
	resolved: number;
	dismissed: number;
	avgResolutionTime: number;
	byType: Record<ModerationQueueType, number>;
}> {
	const since = new Date();
	since.setDate(since.getDate() - days);

	const resolved = await db.moderationQueueItem.findMany({
		where: {
			assignedToId: moderatorId,
			resolvedAt: { gte: since }
		}
	});

	const resolvedCount = resolved.filter((i) => i.status === 'RESOLVED').length;
	const dismissedCount = resolved.filter((i) => i.status === 'DISMISSED').length;

	// Calculate average resolution time
	let totalTime = 0;
	let countWithTime = 0;

	for (const item of resolved) {
		if (item.resolvedAt) {
			totalTime += item.resolvedAt.getTime() - item.createdAt.getTime();
			countWithTime++;
		}
	}

	const avgResolutionTime = countWithTime > 0 ? totalTime / countWithTime : 0;

	// Count by type
	const byType: Record<ModerationQueueType, number> = {
		REPORTED_CONTENT: 0,
		EDIT_REQUEST: 0,
		DUPLICATE_MERGE: 0,
		VETO_REVIEW: 0,
		ORG_APPROVAL: 0,
		VERIFICATION_REVIEW: 0,
		FLAGGED_ACCOUNT: 0
	};

	for (const item of resolved) {
		byType[item.type]++;
	}

	return {
		resolved: resolvedCount,
		dismissed: dismissedCount,
		avgResolutionTime,
		byType
	};
}

/**
 * Cleanup old resolved items
 */
export async function cleanupOldItems(daysOld: number = 90): Promise<number> {
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - daysOld);

	const result = await db.moderationQueueItem.deleteMany({
		where: {
			status: { in: ['RESOLVED', 'DISMISSED'] },
			resolvedAt: { lt: cutoff }
		}
	});

	return result.count;
}

/**
 * Helper to add content report to queue
 */
export async function reportContent(
	contentId: string,
	contentType: string,
	reason: string,
	reporterId?: string
): Promise<ModerationQueueItem> {
	return addToQueue({
		type: 'REPORTED_CONTENT',
		contentId,
		contentType,
		reason,
		details: reporterId ? { reporterId } : undefined
	});
}

/**
 * Helper to add edit request to queue
 */
export async function queueEditRequest(
	editId: string,
	factId: string,
	editorId: string
): Promise<ModerationQueueItem> {
	return addToQueue({
		type: 'EDIT_REQUEST',
		contentId: editId,
		contentType: 'factEdit',
		details: { factId, editorId }
	});
}

/**
 * Helper to add veto for review
 */
export async function queueVetoReview(
	vetoId: string,
	factId: string,
	vetoPriority?: number
): Promise<ModerationQueueItem> {
	return addToQueue({
		type: 'VETO_REVIEW',
		contentId: vetoId,
		contentType: 'veto',
		details: { factId },
		priority: vetoPriority
	});
}

/**
 * Helper to add organization approval request
 */
export async function queueOrgApproval(
	userId: string,
	orgName: string,
	domain: string
): Promise<ModerationQueueItem> {
	return addToQueue({
		type: 'ORG_APPROVAL',
		contentId: userId,
		contentType: 'organizationRequest',
		details: { orgName, domain }
	});
}

/**
 * Helper to add verification for review
 */
export async function queueVerificationReview(
	verificationId: string,
	userId: string,
	verificationType: string
): Promise<ModerationQueueItem> {
	return addToQueue({
		type: 'VERIFICATION_REVIEW',
		contentId: verificationId,
		contentType: 'expertVerification',
		details: { userId, verificationType }
	});
}

/**
 * Helper to add flagged account for review
 */
export async function queueFlaggedAccount(
	userId: string,
	flagReason: string,
	vetoScore?: number
): Promise<ModerationQueueItem> {
	return addToQueue({
		type: 'FLAGGED_ACCOUNT',
		contentId: userId,
		contentType: 'user',
		reason: flagReason,
		details: { vetoScore },
		priority: vetoScore && vetoScore < -10 ? 5 : 0
	});
}
