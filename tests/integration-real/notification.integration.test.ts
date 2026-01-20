/**
 * Notification Service Integration Tests
 *
 * These tests hit the REAL database - no mocks!
 */

import { describe, it, expect } from 'vitest';
import { setupIntegrationTest, testDb, createTestUser } from './db-setup';

describe('Notification Service - Real DB Integration', () => {
	setupIntegrationTest();

	describe('Notification CRUD Operations', () => {
		it('should create a notification', async () => {
			const user = await createTestUser();

			const notification = await testDb.notification.create({
				data: {
					userId: user.id,
					type: 'TRUST_GAINED',
					title: 'Trust Score Increased',
					body: 'Your trust score increased by 10 points.'
				}
			});

			expect(notification.id).toBeDefined();
			expect(notification.type).toBe('TRUST_GAINED');
			expect(notification.readAt).toBeNull();
		});

		it('should create notification with data payload', async () => {
			const user = await createTestUser();

			const notification = await testDb.notification.create({
				data: {
					userId: user.id,
					type: 'FACT_REPLY',
					title: 'New Reply',
					body: 'Someone replied to your fact.',
					data: { factId: 'abc123', commentId: 'xyz789' }
				}
			});

			expect(notification.data).toEqual({ factId: 'abc123', commentId: 'xyz789' });
		});

		it('should mark notification as read', async () => {
			const user = await createTestUser();

			const notification = await testDb.notification.create({
				data: {
					userId: user.id,
					type: 'DEBATE_REQUEST',
					title: 'Debate Invitation',
					body: 'You have been invited to a debate.'
				}
			});

			const updated = await testDb.notification.update({
				where: { id: notification.id },
				data: { readAt: new Date() }
			});

			expect(updated.readAt).not.toBeNull();
		});

		it('should delete notification', async () => {
			const user = await createTestUser();

			const notification = await testDb.notification.create({
				data: {
					userId: user.id,
					type: 'FACT_STATUS',
					title: 'Fact Approved',
					body: 'Your fact has been approved.'
				}
			});

			await testDb.notification.delete({ where: { id: notification.id } });

			const deleted = await testDb.notification.findUnique({ where: { id: notification.id } });
			expect(deleted).toBeNull();
		});
	});

	describe('Notification Types', () => {
		it('should create notifications of all types', async () => {
			const user = await createTestUser();

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
			] as const;

			for (const type of types) {
				await testDb.notification.create({
					data: {
						userId: user.id,
						type,
						title: `Test ${type}`,
						body: `Test notification for ${type}`
					}
				});
			}

			const allNotifications = await testDb.notification.findMany({
				where: { userId: user.id }
			});

			expect(allNotifications).toHaveLength(11);
		});
	});

	describe('User Notifications', () => {
		it('should get notifications for user', async () => {
			const user1 = await createTestUser({ email: 'user1@test.com' });
			const user2 = await createTestUser({ email: 'user2@test.com' });

			await testDb.notification.createMany({
				data: [
					{ userId: user1.id, type: 'TRUST_GAINED', title: 'N1', body: 'Body 1' },
					{ userId: user1.id, type: 'TRUST_LOST', title: 'N2', body: 'Body 2' },
					{ userId: user2.id, type: 'FACT_REPLY', title: 'N3', body: 'Body 3' }
				]
			});

			const user1Notifications = await testDb.notification.findMany({
				where: { userId: user1.id }
			});

			expect(user1Notifications).toHaveLength(2);
		});

		it('should get unread notifications', async () => {
			const user = await createTestUser();

			// Create some notifications
			const n1 = await testDb.notification.create({
				data: { userId: user.id, type: 'TRUST_GAINED', title: 'Unread 1', body: '' }
			});

			await testDb.notification.create({
				data: { userId: user.id, type: 'TRUST_LOST', title: 'Unread 2', body: '' }
			});

			// Mark one as read
			await testDb.notification.update({
				where: { id: n1.id },
				data: { readAt: new Date() }
			});

			const unreadCount = await testDb.notification.count({
				where: {
					userId: user.id,
					readAt: null
				}
			});

			expect(unreadCount).toBe(1);
		});

		it('should order notifications by creation date', async () => {
			const user = await createTestUser();

			await testDb.notification.create({
				data: { userId: user.id, type: 'TRUST_GAINED', title: 'First', body: '' }
			});

			// Small delay for different timestamps
			await new Promise(r => setTimeout(r, 10));

			await testDb.notification.create({
				data: { userId: user.id, type: 'TRUST_LOST', title: 'Second', body: '' }
			});

			await new Promise(r => setTimeout(r, 10));

			await testDb.notification.create({
				data: { userId: user.id, type: 'FACT_REPLY', title: 'Third', body: '' }
			});

			const notifications = await testDb.notification.findMany({
				where: { userId: user.id },
				orderBy: { createdAt: 'desc' }
			});

			expect(notifications[0].title).toBe('Third');
			expect(notifications[2].title).toBe('First');
		});

		it('should mark all notifications as read', async () => {
			const user = await createTestUser();

			await testDb.notification.createMany({
				data: [
					{ userId: user.id, type: 'TRUST_GAINED', title: 'N1', body: '' },
					{ userId: user.id, type: 'TRUST_LOST', title: 'N2', body: '' },
					{ userId: user.id, type: 'FACT_REPLY', title: 'N3', body: '' }
				]
			});

			// Mark all as read
			await testDb.notification.updateMany({
				where: {
					userId: user.id,
					readAt: null
				},
				data: { readAt: new Date() }
			});

			const unreadCount = await testDb.notification.count({
				where: {
					userId: user.id,
					readAt: null
				}
			});

			expect(unreadCount).toBe(0);
		});

		it('should cascade delete notifications when user is deleted', async () => {
			const user = await createTestUser();

			const notification = await testDb.notification.create({
				data: { userId: user.id, type: 'TRUST_GAINED', title: 'Test', body: '' }
			});

			await testDb.user.delete({ where: { id: user.id } });

			const deletedNotification = await testDb.notification.findUnique({
				where: { id: notification.id }
			});

			expect(deletedNotification).toBeNull();
		});
	});

	describe('Notification Preferences', () => {
		it('should create notification preference', async () => {
			const user = await createTestUser();

			const preference = await testDb.notificationPreference.create({
				data: {
					userId: user.id,
					type: 'TRUST_GAINED',
					email: true,
					inApp: true
				}
			});

			expect(preference.id).toBeDefined();
			expect(preference.email).toBe(true);
			expect(preference.inApp).toBe(true);
		});

		it('should enforce unique user-type preference', async () => {
			const user = await createTestUser();

			await testDb.notificationPreference.create({
				data: {
					userId: user.id,
					type: 'FACT_REPLY',
					email: true,
					inApp: true
				}
			});

			// Same user, same type should fail
			await expect(
				testDb.notificationPreference.create({
					data: {
						userId: user.id,
						type: 'FACT_REPLY',
						email: false,
						inApp: false
					}
				})
			).rejects.toThrow();
		});

		it('should update notification preference', async () => {
			const user = await createTestUser();

			const preference = await testDb.notificationPreference.create({
				data: {
					userId: user.id,
					type: 'DEBATE_REQUEST',
					email: true,
					inApp: true
				}
			});

			const updated = await testDb.notificationPreference.update({
				where: { id: preference.id },
				data: { email: false }
			});

			expect(updated.email).toBe(false);
			expect(updated.inApp).toBe(true);
		});

		it('should get all preferences for user', async () => {
			const user = await createTestUser();

			await testDb.notificationPreference.createMany({
				data: [
					{ userId: user.id, type: 'TRUST_GAINED', email: true, inApp: true },
					{ userId: user.id, type: 'TRUST_LOST', email: true, inApp: false },
					{ userId: user.id, type: 'FACT_REPLY', email: false, inApp: true }
				]
			});

			const preferences = await testDb.notificationPreference.findMany({
				where: { userId: user.id }
			});

			expect(preferences).toHaveLength(3);
		});

		it('should cascade delete preferences when user is deleted', async () => {
			const user = await createTestUser();

			const preference = await testDb.notificationPreference.create({
				data: {
					userId: user.id,
					type: 'FACT_STATUS',
					email: true,
					inApp: true
				}
			});

			await testDb.user.delete({ where: { id: user.id } });

			const deletedPreference = await testDb.notificationPreference.findUnique({
				where: { id: preference.id }
			});

			expect(deletedPreference).toBeNull();
		});

		it('should check if user wants email notification', async () => {
			const user = await createTestUser();

			await testDb.notificationPreference.create({
				data: {
					userId: user.id,
					type: 'DEBATE_PUBLISHED',
					email: false,
					inApp: true
				}
			});

			const preference = await testDb.notificationPreference.findFirst({
				where: {
					userId: user.id,
					type: 'DEBATE_PUBLISHED'
				}
			});

			expect(preference?.email).toBe(false);
		});
	});

	describe('Notification Queries', () => {
		it('should count notifications by type', async () => {
			const user = await createTestUser();

			await testDb.notification.createMany({
				data: [
					{ userId: user.id, type: 'TRUST_GAINED', title: 'T1', body: '' },
					{ userId: user.id, type: 'TRUST_GAINED', title: 'T2', body: '' },
					{ userId: user.id, type: 'TRUST_LOST', title: 'T3', body: '' },
					{ userId: user.id, type: 'FACT_REPLY', title: 'T4', body: '' }
				]
			});

			const typeCounts = await testDb.notification.groupBy({
				by: ['type'],
				where: { userId: user.id },
				_count: { id: true }
			});

			const trustGainedCount = typeCounts.find(t => t.type === 'TRUST_GAINED')?._count.id;
			expect(trustGainedCount).toBe(2);
		});

		it('should get recent notifications with limit', async () => {
			const user = await createTestUser();

			// Create 10 notifications
			for (let i = 0; i < 10; i++) {
				await testDb.notification.create({
					data: {
						userId: user.id,
						type: 'TRUST_GAINED',
						title: `Notification ${i}`,
						body: ''
					}
				});
				await new Promise(r => setTimeout(r, 5));
			}

			const recent = await testDb.notification.findMany({
				where: { userId: user.id },
				orderBy: { createdAt: 'desc' },
				take: 5
			});

			expect(recent).toHaveLength(5);
			expect(recent[0].title).toBe('Notification 9');
		});

		it('should filter notifications by date range', async () => {
			const user = await createTestUser();
			const now = new Date();
			const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
			const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

			await testDb.notification.create({
				data: {
					userId: user.id,
					type: 'TRUST_GAINED',
					title: 'Today',
					body: ''
				}
			});

			const todayNotifications = await testDb.notification.findMany({
				where: {
					userId: user.id,
					createdAt: {
						gte: yesterday,
						lte: tomorrow
					}
				}
			});

			expect(todayNotifications.length).toBeGreaterThanOrEqual(1);
		});
	});
});
