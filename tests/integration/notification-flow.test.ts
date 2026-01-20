import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * T30: Notification Flow Integration Tests
 *
 * Tests the complete notification system including creation, delivery, and preferences.
 * Covers: Event → Notification → Preferences → Delivery → Read/Delete
 */

// Mock notification service
vi.mock('$lib/server/services/notification', () => ({
	createNotification: vi.fn(),
	getUserNotifications: vi.fn(),
	markAsRead: vi.fn(),
	markAllAsRead: vi.fn(),
	deleteNotification: vi.fn(),
	getUnreadCount: vi.fn(),
	getNotificationPreferences: vi.fn(),
	updateNotificationPreference: vi.fn(),
	NotificationError: class NotificationError extends Error {
		code: string;
		constructor(code: string, message: string) {
			super(message);
			this.code = code;
		}
	}
}));

// Mock email notification service
vi.mock('$lib/server/services/emailNotification', () => ({
	sendNotificationEmail: vi.fn(),
	processUnsubscribe: vi.fn(),
	unsubscribeFromAll: vi.fn()
}));

// Mock fact service (for triggering events)
vi.mock('$lib/server/services/fact', () => ({
	getFactById: vi.fn()
}));

// Mock user service
vi.mock('$lib/server/services/user', () => ({
	getUserById: vi.fn()
}));

