/**
 * R45-R46: Moderation Actions Service
 *
 * Implements moderator actions: approve, reject, warn, ban, edit, override.
 */

import { db } from '../db';
import { resolveQueueItem, dismissQueueItem } from './moderation';
import { banUser } from './ban';
import { createNotification } from './notification';
import type { ModerationQueueItem } from '@prisma/client';

export class ModerationActionError extends Error {
	code: string;
	constructor(message: string, code: string) {
		super(message);
		this.name = 'ModerationActionError';
		this.code = code;
	}
}

export interface ModerationAction {
	id: string;
	queueItemId: string;
	moderatorId: string;
	action: string;
	contentId: string;
	contentType: string;
	details?: Record<string, unknown>;
	createdAt: Date;
}

// In-memory action log (use database in production)
const actionLog: ModerationAction[] = [];

/**
 * Log a moderation action
 */
function logAction(
	queueItemId: string,
	moderatorId: string,
	action: string,
	contentId: string,
	contentType: string,
	details?: Record<string, unknown>
): ModerationAction {
	const logged: ModerationAction = {
		id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
		queueItemId,
		moderatorId,
		action,
		contentId,
		contentType,
		details,
		createdAt: new Date()
	};

	actionLog.push(logged);
	return logged;
}

/**
 * Get action history for a moderator
 */
export function getModeratorActionHistory(
	moderatorId: string,
	limit: number = 50
): ModerationAction[] {
	return actionLog
		.filter((a) => a.moderatorId === moderatorId)
		.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
		.slice(0, limit);
}

/**
 * Get action history for a queue item
 */
export function getQueueItemActions(queueItemId: string): ModerationAction[] {
	return actionLog.filter((a) => a.queueItemId === queueItemId);
}

/**
 * Approve content (passes moderation)
 */
export async function approveContent(
	queueItemId: string,
	moderatorId: string,
	notes?: string
): Promise<ModerationQueueItem> {
	const item = await db.moderationQueueItem.findUnique({
		where: { id: queueItemId }
	});

	if (!item) {
		throw new ModerationActionError('Queue item not found', 'NOT_FOUND');
	}

	// Log the action
	logAction(queueItemId, moderatorId, 'approve', item.contentId, item.contentType, { notes });

	// Resolve the queue item
	const resolved = await resolveQueueItem(queueItemId, moderatorId, `Approved${notes ? `: ${notes}` : ''}`);

	// Notify the content owner if we can determine them
	await notifyContentOwner(item.contentId, item.contentType, 'approved', notes);

	return resolved;
}

/**
 * Reject content (remove from platform)
 */
export async function rejectContent(
	queueItemId: string,
	moderatorId: string,
	reason: string
): Promise<ModerationQueueItem> {
	const item = await db.moderationQueueItem.findUnique({
		where: { id: queueItemId }
	});

	if (!item) {
		throw new ModerationActionError('Queue item not found', 'NOT_FOUND');
	}

	// Log the action
	logAction(queueItemId, moderatorId, 'reject', item.contentId, item.contentType, { reason });

	// Handle the rejection based on content type
	await handleContentRejection(item.contentId, item.contentType);

	// Resolve the queue item
	const resolved = await resolveQueueItem(queueItemId, moderatorId, `Rejected: ${reason}`);

	// Notify the content owner
	await notifyContentOwner(item.contentId, item.contentType, 'rejected', reason);

	return resolved;
}

/**
 * Issue a warning to a user
 */
export async function warnUser(
	queueItemId: string,
	moderatorId: string,
	userId: string,
	reason: string
): Promise<ModerationQueueItem> {
	const item = await db.moderationQueueItem.findUnique({
		where: { id: queueItemId }
	});

	if (!item) {
		throw new ModerationActionError('Queue item not found', 'NOT_FOUND');
	}

	// Log the action
	logAction(queueItemId, moderatorId, 'warn', userId, 'user', { reason });

	// Send warning notification
	await createNotification(userId, {
		type: 'MODERATOR_STATUS',
		title: 'Warning from Moderators',
		body: `You have received a warning: ${reason}. Please review our guidelines.`,
		data: { warning: true, reason }
	});

	// Resolve the queue item
	return resolveQueueItem(queueItemId, moderatorId, `Warning issued: ${reason}`);
}

