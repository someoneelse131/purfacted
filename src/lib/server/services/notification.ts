/**
 * R41: Notification Service
 *
 * Manages user notifications with preferences support.
 */

import { db } from '../db';
import type { Notification, NotificationPreference, NotificationType } from '@prisma/client';

export class NotificationError extends Error {
	code: string;
	constructor(message: string, code: string) {
		super(message);
		this.name = 'NotificationError';
		this.code = code;
	}
}

export interface NotificationData {
	factId?: string;
	debateId?: string;
	userId?: string;
	commentId?: string;
	vetoId?: string;
	oldTrustScore?: number;
	newTrustScore?: number;
	[key: string]: unknown;
}

export interface CreateNotificationInput {
	type: NotificationType;
	title: string;
	body: string;
	data?: NotificationData;
}

/**
 * Default notification preferences (all enabled)
 */
const DEFAULT_PREFERENCES: Record<NotificationType, { email: boolean; inApp: boolean }> = {
	TRUST_LOST: { email: true, inApp: true },
	TRUST_GAINED: { email: true, inApp: true },
	FACT_REPLY: { email: true, inApp: true },
	FACT_DISPUTED: { email: true, inApp: true },
	VETO_RECEIVED: { email: true, inApp: true },
	VERIFICATION_RESULT: { email: true, inApp: true },
	ORG_COMMENT: { email: true, inApp: true },
	DEBATE_REQUEST: { email: true, inApp: true },
	DEBATE_PUBLISHED: { email: true, inApp: true },
	MODERATOR_STATUS: { email: true, inApp: true },
	FACT_STATUS: { email: true, inApp: true }
};

/**
 * Get user's notification preferences
 */
export async function getNotificationPreferences(
	userId: string
): Promise<Record<NotificationType, { email: boolean; inApp: boolean }>> {
	const preferences = await db.notificationPreference.findMany({
		where: { userId }
	});

	// Start with defaults and override with user preferences
	const result = { ...DEFAULT_PREFERENCES };

	for (const pref of preferences) {
		result[pref.type] = {
			email: pref.email,
			inApp: pref.inApp
		};
	}

	return result;
}

/**
 * Update a notification preference
 */
export async function updateNotificationPreference(
	userId: string,
	type: NotificationType,
	settings: { email?: boolean; inApp?: boolean }
): Promise<NotificationPreference> {
	return db.notificationPreference.upsert({
		where: {
			userId_type: { userId, type }
		},
		create: {
			userId,
			type,
			email: settings.email ?? true,
			inApp: settings.inApp ?? true
		},
		update: {
			email: settings.email,
			inApp: settings.inApp
		}
	});
}

/**
 * Check if user wants this notification type via in-app
 */
export async function shouldSendInApp(
	userId: string,
	type: NotificationType
): Promise<boolean> {
	const pref = await db.notificationPreference.findUnique({
		where: {
			userId_type: { userId, type }
		}
	});

	return pref?.inApp ?? DEFAULT_PREFERENCES[type]?.inApp ?? true;
}

/**
 * Check if user wants this notification type via email
 */
export async function shouldSendEmail(
	userId: string,
	type: NotificationType
): Promise<boolean> {
	const pref = await db.notificationPreference.findUnique({
		where: {
			userId_type: { userId, type }
		}
	});

	return pref?.email ?? DEFAULT_PREFERENCES[type]?.email ?? true;
}

/**
 * Create a notification for a user (if they want it)
 */
export async function createNotification(
	userId: string,
	input: CreateNotificationInput
): Promise<Notification | null> {
	// Check if user wants in-app notifications for this type
	const wantsInApp = await shouldSendInApp(userId, input.type);

	if (!wantsInApp) {
		return null;
	}

	return db.notification.create({
		data: {
			userId,
			type: input.type,
			title: input.title,
			body: input.body,
			data: input.data ?? null
		}
	});
}

/**
 * Create notifications for multiple users
 */
export async function createNotificationBulk(
	userIds: string[],
	input: CreateNotificationInput
): Promise<number> {
	let created = 0;

	for (const userId of userIds) {
		const notification = await createNotification(userId, input);
		if (notification) {
			created++;
		}
	}

	return created;
}

/**
 * Get notifications for a user
 */
export async function getUserNotifications(
	userId: string,
	options: {
		unreadOnly?: boolean;
		limit?: number;
		offset?: number;
	} = {}
): Promise<Notification[]> {
	const { unreadOnly = false, limit = 20, offset = 0 } = options;

	return db.notification.findMany({
		where: {
			userId,
			...(unreadOnly ? { readAt: null } : {})
		},
		orderBy: { createdAt: 'desc' },
		take: limit,
		skip: offset
	});
}

/**
 * Get unread notification count for a user
 */
export async function getUnreadCount(userId: string): Promise<number> {
	return db.notification.count({
		where: {
			userId,
			readAt: null
		}
	});
}

/**
 * Mark a notification as read
 */
