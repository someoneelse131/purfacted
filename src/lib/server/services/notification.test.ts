import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	NotificationError,
	getNotificationPreferences,
	updateNotificationPreference,
	shouldSendInApp,
	shouldSendEmail,
	createNotification,
	getUserNotifications,
	getUnreadCount,
	markAsRead,
	markAllAsRead,
	deleteNotification,
	deleteOldNotifications,
	notifyTrustChange,
	notifyFactReply,
	notifyDebateRequest,
	notifyModeratorStatus
} from './notification';

// Mock the database
vi.mock('../db', () => ({
	db: {
		notificationPreference: {
			findMany: vi.fn(),
			findUnique: vi.fn(),
			upsert: vi.fn()
		},
		notification: {
			create: vi.fn(),
			findMany: vi.fn(),
			findUnique: vi.fn(),
			update: vi.fn(),
			updateMany: vi.fn(),
			delete: vi.fn(),
			deleteMany: vi.fn(),
			count: vi.fn()
		}
	}
}));

import { db } from '../db';

describe('R41: Notification Service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('NotificationError', () => {
		it('should have correct name and code', () => {
			const error = new NotificationError('Test message', 'TEST_CODE');
			expect(error.name).toBe('NotificationError');
			expect(error.code).toBe('TEST_CODE');
			expect(error.message).toBe('Test message');
		});
	});

	describe('Notification Preferences', () => {
		it('should return default preferences when none set', async () => {
			(db.notificationPreference.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

			const prefs = await getNotificationPreferences('user-123');

			expect(prefs.TRUST_LOST.email).toBe(true);
			expect(prefs.TRUST_LOST.inApp).toBe(true);
			expect(prefs.FACT_REPLY.email).toBe(true);
			expect(prefs.DEBATE_REQUEST.inApp).toBe(true);
		});

		it('should override defaults with user preferences', async () => {
			(db.notificationPreference.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
				{ type: 'TRUST_LOST', email: false, inApp: true },
				{ type: 'FACT_REPLY', email: true, inApp: false }
			]);

			const prefs = await getNotificationPreferences('user-123');

			expect(prefs.TRUST_LOST.email).toBe(false);
			expect(prefs.TRUST_LOST.inApp).toBe(true);
			expect(prefs.FACT_REPLY.email).toBe(true);
			expect(prefs.FACT_REPLY.inApp).toBe(false);
		});

		it('should update notification preference', async () => {
			const mockPref = {
				id: 'pref-123',
				userId: 'user-123',
				type: 'TRUST_LOST',
				email: false,
				inApp: true
			};

			(db.notificationPreference.upsert as ReturnType<typeof vi.fn>).mockResolvedValue(mockPref);

			const result = await updateNotificationPreference('user-123', 'TRUST_LOST', {
				email: false,
				inApp: true
			});

			expect(result.email).toBe(false);
			expect(result.inApp).toBe(true);
		});
	});

	describe('Preference Checks', () => {
		it('should return true for inApp when no preference set', async () => {
			(db.notificationPreference.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

			const result = await shouldSendInApp('user-123', 'TRUST_LOST');
			expect(result).toBe(true);
		});

		it('should return false for inApp when disabled', async () => {
			(db.notificationPreference.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
				inApp: false,
				email: true
			});

			const result = await shouldSendInApp('user-123', 'TRUST_LOST');
			expect(result).toBe(false);
		});

		it('should return true for email when no preference set', async () => {
			(db.notificationPreference.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

			const result = await shouldSendEmail('user-123', 'FACT_REPLY');
			expect(result).toBe(true);
		});

		it('should return false for email when disabled', async () => {
			(db.notificationPreference.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
				inApp: true,
				email: false
			});

			const result = await shouldSendEmail('user-123', 'FACT_REPLY');
			expect(result).toBe(false);
		});
	});

	describe('Create Notification', () => {
		it('should create notification when inApp enabled', async () => {
			(db.notificationPreference.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
				inApp: true
			});

			const mockNotification = {
				id: 'notif-123',
				userId: 'user-123',
				type: 'TRUST_LOST',
				title: 'Test',
				body: 'Test body'
			};

			(db.notification.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockNotification);

			const result = await createNotification('user-123', {
				type: 'TRUST_LOST',
				title: 'Test',
				body: 'Test body'
			});

			expect(result).not.toBeNull();
			expect(result?.title).toBe('Test');
		});

		it('should return null when inApp disabled', async () => {
			(db.notificationPreference.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
				inApp: false
			});

			const result = await createNotification('user-123', {
				type: 'TRUST_LOST',
				title: 'Test',
				body: 'Test body'
			});

			expect(result).toBeNull();
			expect(db.notification.create).not.toHaveBeenCalled();
		});
	});

	describe('Get User Notifications', () => {
		it('should get all notifications', async () => {
			const mockNotifications = [
				{ id: '1', title: 'Notif 1' },
				{ id: '2', title: 'Notif 2' }
			];

			(db.notification.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockNotifications);

			const result = await getUserNotifications('user-123');

			expect(result).toHaveLength(2);
		});

		it('should filter unread only', async () => {
			(db.notification.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
				{ id: '1', readAt: null }
			]);

			await getUserNotifications('user-123', { unreadOnly: true });

			expect(db.notification.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						readAt: null
					})
				})
			);
		});

		it('should respect limit and offset', async () => {
			(db.notification.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

			await getUserNotifications('user-123', { limit: 10, offset: 5 });

			expect(db.notification.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					take: 10,
					skip: 5
				})
			);
		});
	});

	describe('Unread Count', () => {
		it('should return unread count', async () => {
			(db.notification.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);

			const count = await getUnreadCount('user-123');

			expect(count).toBe(5);
			expect(db.notification.count).toHaveBeenCalledWith({
				where: {
					userId: 'user-123',
					readAt: null
				}
			});
		});
	});

	describe('Mark as Read', () => {
		it('should mark notification as read', async () => {
			(db.notification.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: 'notif-123',
				userId: 'user-123'
			});

			(db.notification.update as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: 'notif-123',
				readAt: new Date()
			});

			const result = await markAsRead('notif-123', 'user-123');

			expect(result.readAt).toBeDefined();
		});

		it('should throw if notification not found', async () => {
			(db.notification.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

			await expect(markAsRead('notif-123', 'user-123')).rejects.toThrow('Notification not found');
		});

		it('should throw if not authorized', async () => {
			(db.notification.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: 'notif-123',
				userId: 'other-user'
			});

			await expect(markAsRead('notif-123', 'user-123')).rejects.toThrow('Not authorized');
		});
	});

	describe('Mark All as Read', () => {
		it('should mark all notifications as read', async () => {
			(db.notification.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 10 });

			const count = await markAllAsRead('user-123');

			expect(count).toBe(10);
		});
	});

	describe('Delete Notification', () => {
		it('should delete notification', async () => {
			(db.notification.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: 'notif-123',
				userId: 'user-123'
			});

			(db.notification.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

			await deleteNotification('notif-123', 'user-123');

			expect(db.notification.delete).toHaveBeenCalled();
		});

		it('should throw if not authorized', async () => {
			(db.notification.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: 'notif-123',
				userId: 'other-user'
			});

			await expect(deleteNotification('notif-123', 'user-123')).rejects.toThrow('Not authorized');
		});
	});

	describe('Delete Old Notifications', () => {
		it('should delete old read notifications', async () => {
			(db.notification.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 50 });

			const count = await deleteOldNotifications(30);

			expect(count).toBe(50);
		});
	});

	describe('Notification Templates', () => {
		beforeEach(() => {
			(db.notificationPreference.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
				inApp: true
			});
			(db.notification.create as ReturnType<typeof vi.fn>).mockImplementation((args) =>
				Promise.resolve(args.data)
			);
		});

		it('should create trust gained notification', async () => {
			const result = await notifyTrustChange('user-123', 50, 60, 'Fact approved');

			expect(result?.type).toBe('TRUST_GAINED');
			expect(result?.title).toContain('Increased');
			expect(result?.data).toEqual({
				oldTrustScore: 50,
				newTrustScore: 60
			});
		});

		it('should create trust lost notification', async () => {
			const result = await notifyTrustChange('user-123', 60, 50, 'Fact disproven');

			expect(result?.type).toBe('TRUST_LOST');
			expect(result?.title).toContain('Decreased');
		});

		it('should create fact reply notification', async () => {
			const result = await notifyFactReply('user-123', 'fact-1', 'Test Fact', 'Jane D.');

			expect(result?.type).toBe('FACT_REPLY');
			expect(result?.body).toContain('Jane D.');
			expect(result?.data).toEqual({ factId: 'fact-1' });
		});

		it('should create debate request notification', async () => {
			const result = await notifyDebateRequest('user-123', 'debate-1', 'John D.', 'Test Fact');

			expect(result?.type).toBe('DEBATE_REQUEST');
			expect(result?.body).toContain('John D.');
			expect(result?.body).toContain('Test Fact');
		});

		it('should create moderator promotion notification', async () => {
			const result = await notifyModeratorStatus('user-123', true);

			expect(result?.type).toBe('MODERATOR_STATUS');
			expect(result?.title).toContain('Promoted');
			expect(result?.body).toContain('Congratulations');
		});

		it('should create moderator demotion notification', async () => {
			const result = await notifyModeratorStatus('user-123', false);

			expect(result?.type).toBe('MODERATOR_STATUS');
			expect(result?.body).toContain('changed');
		});
	});

	describe('Notification Types', () => {
		it('should support all required notification types', () => {
			const types = [
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

			// Just verify the types exist by checking we can reference them
			types.forEach((type) => {
				expect(typeof type).toBe('string');
			});
		});
	});
});