/**
 * Ban a user (triggers progressive ban system)
 */
export async function banUserAction(
	queueItemId: string,
	moderatorId: string,
	userId: string,
	reason: string,
	ip?: string
): Promise<ModerationQueueItem> {
	const item = await db.moderationQueueItem.findUnique({
		where: { id: queueItemId }
	});

	if (!item) {
		throw new ModerationActionError('Queue item not found', 'NOT_FOUND');
	}

	// Log the action
	logAction(queueItemId, moderatorId, 'ban', userId, 'user', { reason, ip });

	// Execute the ban
	await banUser(userId, reason, moderatorId, ip);

	// Resolve the queue item
	return resolveQueueItem(queueItemId, moderatorId, `User banned: ${reason}`);
}

/**
 * Edit content (with logging)
 */
export async function editContent(
	queueItemId: string,
	moderatorId: string,
	changes: Record<string, unknown>
): Promise<ModerationQueueItem> {
	const item = await db.moderationQueueItem.findUnique({
		where: { id: queueItemId }
	});

	if (!item) {
		throw new ModerationActionError('Queue item not found', 'NOT_FOUND');
	}

	// Log the action with changes
	logAction(queueItemId, moderatorId, 'edit', item.contentId, item.contentType, { changes });

	// Apply the edit based on content type
	await applyContentEdit(item.contentId, item.contentType, changes);

	// Resolve the queue item
	const resolved = await resolveQueueItem(
		queueItemId,
		moderatorId,
		`Content edited by moderator`
	);

	// Notify the content owner
	await notifyContentOwner(item.contentId, item.contentType, 'edited');

	return resolved;
}

/**
 * Override verification result (for expert verifications)
 */
export async function overrideVerification(
	queueItemId: string,
	moderatorId: string,
	approved: boolean,
	notes?: string
): Promise<ModerationQueueItem> {
	const item = await db.moderationQueueItem.findUnique({
		where: { id: queueItemId }
	});

	if (!item) {
		throw new ModerationActionError('Queue item not found', 'NOT_FOUND');
	}

	if (item.type !== 'VERIFICATION_REVIEW') {
		throw new ModerationActionError('Item is not a verification', 'INVALID_TYPE');
	}

	// Log the action
	logAction(queueItemId, moderatorId, 'override', item.contentId, item.contentType, {
		approved,
		notes
	});

	// Update the verification
	await db.expertVerification.update({
		where: { id: item.contentId },
		data: {
			status: approved ? 'APPROVED' : 'REJECTED'
		}
	});

	// Update user type if approved
	if (approved) {
		const verification = await db.expertVerification.findUnique({
			where: { id: item.contentId }
		});

		if (verification) {
			await db.user.update({
				where: { id: verification.userId },
				data: {
					userType: verification.type === 'PHD' ? 'PHD' : 'EXPERT'
				}
			});
		}
	}

	// Resolve the queue item
	return resolveQueueItem(
		queueItemId,
		moderatorId,
		`Verification ${approved ? 'approved' : 'rejected'} by moderator${notes ? `: ${notes}` : ''}`
	);
}

/**
 * Moderator marks their own action as wrong (triggers re-review)
 */
export async function markActionAsWrong(
	queueItemId: string,
	moderatorId: string,
	reason: string
): Promise<ModerationQueueItem> {
	const item = await db.moderationQueueItem.findUnique({
		where: { id: queueItemId }
	});

	if (!item) {
		throw new ModerationActionError('Queue item not found', 'NOT_FOUND');
	}

	if (item.assignedToId !== moderatorId) {
		throw new ModerationActionError('Only the assigned moderator can mark as wrong', 'NOT_ASSIGNED');
	}

	// Log the action
	logAction(queueItemId, moderatorId, 'mark_wrong', item.contentId, item.contentType, { reason });

	// Reset the item to pending for re-review
	const updated = await db.moderationQueueItem.update({
		where: { id: queueItemId },
		data: {
			status: 'PENDING',
			assignedToId: null,
			resolution: null,
			resolvedAt: null,
			priority: (item.priority || 0) + 5, // Increase priority for re-review
			details: {
				...(typeof item.details === 'object' ? item.details : {}),
				markedWrongBy: moderatorId,
				markedWrongReason: reason,
				previousResolution: item.resolution
			}
		}
	});

	return updated;
}

