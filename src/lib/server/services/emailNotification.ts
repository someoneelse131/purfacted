/**
 * R43: Email Notification Service
 *
 * Sends email notifications based on user preferences.
 * Includes batching to avoid spamming users.
 */

import { db } from '../db';
import { sendMail, renderTemplate } from '../mail';
import { shouldSendEmail } from './notification';
import type { NotificationType, User } from '@prisma/client';
import crypto from 'crypto';

const BASE_URL = process.env.PUBLIC_URL || 'http://localhost:5173';

// Pending notifications for batching (in production, use Redis)
const pendingNotifications: Map<string, { userId: string; type: NotificationType; data: unknown }[]> =
	new Map();

// Batch settings
const BATCH_WINDOW_MS = 60 * 1000; // 1 minute window to batch notifications
const MAX_BATCH_SIZE = 5;

/**
 * Generate unsubscribe token for one-click unsubscribe
 */
export function generateUnsubscribeToken(userId: string, type: NotificationType): string {
	const secret = process.env.APP_SECRET || 'dev-secret';
	const payload = `${userId}:${type}`;
	return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Verify unsubscribe token
 */
export function verifyUnsubscribeToken(
	userId: string,
	type: NotificationType,
	token: string
): boolean {
	const expected = generateUnsubscribeToken(userId, type);
	// Need same length for timingSafeEqual
	if (token.length !== expected.length) {
		return false;
	}
	return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

/**
 * Get unsubscribe URL for email
 */
export function getUnsubscribeUrl(userId: string, type: NotificationType): string {
	const token = generateUnsubscribeToken(userId, type);
	return `${BASE_URL}/api/notifications/unsubscribe?userId=${userId}&type=${type}&token=${token}`;
}

/**
 * Email templates for each notification type
 */
const emailTemplates: Record<
	NotificationType,
	(data: Record<string, unknown>, user: User) => { subject: string; html: string; text: string }
> = {
	TRUST_LOST: (data, user) => ({
		subject: 'Your Trust Score Has Decreased',
		html: renderTemplate('trustChange', {
			firstName: user.firstName,
			gained: false,
			change: Math.abs((data.newTrustScore as number) - (data.oldTrustScore as number)),
			newScore: data.newTrustScore,
			unsubscribeUrl: getUnsubscribeUrl(user.id, 'TRUST_LOST')
		}),
		text: `Hi ${user.firstName}, your trust score has decreased. New score: ${data.newTrustScore}`
	}),

	TRUST_GAINED: (data, user) => ({
		subject: 'Your Trust Score Has Increased!',
		html: renderTemplate('trustChange', {
			firstName: user.firstName,
			gained: true,
			change: Math.abs((data.newTrustScore as number) - (data.oldTrustScore as number)),
			newScore: data.newTrustScore,
			unsubscribeUrl: getUnsubscribeUrl(user.id, 'TRUST_GAINED')
		}),
		text: `Hi ${user.firstName}, your trust score has increased! New score: ${data.newTrustScore}`
	}),

	FACT_REPLY: (data, user) => ({
		subject: `New Reply to Your Fact: ${data.factTitle}`,
		html: renderTemplate('factReply', {
			firstName: user.firstName,
			factTitle: data.factTitle,
			replyAuthor: data.replyAuthor,
			replyPreview: data.replyPreview,
			factUrl: `${BASE_URL}/facts/${data.factId}`,
			unsubscribeUrl: getUnsubscribeUrl(user.id, 'FACT_REPLY')
		}),
		text: `Hi ${user.firstName}, ${data.replyAuthor} replied to your fact "${data.factTitle}".`
	}),

	FACT_DISPUTED: (data, user) => ({
		subject: `Your Fact Has Been Disputed: ${data.factTitle}`,
		html: renderTemplate('factDisputed', {
			firstName: user.firstName,
			factTitle: data.factTitle,
			disputeType: data.disputeType,
			factUrl: `${BASE_URL}/facts/${data.factId}`,
			unsubscribeUrl: getUnsubscribeUrl(user.id, 'FACT_DISPUTED')
		}),
		text: `Hi ${user.firstName}, your fact "${data.factTitle}" has been disputed.`
	}),

	VETO_RECEIVED: (data, user) => ({
		subject: `Veto Filed Against Your Fact: ${data.factTitle}`,
		html: renderTemplate('vetoReceived', {
			firstName: user.firstName,
			factTitle: data.factTitle,
			vetoReason: data.vetoReason,
			factUrl: `${BASE_URL}/facts/${data.factId}`,
			unsubscribeUrl: getUnsubscribeUrl(user.id, 'VETO_RECEIVED')
		}),
		text: `Hi ${user.firstName}, a veto has been filed against your fact "${data.factTitle}".`
	}),

	VERIFICATION_RESULT: (data, user) => ({
		subject: data.approved ? 'Verification Approved!' : 'Verification Update',
		html: renderTemplate('verificationResult', {
			firstName: user.firstName,
			approved: data.approved,
			verificationType: data.verificationType,
			settingsUrl: `${BASE_URL}/user/settings`,
			unsubscribeUrl: getUnsubscribeUrl(user.id, 'VERIFICATION_RESULT')
		}),
		text: `Hi ${user.firstName}, your ${data.verificationType} verification has been ${data.approved ? 'approved' : 'reviewed'}.`
	}),

	ORG_COMMENT: (data, user) => ({
		subject: `Official Response: ${data.orgName}`,
		html: renderTemplate('orgComment', {
			firstName: user.firstName,
			orgName: data.orgName,
			factTitle: data.factTitle,
			factUrl: `${BASE_URL}/facts/${data.factId}`,
			unsubscribeUrl: getUnsubscribeUrl(user.id, 'ORG_COMMENT')
		}),
		text: `Hi ${user.firstName}, ${data.orgName} has posted an official response to "${data.factTitle}".`
	}),

	DEBATE_REQUEST: (data, user) => ({
		subject: `Debate Request from ${data.initiatorName}`,
		html: renderTemplate('debateRequest', {
			firstName: user.firstName,
			initiatorName: data.initiatorName,
			factTitle: data.factTitle,
			debateUrl: `${BASE_URL}/debates/${data.debateId}`,
			unsubscribeUrl: getUnsubscribeUrl(user.id, 'DEBATE_REQUEST')
		}),
		text: `Hi ${user.firstName}, ${data.initiatorName} has requested a debate with you about "${data.factTitle}".`
	}),

	DEBATE_PUBLISHED: (data, user) => ({
		subject: `Your Debate Has Been Published: ${data.debateTitle}`,
		html: renderTemplate('debatePublished', {
			firstName: user.firstName,
			debateTitle: data.debateTitle,
			debateUrl: `${BASE_URL}/debates/${data.debateId}`,
			unsubscribeUrl: getUnsubscribeUrl(user.id, 'DEBATE_PUBLISHED')
		}),
		text: `Hi ${user.firstName}, your debate "${data.debateTitle}" has been published.`
	}),

	MODERATOR_STATUS: (data, user) => ({
		subject: data.promoted ? 'Congratulations! You Are Now a Moderator' : 'Moderator Status Update',
		html: renderTemplate('moderatorStatus', {
			firstName: user.firstName,
			promoted: data.promoted,
			dashboardUrl: `${BASE_URL}/moderation`,
			unsubscribeUrl: getUnsubscribeUrl(user.id, 'MODERATOR_STATUS')
		}),
		text: `Hi ${user.firstName}, ${data.promoted ? 'congratulations! You have been promoted to moderator.' : 'your moderator status has changed.'}`
	}),

	FACT_STATUS: (data, user) => ({
		subject: `Fact Status Update: ${data.factTitle}`,
		html: renderTemplate('factStatus', {
			firstName: user.firstName,
			factTitle: data.factTitle,
			newStatus: data.status,
			factUrl: `${BASE_URL}/facts/${data.factId}`,
			unsubscribeUrl: getUnsubscribeUrl(user.id, 'FACT_STATUS')
		}),
		text: `Hi ${user.firstName}, your fact "${data.factTitle}" status has changed to ${data.status}.`
	})
};

/**
 * Send email notification to a user
 */
export async function sendEmailNotification(
	userId: string,
	type: NotificationType,
	data: Record<string, unknown>
): Promise<boolean> {
	// Check if user wants email for this type
	const wantsEmail = await shouldSendEmail(userId, type);
	if (!wantsEmail) {
		return false;
	}

	// Get user
	const user = await db.user.findUnique({
		where: { id: userId }
	});

	if (!user || !user.emailVerified || user.deletedAt) {
		return false;
	}

	// Get email template
	const template = emailTemplates[type];
	if (!template) {
		console.error(`No email template for notification type: ${type}`);
		return false;
	}

	const { subject, html, text } = template(data, user);

	// Send email
	return sendMail({
		to: user.email,
		subject,
		html,
		text
	});
}

/**
 * Queue notification for batching
 */
export function queueEmailNotification(
	userId: string,
	type: NotificationType,
	data: unknown
): void {
	const key = `${userId}:${type}`;
	const existing = pendingNotifications.get(key) || [];
	existing.push({ userId, type, data });
	pendingNotifications.set(key, existing);

	// Schedule batch processing if this is the first item
	if (existing.length === 1) {
		setTimeout(() => processBatchedNotifications(key), BATCH_WINDOW_MS);
	}

	// If we hit max batch size, process immediately
	if (existing.length >= MAX_BATCH_SIZE) {
		processBatchedNotifications(key);
	}
}

/**
 * Process batched notifications
 */
async function processBatchedNotifications(key: string): Promise<void> {
	const notifications = pendingNotifications.get(key);
	if (!notifications || notifications.length === 0) return;

	pendingNotifications.delete(key);

	const { userId, type } = notifications[0];

	if (notifications.length === 1) {
		// Single notification, send normally
		await sendEmailNotification(userId, type, notifications[0].data as Record<string, unknown>);
	} else {
		// Multiple notifications, send a digest
		await sendBatchedEmail(userId, type, notifications);
	}
}

/**
 * Send a batched/digest email for multiple notifications of the same type
 */
async function sendBatchedEmail(
	userId: string,
	type: NotificationType,
	notifications: { userId: string; type: NotificationType; data: unknown }[]
): Promise<boolean> {
	const wantsEmail = await shouldSendEmail(userId, type);
	if (!wantsEmail) return false;

	const user = await db.user.findUnique({
		where: { id: userId }
	});

	if (!user || !user.emailVerified || user.deletedAt) {
		return false;
	}

	const count = notifications.length;
	const subject = `You have ${count} new ${formatNotificationType(type)} notifications`;

	// Build summary HTML
	const items = notifications.slice(0, 5).map((n) => {
		const data = n.data as Record<string, string>;
		switch (type) {
			case 'FACT_REPLY':
				return `<li><strong>${data.replyAuthor}</strong> replied to "${data.factTitle}"</li>`;
			case 'TRUST_GAINED':
			case 'TRUST_LOST':
				return `<li>Trust score changed by ${Math.abs((data.newTrustScore as unknown as number) - (data.oldTrustScore as unknown as number))} points</li>`;
			default:
				return `<li>${data.title || 'New notification'}</li>`;
		}
	});

	const html = `
		<h2>Hi ${user.firstName},</h2>
		<p>You have ${count} new notifications:</p>
		<ul>
			${items.join('')}
			${count > 5 ? `<li>...and ${count - 5} more</li>` : ''}
		</ul>
		<p><a href="${BASE_URL}/user/notifications">View all notifications</a></p>
		<hr>
		<p style="font-size: 12px; color: #666;">
			<a href="${getUnsubscribeUrl(userId, type)}">Unsubscribe from these emails</a>
		</p>
	`;

	const text = `Hi ${user.firstName}, you have ${count} new notifications. View them at ${BASE_URL}/user/notifications`;

	return sendMail({
		to: user.email,
		subject,
		html,
		text
	});
}

/**
 * Format notification type for display
 */
function formatNotificationType(type: NotificationType): string {
	const formats: Record<NotificationType, string> = {
		TRUST_LOST: 'trust score',
		TRUST_GAINED: 'trust score',
		FACT_REPLY: 'fact reply',
		FACT_DISPUTED: 'fact dispute',
		VETO_RECEIVED: 'veto',
		VERIFICATION_RESULT: 'verification',
		ORG_COMMENT: 'organization comment',
		DEBATE_REQUEST: 'debate request',
		DEBATE_PUBLISHED: 'debate',
		MODERATOR_STATUS: 'moderator status',
		FACT_STATUS: 'fact status'
	};

	return formats[type] || type.toLowerCase().replace('_', ' ');
}

/**
 * Process one-click unsubscribe
 */
export async function processUnsubscribe(
	userId: string,
	type: NotificationType,
	token: string
): Promise<boolean> {
	// Verify token
	if (!verifyUnsubscribeToken(userId, type, token)) {
		return false;
	}

	// Update preference
	await db.notificationPreference.upsert({
		where: {
			userId_type: { userId, type }
		},
		create: {
			userId,
			type,
			email: false,
			inApp: true // Keep in-app enabled
		},
		update: {
			email: false
		}
	});

	return true;
}

/**
 * Unsubscribe from all email notifications
 */
export async function unsubscribeFromAll(userId: string): Promise<void> {
	const types: NotificationType[] = [
		'TRUST_LOST',
		'TRUST_GAINED',
		'FACT_REPLY',
		'FACT_DISPUTED',
		'VETO_RECEIVED',
		'VERIFICATION_RESULT',
		'ORG_COMMENT',
		'DEBATE_REQUEST',
		'DEBATE_PUBLISHED',
		'MODERATOR_STATUS',
		'FACT_STATUS'
	];

	for (const type of types) {
		await db.notificationPreference.upsert({
			where: {
				userId_type: { userId, type }
			},
			create: {
				userId,
				type,
				email: false,
				inApp: true
			},
			update: {
				email: false
			}
		});
	}
}

/**
 * Get pending notification count for a user (for admin/debugging)
 */
export function getPendingNotificationCount(userId: string): number {
	let count = 0;
	for (const [key, notifications] of pendingNotifications.entries()) {
		if (key.startsWith(userId)) {
			count += notifications.length;
		}
	}
	return count;
}
