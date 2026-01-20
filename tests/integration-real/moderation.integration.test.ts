/**
 * Moderation Service Integration Tests
 *
 * These tests hit the REAL database - no mocks!
 */

import { describe, it, expect } from 'vitest';
import { setupIntegrationTest, testDb, createTestUser, createTestFact } from './db-setup';

describe('Moderation Service - Real DB Integration', () => {
	setupIntegrationTest();

	describe('Moderation Queue', () => {
		it('should create a moderation queue item', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });

			const queueItem = await testDb.moderationQueueItem.create({
				data: {
					type: 'REPORTED_CONTENT',
					contentType: 'fact',
					contentId: fact.id,
					reason: 'This fact contains misinformation',
					status: 'PENDING'
				}
			});

			expect(queueItem.id).toBeDefined();
			expect(queueItem.type).toBe('REPORTED_CONTENT');
			expect(queueItem.status).toBe('PENDING');
		});

		it('should update queue item status', async () => {
			const user = await createTestUser();
			const moderator = await createTestUser({ email: 'mod@test.com', userType: 'MODERATOR' });
			const fact = await createTestFact({ userId: user.id });

			const queueItem = await testDb.moderationQueueItem.create({
				data: {
					type: 'REPORTED_CONTENT',
					contentType: 'fact',
					contentId: fact.id,
					reason: 'Test report',
					status: 'PENDING'
				}
			});

			const updated = await testDb.moderationQueueItem.update({
				where: { id: queueItem.id },
				data: {
					status: 'IN_PROGRESS',
					assignedToId: moderator.id
				}
			});

			expect(updated.status).toBe('IN_PROGRESS');
			expect(updated.assignedToId).toBe(moderator.id);
		});

		it('should resolve queue item', async () => {
			const user = await createTestUser();
			const moderator = await createTestUser({ email: 'mod@test.com', userType: 'MODERATOR' });
			const fact = await createTestFact({ userId: user.id });

			const queueItem = await testDb.moderationQueueItem.create({
				data: {
					type: 'REPORTED_CONTENT',
					contentType: 'fact',
					contentId: fact.id,
					reason: 'Test report',
					status: 'PENDING'
				}
			});

			const resolved = await testDb.moderationQueueItem.update({
				where: { id: queueItem.id },
				data: {
					status: 'RESOLVED',
					assignedToId: moderator.id,
					resolvedAt: new Date(),
					resolution: 'Report found to be valid. Content removed.'
				}
			});

			expect(resolved.status).toBe('RESOLVED');
			expect(resolved.resolvedAt).not.toBeNull();
		});

		it('should find pending queue items', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });

			await testDb.moderationQueueItem.createMany({
				data: [
					{ type: 'REPORTED_CONTENT', contentType: 'fact', contentId: fact.id, reason: 'Report 1', status: 'PENDING' },
					{ type: 'EDIT_REQUEST', contentType: 'fact', contentId: fact.id, reason: 'Edit 1', status: 'PENDING' },
					{ type: 'REPORTED_CONTENT', contentType: 'fact', contentId: fact.id, reason: 'Report 2', status: 'RESOLVED' }
				]
			});

			const pending = await testDb.moderationQueueItem.findMany({
				where: { status: 'PENDING' }
			});

			expect(pending).toHaveLength(2);
		});

		it('should filter queue by type', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });

			await testDb.moderationQueueItem.createMany({
				data: [
					{ type: 'REPORTED_CONTENT', contentType: 'fact', contentId: fact.id, reason: 'Report', status: 'PENDING' },
					{ type: 'VETO_REVIEW', contentType: 'fact', contentId: fact.id, reason: 'Veto', status: 'PENDING' }
				]
			});

			const reports = await testDb.moderationQueueItem.findMany({
				where: { type: 'REPORTED_CONTENT' }
			});

			expect(reports).toHaveLength(1);
		});

		it('should set priority on queue items', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });

			const highPriority = await testDb.moderationQueueItem.create({
				data: {
					type: 'REPORTED_CONTENT',
					contentType: 'fact',
					contentId: fact.id,
					reason: 'Urgent',
					priority: 10,
					status: 'PENDING'
				}
			});

			const lowPriority = await testDb.moderationQueueItem.create({
				data: {
					type: 'REPORTED_CONTENT',
					contentType: 'fact',
					contentId: fact.id,
					reason: 'Normal',
					priority: 0,
					status: 'PENDING'
				}
			});

			const sorted = await testDb.moderationQueueItem.findMany({
				orderBy: { priority: 'desc' }
			});

			expect(sorted[0].id).toBe(highPriority.id);
		});

		it('should store additional details as JSON', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });

			const queueItem = await testDb.moderationQueueItem.create({
				data: {
					type: 'REPORTED_CONTENT',
					contentType: 'fact',
					contentId: fact.id,
					reason: 'Report with details',
					details: { reporterEmail: 'anon@test.com', ipAddress: '192.168.1.1' },
					status: 'PENDING'
				}
			});

			expect(queueItem.details).toEqual({ reporterEmail: 'anon@test.com', ipAddress: '192.168.1.1' });
		});
	});

	describe('Ban System', () => {
		it('should create a ban record', async () => {
			const moderator = await createTestUser({ email: 'mod@test.com', userType: 'MODERATOR' });
			const user = await createTestUser({ email: 'banned@test.com' });

			const ban = await testDb.ban.create({
				data: {
					userId: user.id,
					level: 1,
					reason: 'Multiple violations',
					bannedById: moderator.id,
					expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
				}
			});

			expect(ban.id).toBeDefined();
			expect(ban.level).toBe(1);
		});

		it('should track ban history', async () => {
			const moderator = await createTestUser({ email: 'mod@test.com', userType: 'MODERATOR' });
			const user = await createTestUser({ email: 'repeat@test.com' });

			// First ban (expired)
			await testDb.ban.create({
				data: {
					userId: user.id,
					level: 1,
					reason: 'First offense',
					bannedById: moderator.id,
					expiresAt: new Date(Date.now() - 86400000) // Yesterday
				}
			});

			// Second ban (active)
			await testDb.ban.create({
				data: {
					userId: user.id,
					level: 2,
					reason: 'Repeat offense',
					bannedById: moderator.id,
					expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
				}
			});

			const banHistory = await testDb.ban.findMany({
				where: { userId: user.id },
				orderBy: { createdAt: 'asc' }
			});

			expect(banHistory).toHaveLength(2);
			expect(banHistory[1].level).toBe(2);
		});

		it('should find active bans', async () => {
			const moderator = await createTestUser({ email: 'mod@test.com', userType: 'MODERATOR' });
			const user1 = await createTestUser({ email: 'user1@test.com' });
			const user2 = await createTestUser({ email: 'user2@test.com' });

			// Active ban
			await testDb.ban.create({
				data: {
					userId: user1.id,
					level: 1,
					reason: 'Active',
					bannedById: moderator.id,
					expiresAt: new Date(Date.now() + 86400000) // Tomorrow
				}
			});

			// Expired ban
			await testDb.ban.create({
				data: {
					userId: user2.id,
					level: 1,
					reason: 'Expired',
					bannedById: moderator.id,
					expiresAt: new Date(Date.now() - 86400000) // Yesterday
				}
			});

			const activeBans = await testDb.ban.findMany({
				where: {
					expiresAt: { gt: new Date() }
				}
			});

			expect(activeBans).toHaveLength(1);
			expect(activeBans[0].reason).toBe('Active');
		});

		it('should create permanent ban', async () => {
			const moderator = await createTestUser({ email: 'mod@test.com', userType: 'MODERATOR' });
			const user = await createTestUser({ email: 'perm@test.com' });

			const permanentBan = await testDb.ban.create({
				data: {
					userId: user.id,
					level: 3,
					reason: 'Severe violation - permanent ban',
					bannedById: moderator.id,
					expiresAt: null // Permanent
				}
			});

			expect(permanentBan.level).toBe(3);
			expect(permanentBan.expiresAt).toBeNull();
		});

		it('should find permanent bans', async () => {
			const moderator = await createTestUser({ email: 'mod@test.com', userType: 'MODERATOR' });
			const user = await createTestUser({ email: 'permuser@test.com' });

			await testDb.ban.create({
				data: {
					userId: user.id,
					level: 3,
					reason: 'Permanent',
					bannedById: moderator.id,
					expiresAt: null
				}
			});

			const permanentBans = await testDb.ban.findMany({
				where: { expiresAt: null }
			});

			expect(permanentBans.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe('Banned Emails', () => {
		it('should ban an email address', async () => {
			const bannedEmail = await testDb.bannedEmail.create({
				data: { email: 'banned@example.com' }
			});

			expect(bannedEmail.id).toBeDefined();
		});

		it('should enforce unique email constraint', async () => {
			await testDb.bannedEmail.create({
				data: { email: 'unique@example.com' }
			});

			await expect(
				testDb.bannedEmail.create({
					data: { email: 'unique@example.com' }
				})
			).rejects.toThrow();
		});

		it('should check if email is banned', async () => {
			await testDb.bannedEmail.create({
				data: { email: 'check@example.com' }
			});

			const found = await testDb.bannedEmail.findUnique({
				where: { email: 'check@example.com' }
			});

			const notFound = await testDb.bannedEmail.findUnique({
				where: { email: 'notbanned@example.com' }
			});

			expect(found).not.toBeNull();
			expect(notFound).toBeNull();
		});
	});

	describe('Banned IPs', () => {
		it('should ban an IP hash', async () => {
			const bannedIp = await testDb.bannedIp.create({
				data: { ipHash: 'hashvalue123' }
			});

			expect(bannedIp.id).toBeDefined();
		});

		it('should check if IP is banned', async () => {
			await testDb.bannedIp.create({
				data: { ipHash: 'blockedip456' }
			});

			const found = await testDb.bannedIp.findUnique({
				where: { ipHash: 'blockedip456' }
			});

			expect(found).not.toBeNull();
		});
	});

	describe('Account Flags', () => {
		it('should flag an account', async () => {
			const user = await createTestUser();

			const flag = await testDb.accountFlag.create({
				data: {
					userId: user.id,
					reason: 'Suspicious activity',
					details: 'Multiple failed login attempts',
					status: 'PENDING'
				}
			});

			expect(flag.id).toBeDefined();
			expect(flag.status).toBe('PENDING');
		});

		it('should resolve account flag', async () => {
			const user = await createTestUser();
			const reviewer = await createTestUser({ email: 'reviewer@test.com', userType: 'MODERATOR' });

			const flag = await testDb.accountFlag.create({
				data: {
					userId: user.id,
					reason: 'Test flag',
					status: 'PENDING'
				}
			});

			const resolved = await testDb.accountFlag.update({
				where: { id: flag.id },
				data: {
					status: 'RESOLVED',
					reviewedById: reviewer.id,
					resolution: 'False positive - no action needed'
				}
			});

			expect(resolved.status).toBe('RESOLVED');
			expect(resolved.reviewedById).toBe(reviewer.id);
		});

		it('should find pending flags', async () => {
			const user1 = await createTestUser({ email: 'u1@test.com' });
			const user2 = await createTestUser({ email: 'u2@test.com' });

			await testDb.accountFlag.createMany({
				data: [
					{ userId: user1.id, reason: 'Flag 1', status: 'PENDING' },
					{ userId: user2.id, reason: 'Flag 2', status: 'RESOLVED' }
				]
			});

			const pending = await testDb.accountFlag.findMany({
				where: { status: 'PENDING' }
			});

			expect(pending).toHaveLength(1);
		});
	});

	describe('Queue Statistics', () => {
		it('should count items by status', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });

			await testDb.moderationQueueItem.createMany({
				data: [
					{ type: 'REPORTED_CONTENT', contentType: 'fact', contentId: fact.id, reason: 'R1', status: 'PENDING' },
					{ type: 'REPORTED_CONTENT', contentType: 'fact', contentId: fact.id, reason: 'R2', status: 'PENDING' },
					{ type: 'REPORTED_CONTENT', contentType: 'fact', contentId: fact.id, reason: 'R3', status: 'IN_PROGRESS' },
					{ type: 'REPORTED_CONTENT', contentType: 'fact', contentId: fact.id, reason: 'R4', status: 'RESOLVED' }
				]
			});

			const statusCounts = await testDb.moderationQueueItem.groupBy({
				by: ['status'],
				_count: { id: true }
			});

			const pending = statusCounts.find(s => s.status === 'PENDING');
			const resolved = statusCounts.find(s => s.status === 'RESOLVED');

			expect(pending?._count.id).toBe(2);
			expect(resolved?._count.id).toBe(1);
		});

		it('should count items by type', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });

			await testDb.moderationQueueItem.createMany({
				data: [
					{ type: 'REPORTED_CONTENT', contentType: 'fact', contentId: fact.id, reason: 'R', status: 'PENDING' },
					{ type: 'REPORTED_CONTENT', contentType: 'fact', contentId: fact.id, reason: 'R', status: 'PENDING' },
					{ type: 'EDIT_REQUEST', contentType: 'fact', contentId: fact.id, reason: 'E', status: 'PENDING' },
					{ type: 'VETO_REVIEW', contentType: 'fact', contentId: fact.id, reason: 'V', status: 'PENDING' }
				]
			});

			const typeCounts = await testDb.moderationQueueItem.groupBy({
				by: ['type'],
				_count: { id: true }
			});

			const reports = typeCounts.find(t => t.type === 'REPORTED_CONTENT');
			expect(reports?._count.id).toBe(2);
		});
	});
});