export async function markAsRead(
	notificationId: string,
	userId: string
): Promise<Notification> {
	const notification = await db.notification.findUnique({
		where: { id: notificationId }
	});

	if (!notification) {
		throw new NotificationError('Notification not found', 'NOT_FOUND');
	}

	if (notification.userId !== userId) {
		throw new NotificationError('Not authorized', 'UNAUTHORIZED');
	}

	return db.notification.update({
		where: { id: notificationId },
		data: { readAt: new Date() }
	});
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllAsRead(userId: string): Promise<number> {
	const result = await db.notification.updateMany({
		where: {
			userId,
			readAt: null
		},
		data: { readAt: new Date() }
	});

	return result.count;
}

/**
 * Delete a notification
 */
export async function deleteNotification(
	notificationId: string,
	userId: string
): Promise<void> {
	const notification = await db.notification.findUnique({
		where: { id: notificationId }
	});

	if (!notification) {
		throw new NotificationError('Notification not found', 'NOT_FOUND');
	}

	if (notification.userId !== userId) {
		throw new NotificationError('Not authorized', 'UNAUTHORIZED');
	}

	await db.notification.delete({
		where: { id: notificationId }
	});
}

/**
 * Delete old notifications (cleanup job)
 */
export async function deleteOldNotifications(daysOld: number = 30): Promise<number> {
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - daysOld);

	const result = await db.notification.deleteMany({
		where: {
			createdAt: { lt: cutoff },
			readAt: { not: null }
		}
	});

	return result.count;
}

// ===========================================
// Notification Templates
// ===========================================

/**
 * Create trust change notification
 */
export async function notifyTrustChange(
	userId: string,
	oldScore: number,
	newScore: number,
	reason: string
): Promise<Notification | null> {
	const gained = newScore > oldScore;
	const change = Math.abs(newScore - oldScore);

	return createNotification(userId, {
		type: gained ? 'TRUST_GAINED' : 'TRUST_LOST',
		title: gained ? 'Trust Score Increased' : 'Trust Score Decreased',
		body: `Your trust score ${gained ? 'increased' : 'decreased'} by ${change} points. ${reason}`,
		data: {
			oldTrustScore: oldScore,
			newTrustScore: newScore
		}
	});
}

/**
 * Create fact reply notification
 */
export async function notifyFactReply(
	userId: string,
	factId: string,
	factTitle: string,
	replyAuthor: string
): Promise<Notification | null> {
	return createNotification(userId, {
		type: 'FACT_REPLY',
		title: 'New Reply to Your Fact',
		body: `${replyAuthor} replied to your fact: "${factTitle}"`,
		data: { factId }
	});
}

/**
 * Create fact disputed notification
 */
export async function notifyFactDisputed(
	userId: string,
	factId: string,
	factTitle: string,
	disputeType: string
): Promise<Notification | null> {
	return createNotification(userId, {
		type: 'FACT_DISPUTED',
		title: 'Your Fact Was Disputed',
		body: `Someone disputed your fact "${factTitle}" (${disputeType})`,
		data: { factId }
	});
}

/**
 * Create veto received notification
 */
export async function notifyVetoReceived(
	userId: string,
	factId: string,
	factTitle: string,
	vetoId: string
): Promise<Notification | null> {
	return createNotification(userId, {
		type: 'VETO_RECEIVED',
		title: 'Veto Filed Against Your Fact',
		body: `A veto has been filed against your fact: "${factTitle}"`,
		data: { factId, vetoId }
	});
}

/**
 * Create verification result notification
 */
export async function notifyVerificationResult(
	userId: string,
	approved: boolean,
	verificationType: string
): Promise<Notification | null> {
	return createNotification(userId, {
		type: 'VERIFICATION_RESULT',
		title: approved ? 'Verification Approved!' : 'Verification Rejected',
		body: approved
			? `Your ${verificationType} verification has been approved. You now have elevated status.`
			: `Your ${verificationType} verification was not approved. You can resubmit with additional documentation.`
	});
}

/**
 * Create organization comment notification
 */
export async function notifyOrgComment(
	userId: string,
	factId: string,
	factTitle: string,
	orgName: string
): Promise<Notification | null> {
	return createNotification(userId, {
		type: 'ORG_COMMENT',
		title: 'Official Organization Response',
		body: `${orgName} has posted an official response to: "${factTitle}"`,
		data: { factId }
	});
}

/**
 * Create debate request notification
 */
export async function notifyDebateRequest(
	userId: string,
	debateId: string,
	initiatorName: string,
	factTitle: string
): Promise<Notification | null> {
	return createNotification(userId, {
		type: 'DEBATE_REQUEST',
		title: 'New Debate Request',
		body: `${initiatorName} has requested a debate with you about: "${factTitle}"`,
		data: { debateId }
	});
}

/**
 * Create debate published notification
 */
export async function notifyDebatePublished(
	userId: string,
	debateId: string,
	debateTitle: string
): Promise<Notification | null> {
	return createNotification(userId, {
		type: 'DEBATE_PUBLISHED',
		title: 'Debate Published',
		body: `Your debate "${debateTitle}" has been published and is now public.`,
		data: { debateId }
	});
}

/**
 * Create moderator status notification
 */
export async function notifyModeratorStatus(
	userId: string,
	promoted: boolean
): Promise<Notification | null> {
	return createNotification(userId, {
		type: 'MODERATOR_STATUS',
		title: promoted ? 'Promoted to Moderator!' : 'Moderator Status Changed',
		body: promoted
			? 'Congratulations! You have been promoted to moderator. Thank you for your contributions.'
			: 'Your moderator status has been changed. Thank you for your service.'
	});
}

/**
 * Create fact status notification
 */
export async function notifyFactStatus(
	userId: string,
	factId: string,
	factTitle: string,
	newStatus: string
): Promise<Notification | null> {
	const statusMessages: Record<string, string> = {
		PROVEN: 'has been verified as true by the community',
		DISPROVEN: 'has been marked as false by the community',
		OUTDATED: 'has been marked as outdated',
		DISPUTED: 'is currently being disputed'
	};

	const message = statusMessages[newStatus] || `status changed to ${newStatus}`;

	return createNotification(userId, {
		type: 'FACT_STATUS',
		title: `Fact Status: ${newStatus}`,
		body: `Your fact "${factTitle}" ${message}.`,
		data: { factId, status: newStatus }
	});
}
