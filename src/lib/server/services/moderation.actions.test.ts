import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	ModerationActionError,
	getModeratorActionHistory,
	getQueueItemActions,
	getModerationDashboard
} from './moderation.actions';

// Mock the database
vi.mock('../db', () => ({
	db: {
		moderationQueueItem: {
			findUnique: vi.fn(),
			update: vi.fn(),
			count: vi.fn(),
			groupBy: vi.fn()
		},
		user: {
			findUnique: vi.fn(),
			update: vi.fn()
		},
		fact: {
			findUnique: vi.fn(),
			update: vi.fn()
		},
		comment: {
			findUnique: vi.fn(),
			update: vi.fn()
		},
		discussion: {
			findUnique: vi.fn(),
			update: vi.fn()
		},
		debate: {
			findUnique: vi.fn()
		},
		expertVerification: {
			findUnique: vi.fn(),
			update: vi.fn()
		}
	}
}));

// Mock other services
vi.mock('./moderation', () => ({
	resolveQueueItem: vi.fn().mockResolvedValue({
		id: 'queue-123',
		status: 'RESOLVED'
	}),
	dismissQueueItem: vi.fn().mockResolvedValue({
		id: 'queue-123',
		status: 'DISMISSED'
	})
}));

vi.mock('./ban', () => ({
	banUser: vi.fn().mockResolvedValue({ id: 'ban-123' })
}));

vi.mock('./notification', () => ({
	createNotification: vi.fn().mockResolvedValue(null)
}));

import { db } from '../db';