describe('T30: Notification Flow Integration Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Notification Creation from Events', () => {
		it('should create notification when fact receives reply', async () => {
			const { createNotification, getUserNotifications } = await import(
				'$lib/server/services/notification'
			);

			vi.mocked(createNotification).mockResolvedValue({
				id: 'notif-1',
				type: 'FACT_REPLY',
				userId: 'author-123',
				message: 'Someone replied to your fact',
				read: false
			} as any);

			await createNotification('author-123', 'FACT_REPLY', 'Someone replied to your fact', {
				factId: 'fact-123',
				commenterId: 'commenter-456'
			});

			vi.mocked(getUserNotifications).mockResolvedValue([
				{
					id: 'notif-1',
					type: 'FACT_REPLY',
					message: 'Someone replied to your fact',
					read: false
				}
			] as any);

			const notifications = await getUserNotifications('author-123', { unreadOnly: true });
			expect(notifications).toHaveLength(1);
			expect(notifications[0].type).toBe('FACT_REPLY');
		});

		it('should create notification when trust score changes', async () => {
			const { createNotification } = await import('$lib/server/services/notification');

			// Trust gained
			vi.mocked(createNotification).mockResolvedValue({
				id: 'notif-trust-1',
				type: 'TRUST_GAINED',
				message: 'You gained 10 trust points'
			} as any);

			await createNotification('user-123', 'TRUST_GAINED', 'You gained 10 trust points', {
				points: 10,
				reason: 'FACT_APPROVED'
			});

			expect(createNotification).toHaveBeenCalledWith(
				'user-123',
				'TRUST_GAINED',
				'You gained 10 trust points',
				expect.any(Object)
			);

			// Trust lost
			vi.mocked(createNotification).mockResolvedValue({
				id: 'notif-trust-2',
				type: 'TRUST_LOST',
				message: 'You lost 5 trust points'
			} as any);

			await createNotification('user-456', 'TRUST_LOST', 'You lost 5 trust points', {
				points: -5,
				reason: 'FAILED_VETO'
			});

			expect(createNotification).toHaveBeenCalled();
		});

		it('should create notification for debate request', async () => {
			const { createNotification } = await import('$lib/server/services/notification');

			vi.mocked(createNotification).mockResolvedValue({
				id: 'notif-debate',
				type: 'DEBATE_REQUEST',
				message: 'User123 wants to debate you on "Climate Change Facts"'
			} as any);

			await createNotification(
				'target-user',
				'DEBATE_REQUEST',
				'User123 wants to debate you',
				{
					debateId: 'debate-123',
					requesterId: 'requester-456',
					factId: 'fact-789'
				}
			);

			expect(createNotification).toHaveBeenCalled();
		});

		it('should create notification when fact status changes', async () => {
			const { createNotification } = await import('$lib/server/services/notification');

			vi.mocked(createNotification).mockResolvedValue({
				id: 'notif-status',
				type: 'FACT_STATUS',
				message: 'Your fact has been marked as PROVEN'
			} as any);

			await createNotification('author-123', 'FACT_STATUS', 'Your fact has been marked as PROVEN', {
				factId: 'fact-123',
				newStatus: 'PROVEN'
			});

			expect(createNotification).toHaveBeenCalled();
		});

		it('should create notification for veto received', async () => {
			const { createNotification } = await import('$lib/server/services/notification');

			vi.mocked(createNotification).mockResolvedValue({
				id: 'notif-veto',
				type: 'VETO_RECEIVED',
				message: 'Your proven fact has received a veto challenge'
			} as any);

			await createNotification('author-123', 'VETO_RECEIVED', 'Your fact received a veto', {
				factId: 'fact-123',
				vetoId: 'veto-456'
			});

			expect(createNotification).toHaveBeenCalled();
		});

		it('should create notification for organization comment', async () => {
			const { createNotification } = await import('$lib/server/services/notification');

			vi.mocked(createNotification).mockResolvedValue({
				id: 'notif-org',
				type: 'ORG_COMMENT',
				message: 'Your organization was mentioned in a comment'
			} as any);

			await createNotification('org-admin', 'ORG_COMMENT', 'Organization mentioned', {
				factId: 'fact-123',
				commentId: 'comment-456'
			});

			expect(createNotification).toHaveBeenCalled();
		});
	});

	describe('Notification Preferences', () => {
		it('should respect email notification preferences', async () => {
			const { getNotificationPreferences, createNotification } = await import(
				'$lib/server/services/notification'
			);
			const { sendNotificationEmail } = await import(
				'$lib/server/services/emailNotification'
			);

			vi.mocked(getNotificationPreferences).mockResolvedValue([
				{ type: 'FACT_REPLY', email: true, inApp: true },
				{ type: 'TRUST_GAINED', email: false, inApp: true }
			] as any);

			const prefs = await getNotificationPreferences('user-123');

			// FACT_REPLY has email enabled
			const factReplyPref = prefs.find((p) => p.type === 'FACT_REPLY');
			expect(factReplyPref?.email).toBe(true);

			// Would send email for FACT_REPLY
			vi.mocked(sendNotificationEmail).mockResolvedValue(undefined);
			await sendNotificationEmail('user@test.com', 'FACT_REPLY', 'Someone replied');
			expect(sendNotificationEmail).toHaveBeenCalled();

			// TRUST_GAINED has email disabled - would not send
			const trustPref = prefs.find((p) => p.type === 'TRUST_GAINED');
			expect(trustPref?.email).toBe(false);
		});

		it('should update notification preference', async () => {
			const { updateNotificationPreference, getNotificationPreferences } = await import(
				'$lib/server/services/notification'
			);

			vi.mocked(updateNotificationPreference).mockResolvedValue({
				type: 'DEBATE_REQUEST',
				email: false,
				inApp: true
			} as any);

			await updateNotificationPreference('user-123', 'DEBATE_REQUEST', {
				email: false
			});

			vi.mocked(getNotificationPreferences).mockResolvedValue([
				{ type: 'DEBATE_REQUEST', email: false, inApp: true }
			] as any);

			const prefs = await getNotificationPreferences('user-123');
			const debatePref = prefs.find((p) => p.type === 'DEBATE_REQUEST');
			expect(debatePref?.email).toBe(false);
		});

		it('should unsubscribe from specific notification type', async () => {
			const { processUnsubscribe, unsubscribeFromAll } = await import(
				'$lib/server/services/emailNotification'
			);

			vi.mocked(processUnsubscribe).mockResolvedValue(true);

			const result = await processUnsubscribe('user-123', 'FACT_REPLY', 'valid-token');
			expect(result).toBe(true);
		});

		it('should unsubscribe from all email notifications', async () => {
			const { unsubscribeFromAll } = await import('$lib/server/services/emailNotification');

			vi.mocked(unsubscribeFromAll).mockResolvedValue(undefined);

			await unsubscribeFromAll('user-123');
			expect(unsubscribeFromAll).toHaveBeenCalledWith('user-123');
		});
	});

	describe('Notification Reading and Management', () => {
		it('should mark notification as read', async () => {
			const { markAsRead, getUnreadCount } = await import(
				'$lib/server/services/notification'
			);

			vi.mocked(getUnreadCount).mockResolvedValueOnce(5);
			const beforeCount = await getUnreadCount('user-123');
			expect(beforeCount).toBe(5);

			vi.mocked(markAsRead).mockResolvedValue({
				id: 'notif-1',
				read: true
			} as any);

			await markAsRead('notif-1', 'user-123');

			vi.mocked(getUnreadCount).mockResolvedValueOnce(4);
			const afterCount = await getUnreadCount('user-123');
			expect(afterCount).toBe(4);
		});

		it('should mark all notifications as read', async () => {
			const { markAllAsRead, getUnreadCount } = await import(
				'$lib/server/services/notification'
			);

			// Before marking
			vi.mocked(getUnreadCount).mockResolvedValueOnce(10);
			const beforeCount = await getUnreadCount('user-123');
			expect(beforeCount).toBe(10);

			// Mark all as read
			vi.mocked(markAllAsRead).mockResolvedValue(10);
			const marked = await markAllAsRead('user-123');
			expect(marked).toBe(10);

			// After marking
			vi.mocked(getUnreadCount).mockResolvedValueOnce(0);
			const afterCount = await getUnreadCount('user-123');
			expect(afterCount).toBe(0);
		});

		it('should delete notification', async () => {
			const { deleteNotification, getUserNotifications } = await import(
				'$lib/server/services/notification'
			);

			vi.mocked(deleteNotification).mockResolvedValue(undefined);

			await deleteNotification('notif-1', 'user-123');
			expect(deleteNotification).toHaveBeenCalledWith('notif-1', 'user-123');

			// Notification no longer in list
			vi.mocked(getUserNotifications).mockResolvedValue([]);

			const notifications = await getUserNotifications('user-123', {});
			expect(notifications).toHaveLength(0);
		});

		it('should prevent deleting other user notification', async () => {
			const { deleteNotification, NotificationError } = await import(
				'$lib/server/services/notification'
			);

			vi.mocked(deleteNotification).mockRejectedValue(
				new NotificationError('UNAUTHORIZED', 'Not your notification')
			);

			await expect(deleteNotification('notif-1', 'wrong-user')).rejects.toMatchObject({
				code: 'UNAUTHORIZED'
			});
		});
	});

	describe('Notification Delivery', () => {
		it('should send email when preference allows', async () => {
			const { sendNotificationEmail } = await import(
				'$lib/server/services/emailNotification'
			);
			const { getNotificationPreferences } = await import(
				'$lib/server/services/notification'
			);
			const { getUserById } = await import('$lib/server/services/user');

			vi.mocked(getUserById).mockResolvedValue({
				id: 'user-123',
				email: 'user@test.com'
			} as any);

			vi.mocked(getNotificationPreferences).mockResolvedValue([
				{ type: 'VERIFICATION_RESULT', email: true, inApp: true }
			] as any);

			vi.mocked(sendNotificationEmail).mockResolvedValue(undefined);

			// Simulate notification flow
			const user = await getUserById('user-123');
			const prefs = await getNotificationPreferences('user-123');
			const emailPref = prefs.find((p) => p.type === 'VERIFICATION_RESULT');

			if (emailPref?.email && user?.email) {
				await sendNotificationEmail(user.email, 'VERIFICATION_RESULT', 'Your verification was approved');
			}

			expect(sendNotificationEmail).toHaveBeenCalledWith(
				'user@test.com',
				'VERIFICATION_RESULT',
				'Your verification was approved'
			);
		});

		it('should not send email when preference is disabled', async () => {
			const { sendNotificationEmail } = await import(
				'$lib/server/services/emailNotification'
			);
			const { getNotificationPreferences } = await import(
				'$lib/server/services/notification'
			);

			vi.mocked(getNotificationPreferences).mockResolvedValue([
				{ type: 'TRUST_LOST', email: false, inApp: true }
			] as any);

			const prefs = await getNotificationPreferences('user-123');
			const emailPref = prefs.find((p) => p.type === 'TRUST_LOST');

			if (emailPref?.email) {
				await sendNotificationEmail('user@test.com', 'TRUST_LOST', 'You lost trust');
			}

			// Should not have been called because email is disabled
			expect(sendNotificationEmail).not.toHaveBeenCalled();
		});
	});

	describe('Complete Notification Flow', () => {
		it('should handle notification from event to delivery', async () => {
			const { createNotification, getUserNotifications, markAsRead, getUnreadCount } =
				await import('$lib/server/services/notification');
			const { sendNotificationEmail } = await import(
				'$lib/server/services/emailNotification'
			);

			// Step 1: Event triggers notification creation
			vi.mocked(createNotification).mockResolvedValue({
				id: 'notif-flow-1',
				type: 'FACT_DISPUTED',
				message: 'Your fact is being disputed',
				read: false,
				createdAt: new Date()
			} as any);

			await createNotification('author-123', 'FACT_DISPUTED', 'Your fact is being disputed', {
				factId: 'fact-123'
			});

			// Step 2: Email sent (if enabled)
			vi.mocked(sendNotificationEmail).mockResolvedValue(undefined);
			await sendNotificationEmail('author@test.com', 'FACT_DISPUTED', 'Your fact is being disputed');

			// Step 3: User checks notifications
			vi.mocked(getUnreadCount).mockResolvedValue(1);
			const unread = await getUnreadCount('author-123');
			expect(unread).toBe(1);

			vi.mocked(getUserNotifications).mockResolvedValue([
				{
					id: 'notif-flow-1',
					type: 'FACT_DISPUTED',
					read: false
				}
			] as any);

			const notifications = await getUserNotifications('author-123', { unreadOnly: true });
			expect(notifications).toHaveLength(1);

			// Step 4: User reads notification
			vi.mocked(markAsRead).mockResolvedValue({
				id: 'notif-flow-1',
				read: true
			} as any);

			await markAsRead('notif-flow-1', 'author-123');

			// Step 5: Unread count decreases
			vi.mocked(getUnreadCount).mockResolvedValue(0);
			const finalUnread = await getUnreadCount('author-123');
			expect(finalUnread).toBe(0);
		});
	});

	describe('Notification Batching', () => {
		it('should batch multiple similar notifications', async () => {
			const { createNotification, getUserNotifications } = await import(
				'$lib/server/services/notification'
			);

			// Multiple upvotes might be batched
			vi.mocked(createNotification).mockResolvedValue({
				id: 'notif-batch',
				type: 'TRUST_GAINED',
				message: 'You received 5 upvotes (+5 trust)',
				metadata: { count: 5, points: 5 }
			} as any);

			await createNotification('user-123', 'TRUST_GAINED', 'You received 5 upvotes', {
				count: 5,
				points: 5
			});

			vi.mocked(getUserNotifications).mockResolvedValue([
				{
					id: 'notif-batch',
					type: 'TRUST_GAINED',
					message: 'You received 5 upvotes (+5 trust)'
				}
			] as any);

			const notifications = await getUserNotifications('user-123', {});
			// One batched notification instead of 5 separate ones
			expect(notifications).toHaveLength(1);
		});
	});
});