/**
 * Dismiss a report (no action needed)
 */
export async function dismissReport(
	queueItemId: string,
	moderatorId: string,
	reason: string
): Promise<ModerationQueueItem> {
	// Log the action
	const item = await db.moderationQueueItem.findUnique({
		where: { id: queueItemId }
	});

	if (item) {
		logAction(queueItemId, moderatorId, 'dismiss', item.contentId, item.contentType, { reason });
	}

	return dismissQueueItem(queueItemId, moderatorId, reason);
}

// ====================================
// Helper Functions
// ====================================

/**
 * Notify content owner about moderation action
 */
async function notifyContentOwner(
	contentId: string,
	contentType: string,
	action: string,
	reason?: string
): Promise<void> {
	let userId: string | null = null;

	// Get the content owner based on type
	switch (contentType) {
		case 'fact': {
			const fact = await db.fact.findUnique({ where: { id: contentId } });
			userId = fact?.userId || null;
			break;
		}
		case 'comment': {
			const comment = await db.comment.findUnique({ where: { id: contentId } });
			userId = comment?.userId || null;
			break;
		}
		case 'debate': {
			const debate = await db.debate.findUnique({ where: { id: contentId } });
			userId = debate?.initiatorId || null;
			break;
		}
		case 'discussion': {
			const discussion = await db.discussion.findUnique({ where: { id: contentId } });
			userId = discussion?.userId || null;
			break;
		}
	}

	if (userId) {
		const actionMessages: Record<string, string> = {
			approved: 'Your content has been approved by moderators.',
			rejected: `Your content has been removed: ${reason || 'Policy violation'}`,
			edited: 'Your content has been edited by moderators for policy compliance.'
		};

		await createNotification(userId, {
			type: 'FACT_STATUS',
			title: `Content ${action.charAt(0).toUpperCase() + action.slice(1)}`,
			body: actionMessages[action] || `Your content has been ${action}.`,
			data: { contentId, contentType, action, reason }
		});
	}
}

/**
 * Handle content rejection based on type
 */
async function handleContentRejection(contentId: string, contentType: string): Promise<void> {
	switch (contentType) {
		case 'fact':
			await db.fact.update({
				where: { id: contentId },
				data: { deletedAt: new Date() }
			});
			break;
		case 'comment':
			await db.comment.update({
				where: { id: contentId },
				data: { deletedAt: new Date() }
			});
			break;
		case 'discussion':
			await db.discussion.update({
				where: { id: contentId },
				data: { deletedAt: new Date() }
			});
			break;
		// Add more content types as needed
	}
}

/**
 * Apply content edit based on type
 */
async function applyContentEdit(
	contentId: string,
	contentType: string,
	changes: Record<string, unknown>
): Promise<void> {
	switch (contentType) {
		case 'fact':
			await db.fact.update({
				where: { id: contentId },
				data: changes
			});
			break;
		case 'comment':
			await db.comment.update({
				where: { id: contentId },
				data: changes
			});
			break;
		// Add more content types as needed
	}
}

/**
 * Get dashboard summary for a moderator
 */
export async function getModerationDashboard(moderatorId: string): Promise<{
	pendingCount: number;
	myAssignments: number;
	todayResolved: number;
	recentActions: ModerationAction[];
	queueByType: Record<string, number>;
}> {
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const [pendingCount, myAssignments, todayItems, queueByType] = await Promise.all([
		db.moderationQueueItem.count({ where: { status: 'PENDING' } }),
		db.moderationQueueItem.count({
			where: { assignedToId: moderatorId, status: 'IN_PROGRESS' }
		}),
		db.moderationQueueItem.count({
			where: {
				assignedToId: moderatorId,
				resolvedAt: { gte: today }
			}
		}),
		db.moderationQueueItem.groupBy({
			by: ['type'],
			where: { status: 'PENDING' },
			_count: { id: true }
		})
	]);

	const recentActions = getModeratorActionHistory(moderatorId, 10);

	const queueCounts: Record<string, number> = {};
	for (const item of queueByType) {
		queueCounts[item.type] = item._count.id;
	}

	return {
		pendingCount,
		myAssignments,
		todayResolved: todayItems,
		recentActions,
		queueByType: queueCounts
	};
}