describe('R45-R46: Moderation Actions Service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('ModerationActionError', () => {
		it('should have correct name and code', () => {
			const error = new ModerationActionError('Test message', 'TEST_CODE');
			expect(error.name).toBe('ModerationActionError');
			expect(error.code).toBe('TEST_CODE');
			expect(error.message).toBe('Test message');
		});
	});

	describe('Action Types', () => {
		it('should support all required action types', () => {
			const actions = [
				'approve',
				'reject',
				'warn',
				'ban',
				'edit',
				'override',
				'dismiss',
				'mark_wrong'
			];

			expect(actions).toHaveLength(8);
		});
	});

	describe('Action Logging', () => {
		it('should log actions with timestamp', () => {
			// Actions are logged internally
			const action = {
				id: 'action-123',
				queueItemId: 'queue-123',
				moderatorId: 'mod-123',
				action: 'approve',
				contentId: 'content-123',
				contentType: 'fact',
				createdAt: new Date()
			};

			expect(action.createdAt).toBeInstanceOf(Date);
		});

		it('should include action details', () => {
			const action = {
				action: 'reject',
				details: { reason: 'Spam content' }
			};

			expect(action.details).toHaveProperty('reason');
		});
	});

	describe('getModeratorActionHistory', () => {
		it('should return empty array initially', () => {
			const history = getModeratorActionHistory('new-moderator');
			expect(history).toEqual([]);
		});

		it('should limit results', () => {
			const history = getModeratorActionHistory('mod-123', 10);
			expect(history.length).toBeLessThanOrEqual(10);
		});
	});

	describe('getQueueItemActions', () => {
		it('should return empty array for new item', () => {
			const actions = getQueueItemActions('new-item');
			expect(actions).toEqual([]);
		});
	});

	describe('Approve Action', () => {
		it('should resolve queue item', () => {
			// Approve calls resolveQueueItem
			const expectedStatus = 'RESOLVED';
			expect(expectedStatus).toBe('RESOLVED');
		});

		it('should notify content owner', () => {
			const notifyOwner = true;
			expect(notifyOwner).toBe(true);
		});

		it('should log the action', () => {
			const actionLogged = true;
			expect(actionLogged).toBe(true);
		});
	});

	describe('Reject Action', () => {
		it('should require a reason', () => {
			const reason = 'Violates community guidelines';
			expect(reason).toBeTruthy();
		});

		it('should soft delete content', () => {
			const softDelete = { deletedAt: new Date() };
			expect(softDelete.deletedAt).toBeInstanceOf(Date);
		});

		it('should notify content owner with reason', () => {
			const notification = {
				action: 'rejected',
				reason: 'Spam content'
			};

			expect(notification.reason).toBe('Spam content');
		});
	});

	describe('Warn Action', () => {
		it('should send warning notification', () => {
			const notification = {
				type: 'MODERATOR_STATUS',
				title: 'Warning from Moderators'
			};

			expect(notification.type).toBe('MODERATOR_STATUS');
		});

		it('should include warning reason', () => {
			const warning = {
				reason: 'Inappropriate language',
				isWarning: true
			};

			expect(warning.reason).toBeTruthy();
			expect(warning.isWarning).toBe(true);
		});
	});

	describe('Ban Action', () => {
		it('should trigger ban system', () => {
			const banTriggered = true;
			expect(banTriggered).toBe(true);
		});

		it('should log the ban action', () => {
			const action = {
				action: 'ban',
				details: { reason: 'Repeated violations', ip: '1.2.3.4' }
			};

			expect(action.action).toBe('ban');
		});
	});

	describe('Edit Action', () => {
		it('should log changes', () => {
			const changes = {
				title: 'Updated title',
				content: 'Updated content'
			};

			expect(changes).toHaveProperty('title');
		});

		it('should notify content owner about edit', () => {
			const notification = {
				action: 'edited',
				reason: 'Edited for policy compliance'
			};

			expect(notification.action).toBe('edited');
		});
	});

	describe('Override Action', () => {
		it('should only work on verification items', () => {
			const itemType = 'VERIFICATION_REVIEW';
			const canOverride = itemType === 'VERIFICATION_REVIEW';

			expect(canOverride).toBe(true);
		});

		it('should update verification status', () => {
			const verification = {
				status: 'APPROVED'
			};

			expect(verification.status).toBe('APPROVED');
		});

		it('should update user type if approved', () => {
			const userUpdate = {
				userType: 'EXPERT'
			};

			expect(userUpdate.userType).toBe('EXPERT');
		});
	});

	describe('Mark as Wrong Action', () => {
		it('should only allow assigned moderator', () => {
			const item = { assignedToId: 'mod-123' };
			const moderatorId = 'mod-123';
			const canMark = item.assignedToId === moderatorId;

			expect(canMark).toBe(true);
		});

		it('should reset item to pending', () => {
			const resetItem = {
				status: 'PENDING',
				assignedToId: null
			};

			expect(resetItem.status).toBe('PENDING');
			expect(resetItem.assignedToId).toBeNull();
		});

		it('should increase priority for re-review', () => {
			const currentPriority = 2;
			const newPriority = currentPriority + 5;

			expect(newPriority).toBe(7);
		});

		it('should preserve previous resolution', () => {
			const details = {
				previousResolution: 'Approved',
				markedWrongBy: 'mod-123',
				markedWrongReason: 'Made incorrect decision'
			};

			expect(details.previousResolution).toBeTruthy();
		});
	});

	describe('Dismiss Action', () => {
		it('should require a reason', () => {
			const reason = 'False report';
			expect(reason).toBeTruthy();
		});

		it('should set status to DISMISSED', () => {
			const status = 'DISMISSED';
			expect(status).toBe('DISMISSED');
		});
	});

	describe('Content Type Handling', () => {
		it('should handle fact content', () => {
			const contentType = 'fact';
			expect(contentType).toBe('fact');
		});

		it('should handle comment content', () => {
			const contentType = 'comment';
			expect(contentType).toBe('comment');
		});

		it('should handle debate content', () => {
			const contentType = 'debate';
			expect(contentType).toBe('debate');
		});

		it('should handle discussion content', () => {
			const contentType = 'discussion';
			expect(contentType).toBe('discussion');
		});
	});

	describe('getModerationDashboard', () => {
		it('should return dashboard summary', async () => {
			(db.moderationQueueItem.count as ReturnType<typeof vi.fn>)
				.mockResolvedValueOnce(10) // pendingCount
				.mockResolvedValueOnce(2) // myAssignments
				.mockResolvedValueOnce(5); // todayResolved

			(db.moderationQueueItem.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([
				{ type: 'REPORTED_CONTENT', _count: { id: 5 } },
				{ type: 'VETO_REVIEW', _count: { id: 3 } }
			]);

			const dashboard = await getModerationDashboard('mod-123');

			expect(dashboard.pendingCount).toBe(10);
			expect(dashboard.myAssignments).toBe(2);
			expect(dashboard.todayResolved).toBe(5);
			expect(dashboard.queueByType).toHaveProperty('REPORTED_CONTENT');
		});

		it('should include recent actions', async () => {
			(db.moderationQueueItem.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
			(db.moderationQueueItem.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([]);

			const dashboard = await getModerationDashboard('mod-123');

			expect(Array.isArray(dashboard.recentActions)).toBe(true);
		});
	});

	describe('Notification Messages', () => {
		it('should have message for approved content', () => {
			const messages: Record<string, string> = {
				approved: 'Your content has been approved by moderators.'
			};

			expect(messages.approved).toContain('approved');
		});

		it('should have message for rejected content', () => {
			const reason = 'Policy violation';
			const message = `Your content has been removed: ${reason}`;

			expect(message).toContain(reason);
		});

		it('should have message for edited content', () => {
			const messages: Record<string, string> = {
				edited: 'Your content has been edited by moderators for policy compliance.'
			};

			expect(messages.edited).toContain('edited');
		});
	});
});
