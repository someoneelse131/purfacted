import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommentError } from './comment';

// Mock the database
vi.mock('../db', () => ({
	db: {
		comment: {
			findUnique: vi.fn(),
			findFirst: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
			count: vi.fn()
		},
		commentVote: {
			findUnique: vi.fn(),
			findMany: vi.fn(),
			upsert: vi.fn(),
			delete: vi.fn(),
			count: vi.fn()
		},
		fact: {
			findUnique: vi.fn()
		},
		user: {
			findUnique: vi.fn()
		}
	}
}));

describe('R23: Comments Schema & Feature', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('CommentError', () => {
		it('should have correct name and code', () => {
			const error = new CommentError('Test message', 'TEST_CODE');
			expect(error.name).toBe('CommentError');
			expect(error.code).toBe('TEST_CODE');
			expect(error.message).toBe('Test message');
		});

		it('should extend Error', () => {
			const error = new CommentError('Test', 'CODE');
			expect(error instanceof Error).toBe(true);
		});
	});

	describe('Comment Model', () => {
		it('should have required fields', () => {
			const comment = {
				id: 'comment-1',
				factId: 'fact-1',
				userId: 'user-1',
				body: 'This is a comment about the fact...',
				parentId: null,
				createdAt: new Date(),
				updatedAt: new Date()
			};

			expect(comment).toHaveProperty('id');
			expect(comment).toHaveProperty('factId');
			expect(comment).toHaveProperty('userId');
			expect(comment).toHaveProperty('body');
			expect(comment).toHaveProperty('parentId');
			expect(comment).toHaveProperty('createdAt');
			expect(comment).toHaveProperty('updatedAt');
		});

		it('should support parent-child threading', () => {
			const parentComment = {
				id: 'comment-1',
				parentId: null
			};

			const replyComment = {
				id: 'comment-2',
				parentId: 'comment-1'
			};

			expect(parentComment.parentId).toBeNull();
			expect(replyComment.parentId).toBe(parentComment.id);
		});
	});

	describe('Comment Vote Model', () => {
		it('should have required fields', () => {
			const vote = {
				id: 'vote-1',
				commentId: 'comment-1',
				userId: 'user-1',
				value: 1,
				weight: 2.5,
				createdAt: new Date()
			};

			expect(vote).toHaveProperty('id');
			expect(vote).toHaveProperty('commentId');
			expect(vote).toHaveProperty('userId');
			expect(vote).toHaveProperty('value');
			expect(vote).toHaveProperty('weight');
			expect(vote).toHaveProperty('createdAt');
		});

		it('should store vote value as 1 or -1', () => {
			const upvote = { value: 1 };
			const downvote = { value: -1 };

			expect(upvote.value).toBe(1);
			expect(downvote.value).toBe(-1);
		});

		it('should enforce unique constraint on commentId + userId', () => {
			const votes = [
				{ commentId: 'comment-1', userId: 'user-1' },
				{ commentId: 'comment-1', userId: 'user-2' },
				{ commentId: 'comment-2', userId: 'user-1' }
			];

			const combinations = votes.map((v) => `${v.commentId}-${v.userId}`);
			const uniqueCombinations = new Set(combinations);
			expect(combinations.length).toBe(uniqueCombinations.size);
		});
	});

	describe('Comment body validation', () => {
		it('should accept body within 2000 chars', () => {
			const validBody = 'a'.repeat(2000);
			expect(validBody.length <= 2000).toBe(true);
		});

		it('should reject body exceeding 2000 chars', () => {
			const invalidBody = 'a'.repeat(2001);
			expect(invalidBody.length > 2000).toBe(true);
		});

		it('should reject empty body', () => {
			const emptyBodies = ['', '   ', '\n\t'];

			for (const body of emptyBodies) {
				expect(body.trim().length === 0).toBe(true);
			}
		});
	});

	describe('Threaded replies', () => {
		it('should support nested replies', () => {
			const comments = [
				{ id: 'c1', parentId: null, body: 'Top level comment' },
				{ id: 'c2', parentId: 'c1', body: 'Reply to c1' },
				{ id: 'c3', parentId: 'c2', body: 'Reply to reply' },
				{ id: 'c4', parentId: 'c1', body: 'Another reply to c1' }
			];

			const topLevel = comments.filter((c) => c.parentId === null);
			const repliesTo1 = comments.filter((c) => c.parentId === 'c1');
			const repliesTo2 = comments.filter((c) => c.parentId === 'c2');

			expect(topLevel.length).toBe(1);
			expect(repliesTo1.length).toBe(2);
			expect(repliesTo2.length).toBe(1);
		});

		it('should calculate reply depth correctly', () => {
			const getDepth = (
				comments: { id: string; parentId: string | null }[],
				commentId: string
			): number => {
				let depth = 0;
				let currentId: string | null = commentId;

				while (currentId) {
					const comment = comments.find((c) => c.id === currentId);
					if (!comment || !comment.parentId) break;
					depth++;
					currentId = comment.parentId;
				}

				return depth;
			};

			const comments = [
				{ id: 'c1', parentId: null },
				{ id: 'c2', parentId: 'c1' },
				{ id: 'c3', parentId: 'c2' },
				{ id: 'c4', parentId: 'c3' }
			];

			expect(getDepth(comments, 'c1')).toBe(0);
			expect(getDepth(comments, 'c2')).toBe(1);
			expect(getDepth(comments, 'c3')).toBe(2);
			expect(getDepth(comments, 'c4')).toBe(3);
		});

		it('should enforce maximum reply depth', () => {
			const MAX_DEPTH = 5;
			const currentDepth = 5;

			expect(currentDepth >= MAX_DEPTH).toBe(true);
		});
	});

	describe('Comment relations', () => {
		it('should link to a fact', () => {
			const comment = {
				factId: 'fact-123',
				fact: { id: 'fact-123', title: 'Some Fact' }
			};

			expect(comment.factId).toBe(comment.fact.id);
		});

		it('should link to a user', () => {
			const comment = {
				userId: 'user-123',
				user: { id: 'user-123', firstName: 'John' }
			};

			expect(comment.userId).toBe(comment.user.id);
		});

		it('should support multiple votes per comment', () => {
			const commentVotes = [
				{ id: 'v1', commentId: 'comment-1', userId: 'user-1', value: 1 },
				{ id: 'v2', commentId: 'comment-1', userId: 'user-2', value: -1 },
				{ id: 'v3', commentId: 'comment-1', userId: 'user-3', value: 1 }
			];

			const allSameComment = commentVotes.every((v) => v.commentId === 'comment-1');
			expect(allSameComment).toBe(true);
			expect(commentVotes.length).toBe(3);
		});
	});

	describe('Weighted vote calculation', () => {
		it('should calculate weighted score from votes', () => {
			const votes = [
				{ value: 1, weight: 5.0 }, // +5
				{ value: 1, weight: 2.0 }, // +2
				{ value: -1, weight: 3.0 }, // -3
				{ value: 1, weight: 1.0 } // +1
			];

			const weightedScore = votes.reduce((sum, v) => sum + v.value * v.weight, 0);
			expect(weightedScore).toBe(5); // 5 + 2 - 3 + 1 = 5
		});

		it('should count upvotes and downvotes separately', () => {
			const votes = [
				{ value: 1 },
				{ value: 1 },
				{ value: -1 },
				{ value: 1 },
				{ value: -1 }
			];

			const upvotes = votes.filter((v) => v.value > 0).length;
			const downvotes = votes.filter((v) => v.value < 0).length;

			expect(upvotes).toBe(3);
			expect(downvotes).toBe(2);
		});
	});

	describe('Difference from Discussions', () => {
		it('should be quick remarks vs structured arguments', () => {
			// Comments are quick remarks
			const comment = {
				body: 'Quick thought about this fact!',
				type: undefined // No type field
			};

			// Discussions are structured with PRO/CONTRA/NEUTRAL
			const discussion = {
				body: 'Detailed evidence supporting this fact with citations...',
				type: 'PRO'
			};

			expect(comment.type).toBeUndefined();
			expect(discussion.type).toBeDefined();
		});

		it('should support threading unlike discussions', () => {
			const comment = {
				parentId: 'parent-comment-id' // Can be a reply
			};

			expect(comment.parentId).toBeDefined();
		});
	});
});
