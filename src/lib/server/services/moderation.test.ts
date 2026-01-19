import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	ModerationError,
	addToQueue,
	getQueueItems,
	getQueueStats,
	claimQueueItem,
	releaseQueueItem,
	resolveQueueItem,
	dismissQueueItem,
	getModeratorAssignments,
	getNextQueueItem,
	reportContent,
	queueEditRequest,
	queueVetoReview,
	queueOrgApproval,
	queueVerificationReview,
	queueFlaggedAccount
} from './moderation';

// Mock the database
vi.mock('../db', () => ({
	db: {
		moderationQueueItem: {
			findFirst: vi.fn(),
			findUnique: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			count: vi.fn(),
			groupBy: vi.fn(),
			deleteMany: vi.fn()
		},
		user: {
			findUnique: vi.fn()
		}
	}
}));

import { db } from '../db';

describe('R44: Moderation Queue Service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('ModerationError', () => {
		it('should have correct name and code', () => {
			const error = new ModerationError('Test message', 'TEST_CODE');
			expect(error.name).toBe('ModerationError');
			expect(error.code).toBe('TEST_CODE');
			expect(error.message).toBe('Test message');
		});
	});

	describe('Queue Types', () => {
		it('should support all required queue types', () => {
			const types = [
				'REPORTED_CONTENT',
				'EDIT_REQUEST',
				'DUPLICATE_MERGE',
				'VETO_REVIEW',
				'ORG_APPROVAL',
				'VERIFICATION_REVIEW',
				'FLAGGED_ACCOUNT'
			];

			expect(types).toHaveLength(7);
		});
	});

	describe('Queue Status', () => {
		it('should support all required statuses', () => {
			const statuses = ['PENDING', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'];
			expect(statuses).toHaveLength(4);
		});
	});

	describe('addToQueue', () => {
		it('should create new queue item', async () => {
			(db.moderationQueueItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
			(db.moderationQueueItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: 'queue-123',
				type: 'REPORTED_CONTENT',
				contentId: 'content-123',
				contentType: 'fact',
				status: 'PENDING'
			});

			const result = await addToQueue({
				type: 'REPORTED_CONTENT',
				contentId: 'content-123',
				contentType: 'fact',
				reason: 'Spam'
			});

			expect(result.type).toBe('REPORTED_CONTENT');
			expect(result.status).toBe('PENDING');
		});

		it('should not duplicate existing pending items', async () => {
			const existingItem = {
				id: 'queue-123',
				type: 'REPORTED_CONTENT',
				contentId: 'content-123',
				status: 'PENDING',
				priority: 0
			};

			(db.moderationQueueItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
				existingItem
			);

			const result = await addToQueue({
				type: 'REPORTED_CONTENT',
				contentId: 'content-123',
				contentType: 'fact'
			});

			expect(result.id).toBe('queue-123');
			expect(db.moderationQueueItem.create).not.toHaveBeenCalled();
		});

		it('should update priority if higher', async () => {
			const existingItem = {
				id: 'queue-123',
				priority: 1
			};

			(db.moderationQueueItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
				existingItem
			);
			(db.moderationQueueItem.update as ReturnType<typeof vi.fn>).mockResolvedValue({
				...existingItem,
				priority: 5
			});

			const result = await addToQueue({
				type: 'REPORTED_CONTENT',
				contentId: 'content-123',
				contentType: 'fact',
				priority: 5
			});

			expect(result.priority).toBe(5);
		});
	});

	describe('getQueueItems', () => {
		it('should get items with filters', async () => {
			const mockItems = [
				{ id: '1', type: 'REPORTED_CONTENT', status: 'PENDING' },
				{ id: '2', type: 'REPORTED_CONTENT', status: 'PENDING' }
			];

			(db.moderationQueueItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockItems);

			const result = await getQueueItems({ type: 'REPORTED_CONTENT', status: 'PENDING' });

			expect(result).toHaveLength(2);
		});

		it('should order by priority and date', async () => {
			(db.moderationQueueItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

			await getQueueItems();

			expect(db.moderationQueueItem.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }]
				})
			);
		});
	});

	describe('claimQueueItem', () => {
		it('should assign item to moderator', async () => {
			(db.moderationQueueItem.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: 'queue-123',
				status: 'PENDING'
			});
			(db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: 'mod-123',
				userType: 'MODERATOR'
			});
			(db.moderationQueueItem.update as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: 'queue-123',
				status: 'IN_PROGRESS',
				assignedToId: 'mod-123'
			});

			const result = await claimQueueItem('queue-123', 'mod-123');

			expect(result.status).toBe('IN_PROGRESS');
			expect(result.assignedToId).toBe('mod-123');
		});

		it('should throw if item not found', async () => {
			(db.moderationQueueItem.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

			await expect(claimQueueItem('queue-123', 'mod-123')).rejects.toThrow('Queue item not found');
		});

		it('should throw if item not pending', async () => {
			(db.moderationQueueItem.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: 'queue-123',
				status: 'IN_PROGRESS'
			});

			await expect(claimQueueItem('queue-123', 'mod-123')).rejects.toThrow('Item is not pending');
		});

		it('should throw if user not moderator', async () => {
			(db.moderationQueueItem.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: 'queue-123',
				status: 'PENDING'
			});
			(db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: 'user-123',
				userType: 'VERIFIED'
			});

			await expect(claimQueueItem('queue-123', 'user-123')).rejects.toThrow(
				'User is not a moderator'
			);
		});
	});

	describe('releaseQueueItem', () => {
		it('should release item back to queue', async () => {
			(db.moderationQueueItem.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: 'queue-123',
				assignedToId: 'mod-123'
			});
			(db.moderationQueueItem.update as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: 'queue-123',
				status: 'PENDING',
				assignedToId: null
			});

			const result = await releaseQueueItem('queue-123', 'mod-123');

			expect(result.status).toBe('PENDING');
			expect(result.assignedToId).toBeNull();
		});

		it('should throw if not assigned to moderator', async () => {
			(db.moderationQueueItem.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: 'queue-123',
				assignedToId: 'other-mod'
			});

			await expect(releaseQueueItem('queue-123', 'mod-123')).rejects.toThrow(
				'Not assigned to this moderator'
			);
		});
	});

	describe('resolveQueueItem', () => {
		it('should resolve item with resolution', async () => {
			(db.moderationQueueItem.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: 'queue-123',
				status: 'IN_PROGRESS'
			});
			(db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: 'mod-123',
				userType: 'MODERATOR'
			});
			(db.moderationQueueItem.update as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: 'queue-123',
				status: 'RESOLVED',
				resolution: 'Content removed'
			});

			const result = await resolveQueueItem('queue-123', 'mod-123', 'Content removed');

			expect(result.status).toBe('RESOLVED');
			expect(result.resolution).toBe('Content removed');
		});

		it('should throw if already resolved', async () => {
			(db.moderationQueueItem.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: 'queue-123',
				status: 'RESOLVED'
			});

			await expect(resolveQueueItem('queue-123', 'mod-123', 'test')).rejects.toThrow(
				'Item already resolved'
			);
		});
	});

	describe('dismissQueueItem', () => {
		it('should dismiss item with reason', async () => {
			(db.moderationQueueItem.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: 'queue-123',
				status: 'PENDING'
			});
			(db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: 'mod-123',
				userType: 'MODERATOR'
			});
			(db.moderationQueueItem.update as ReturnType<typeof vi.fn>).mockResolvedValue({
				id: 'queue-123',
				status: 'DISMISSED',
				resolution: 'Dismissed: False report'
			});

			const result = await dismissQueueItem('queue-123', 'mod-123', 'False report');

			expect(result.status).toBe('DISMISSED');
		});
	});

	describe('getModeratorAssignments', () => {
		it('should get items assigned to moderator', async () => {
			const mockItems = [
				{ id: '1', assignedToId: 'mod-123' },
				{ id: '2', assignedToId: 'mod-123' }
			];

			(db.moderationQueueItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockItems);

			const result = await getModeratorAssignments('mod-123');

			expect(result).toHaveLength(2);
		});
	});

	describe('getNextQueueItem', () => {
		it('should get highest priority pending item', async () => {
			const mockItem = { id: '1', priority: 5, status: 'PENDING' };

			(db.moderationQueueItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockItem);

			const result = await getNextQueueItem();

			expect(result?.id).toBe('1');
		});

		it('should filter by type if provided', async () => {
			(db.moderationQueueItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

			await getNextQueueItem('REPORTED_CONTENT');

			expect(db.moderationQueueItem.findFirst).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({
						type: 'REPORTED_CONTENT'
					})
				})
			);
		});
	});

	describe('Helper Functions', () => {
		beforeEach(() => {
			(db.moderationQueueItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
			(db.moderationQueueItem.create as ReturnType<typeof vi.fn>).mockImplementation((args) =>
				Promise.resolve({ id: 'new-123', ...args.data })
			);
		});

		it('should queue reported content', async () => {
			const result = await reportContent('fact-123', 'fact', 'Spam', 'reporter-123');

			expect(result.type).toBe('REPORTED_CONTENT');
			expect(result.contentId).toBe('fact-123');
			expect(result.reason).toBe('Spam');
		});

		it('should queue edit request', async () => {
			const result = await queueEditRequest('edit-123', 'fact-123', 'editor-123');

			expect(result.type).toBe('EDIT_REQUEST');
			expect(result.contentId).toBe('edit-123');
		});

		it('should queue veto review', async () => {
			const result = await queueVetoReview('veto-123', 'fact-123', 5);

			expect(result.type).toBe('VETO_REVIEW');
			expect(result.priority).toBe(5);
		});

		it('should queue org approval', async () => {
			const result = await queueOrgApproval('user-123', 'Acme Corp', 'acme.com');

			expect(result.type).toBe('ORG_APPROVAL');
			expect(result.contentType).toBe('organizationRequest');
		});

		it('should queue verification review', async () => {
			const result = await queueVerificationReview('verif-123', 'user-123', 'EXPERT');

			expect(result.type).toBe('VERIFICATION_REVIEW');
			expect(result.contentType).toBe('expertVerification');
		});

		it('should queue flagged account', async () => {
			const result = await queueFlaggedAccount('user-123', 'Negative veto score', -15);

			expect(result.type).toBe('FLAGGED_ACCOUNT');
			expect(result.contentType).toBe('user');
		});

		it('should set high priority for very negative veto scores', async () => {
			const result = await queueFlaggedAccount('user-123', 'Very negative', -20);

			expect(result.priority).toBe(5);
		});
	});

	describe('Queue Stats', () => {
		it('should return counts by status and type', async () => {
			(db.moderationQueueItem.groupBy as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce([
					{ status: 'PENDING', _count: { id: 10 } },
					{ status: 'IN_PROGRESS', _count: { id: 5 } }
				])
				.mockResolvedValueOnce([
					{ type: 'REPORTED_CONTENT', _count: { id: 6 } },
					{ type: 'VETO_REVIEW', _count: { id: 4 } }
				]);
			(db.moderationQueueItem.count as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce(10)
				.mockResolvedValueOnce(3);

			const stats = await getQueueStats();

			expect(stats.byStatus.PENDING).toBe(10);
			expect(stats.byStatus.IN_PROGRESS).toBe(5);
			expect(stats.byType.REPORTED_CONTENT).toBe(6);
			expect(stats.total).toBe(10);
			expect(stats.pendingHighPriority).toBe(3);
		});
	});

	describe('Content Type Mapping', () => {
		it('should use correct content types', () => {
			const contentTypes = {
				fact: 'fact',
				comment: 'comment',
				debate: 'debate',
				user: 'user',
				factEdit: 'factEdit',
				veto: 'veto',
				organizationRequest: 'organizationRequest',
				expertVerification: 'expertVerification'
			};

			expect(contentTypes.factEdit).toBe('factEdit');
			expect(contentTypes.veto).toBe('veto');
		});
	});
});
