import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock comment service
vi.mock('$lib/server/services/comment', () => ({
	createComment: vi.fn(),
	getFactComments: vi.fn(),
	getCommentById: vi.fn(),
	updateComment: vi.fn(),
	deleteComment: vi.fn(),
	getCommentReplies: vi.fn(),
	voteOnComment: vi.fn(),
	getUserCommentVote: vi.fn(),
	removeCommentVote: vi.fn(),
	getCommentVotingSummary: vi.fn(),
	CommentError: class CommentError extends Error {
		code: string;
		constructor(code: string, message: string) {
			super(message);
			this.code = code;
		}
	}
}));

// Helper to create mock request
function createMockRequest(body: any): Request {
	return {
		json: vi.fn().mockResolvedValue(body)
	} as unknown as Request;
}

// Helper to create mock URL
function createMockUrl(path: string, params: Record<string, string> = {}): URL {
	const url = new URL(`http://localhost:3000${path}`);
	Object.entries(params).forEach(([key, value]) => {
		url.searchParams.set(key, value);
	});
	return url;
}

describe('T18: Comments API Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET /api/facts/:id/comments', () => {
		it('should return paginated list of comments', async () => {
			const { getFactComments } = await import('$lib/server/services/comment');
			const { GET } = await import('../../src/routes/api/facts/[id]/comments/+server');

			vi.mocked(getFactComments).mockResolvedValue({
				comments: [
					{
						id: 'comment-1',
						body: 'Great fact!',
						parentId: null,
						user: { id: 'user-1', username: 'alice' },
						_count: { votes: 5, replies: 2 },
						voteSummary: { up: 5, down: 0 },
						replies: [],
						createdAt: new Date(),
						updatedAt: new Date()
					},
					{
						id: 'comment-2',
						body: 'Interesting point',
						parentId: null,
						user: { id: 'user-2', username: 'bob' },
						_count: { votes: 3, replies: 0 },
						voteSummary: { up: 2, down: 1 },
						replies: [],
						createdAt: new Date(),
						updatedAt: new Date()
					}
				],
				total: 2
			} as any);

			const params = { id: 'fact-123' };
			const url = createMockUrl('/api/facts/fact-123/comments');

			const response = await GET({ params, url } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.comments).toHaveLength(2);
			expect(data.data.comments[0].voteCount).toBe(5);
			expect(data.data.comments[0].replyCount).toBe(2);
		});

		it('should support sorting by votes', async () => {
			const { getFactComments } = await import('$lib/server/services/comment');
			const { GET } = await import('../../src/routes/api/facts/[id]/comments/+server');

			vi.mocked(getFactComments).mockResolvedValue({
				comments: [],
				total: 0
			} as any);

			const params = { id: 'fact-123' };
			const url = createMockUrl('/api/facts/fact-123/comments', { sortBy: 'votes' });

			await GET({ params, url } as any);

			expect(getFactComments).toHaveBeenCalledWith(
				'fact-123',
				expect.objectContaining({
					sortBy: 'votes'
				})
			);
		});

		it('should exclude replies when includeReplies=false', async () => {
			const { getFactComments } = await import('$lib/server/services/comment');
			const { GET } = await import('../../src/routes/api/facts/[id]/comments/+server');

			vi.mocked(getFactComments).mockResolvedValue({
				comments: [],
				total: 0
			} as any);

			const params = { id: 'fact-123' };
			const url = createMockUrl('/api/facts/fact-123/comments', { includeReplies: 'false' });

			await GET({ params, url } as any);

			expect(getFactComments).toHaveBeenCalledWith(
				'fact-123',
				expect.objectContaining({
					includeReplies: false
				})
			);
		});

		it('should throw 500 on service error', async () => {
			const { getFactComments } = await import('$lib/server/services/comment');
			const { GET } = await import('../../src/routes/api/facts/[id]/comments/+server');

			vi.mocked(getFactComments).mockRejectedValue(new Error('Database error'));

			const params = { id: 'fact-123' };
			const url = createMockUrl('/api/facts/fact-123/comments');

			await expect(GET({ params, url } as any)).rejects.toMatchObject({
				status: 500
			});
		});
	});

	describe('POST /api/facts/:id/comments', () => {
		it('should create comment for authenticated verified user', async () => {
			const { createComment } = await import('$lib/server/services/comment');
			const { POST } = await import('../../src/routes/api/facts/[id]/comments/+server');

			vi.mocked(createComment).mockResolvedValue({
				id: 'comment-123',
				parentId: null
			} as any);

			const params = { id: 'fact-123' };
			const request = createMockRequest({
				body: 'This is a great fact!'
			});
			const locals = { user: { id: 'user-123', emailVerified: true } };

			const response = await POST({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.id).toBe('comment-123');
			expect(data.data.message).toContain('Comment posted');
			expect(createComment).toHaveBeenCalledWith('user-123', {
				factId: 'fact-123',
				body: 'This is a great fact!',
				parentId: null
			});
		});

		it('should create reply with parentId', async () => {
			const { createComment } = await import('$lib/server/services/comment');
			const { POST } = await import('../../src/routes/api/facts/[id]/comments/+server');

			vi.mocked(createComment).mockResolvedValue({
				id: 'comment-456',
				parentId: 'comment-123'
			} as any);

			const params = { id: 'fact-123' };
			const request = createMockRequest({
				body: 'I agree with this!',
				parentId: 'comment-123'
			});
			const locals = { user: { id: 'user-123', emailVerified: true } };

			const response = await POST({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.parentId).toBe('comment-123');
			expect(data.data.message).toContain('Reply posted');
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { POST } = await import('../../src/routes/api/facts/[id]/comments/+server');

			const params = { id: 'fact-123' };
			const request = createMockRequest({ body: 'Test' });
			const locals = { user: null };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 for unverified email', async () => {
			const { POST } = await import('../../src/routes/api/facts/[id]/comments/+server');

			const params = { id: 'fact-123' };
			const request = createMockRequest({ body: 'Test' });
			const locals = { user: { id: 'user-123', emailVerified: false } };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});

		it('should throw 404 when fact not found', async () => {
			const { createComment, CommentError } = await import('$lib/server/services/comment');
			const { POST } = await import('../../src/routes/api/facts/[id]/comments/+server');

			vi.mocked(createComment).mockRejectedValue(
				new CommentError('FACT_NOT_FOUND', 'Fact not found')
			);

			const params = { id: 'nonexistent' };
			const request = createMockRequest({ body: 'Test' });
			const locals = { user: { id: 'user-123', emailVerified: true } };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});

		it('should throw 404 when parent comment not found', async () => {
			const { createComment, CommentError } = await import('$lib/server/services/comment');
			const { POST } = await import('../../src/routes/api/facts/[id]/comments/+server');

			vi.mocked(createComment).mockRejectedValue(
				new CommentError('PARENT_NOT_FOUND', 'Parent comment not found')
			);

			const params = { id: 'fact-123' };
			const request = createMockRequest({ body: 'Test', parentId: 'nonexistent' });
			const locals = { user: { id: 'user-123', emailVerified: true } };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});
	});

	describe('GET /api/comments/:id', () => {
		it('should return comment details with user vote', async () => {
			const { getCommentById, getUserCommentVote } = await import('$lib/server/services/comment');
			const { GET } = await import('../../src/routes/api/comments/[id]/+server');

			vi.mocked(getCommentById).mockResolvedValue({
				id: 'comment-123',
				factId: 'fact-123',
				parentId: null,
				body: 'Great fact!',
				user: { id: 'user-1', username: 'alice' },
				voteSummary: { up: 10, down: 2 },
				_count: { replies: 3 },
				createdAt: new Date(),
				updatedAt: new Date()
			} as any);
			vi.mocked(getUserCommentVote).mockResolvedValue({ value: 1 } as any);

			const params = { id: 'comment-123' };
			const url = createMockUrl('/api/comments/comment-123');
			const locals = { user: { id: 'user-456' } };

			const response = await GET({ params, url, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.id).toBe('comment-123');
			expect(data.data.replyCount).toBe(3);
			expect(data.data.userVote.value).toBe(1);
		});

		it('should include replies when requested', async () => {
			const { getCommentById, getCommentReplies } = await import('$lib/server/services/comment');
			const { GET } = await import('../../src/routes/api/comments/[id]/+server');

			vi.mocked(getCommentById).mockResolvedValue({
				id: 'comment-123',
				factId: 'fact-123',
				parentId: null,
				body: 'Great fact!',
				user: { id: 'user-1', username: 'alice' },
				voteSummary: { up: 10, down: 2 },
				_count: { replies: 2 },
				createdAt: new Date(),
				updatedAt: new Date()
			} as any);
			vi.mocked(getCommentReplies).mockResolvedValue([
				{ id: 'reply-1', body: 'Reply 1', _count: { replies: 0 } },
				{ id: 'reply-2', body: 'Reply 2', _count: { replies: 0 } }
			] as any);

			const params = { id: 'comment-123' };
			const url = createMockUrl('/api/comments/comment-123', { includeReplies: 'true' });
			const locals = { user: null };

			const response = await GET({ params, url, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.replies).toHaveLength(2);
			expect(getCommentReplies).toHaveBeenCalledWith('comment-123');
		});

		it('should return null userVote for unauthenticated user', async () => {
			const { getCommentById } = await import('$lib/server/services/comment');
			const { GET } = await import('../../src/routes/api/comments/[id]/+server');

			vi.mocked(getCommentById).mockResolvedValue({
				id: 'comment-123',
				factId: 'fact-123',
				parentId: null,
				body: 'Great fact!',
				user: { id: 'user-1', username: 'alice' },
				voteSummary: { up: 10, down: 2 },
				_count: { replies: 0 },
				createdAt: new Date(),
				updatedAt: new Date()
			} as any);

			const params = { id: 'comment-123' };
			const url = createMockUrl('/api/comments/comment-123');
			const locals = { user: null };

			const response = await GET({ params, url, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.userVote).toBeNull();
		});

		it('should throw 404 when comment not found', async () => {
			const { getCommentById } = await import('$lib/server/services/comment');
			const { GET } = await import('../../src/routes/api/comments/[id]/+server');

			vi.mocked(getCommentById).mockResolvedValue(null);

			const params = { id: 'nonexistent' };
			const url = createMockUrl('/api/comments/nonexistent');
			const locals = { user: null };

			await expect(GET({ params, url, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});
	});

	describe('PATCH /api/comments/:id', () => {
		it('should update comment for author', async () => {
			const { updateComment } = await import('$lib/server/services/comment');
			const { PATCH } = await import('../../src/routes/api/comments/[id]/+server');

			vi.mocked(updateComment).mockResolvedValue({
				id: 'comment-123',
				body: 'Updated comment',
				updatedAt: new Date()
			} as any);

			const params = { id: 'comment-123' };
			const request = createMockRequest({ body: 'Updated comment' });
			const locals = { user: { id: 'user-123' } };

			const response = await PATCH({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.body).toBe('Updated comment');
			expect(updateComment).toHaveBeenCalledWith('user-123', 'comment-123', 'Updated comment');
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { PATCH } = await import('../../src/routes/api/comments/[id]/+server');

			const params = { id: 'comment-123' };
			const request = createMockRequest({ body: 'Updated' });
			const locals = { user: null };

			await expect(PATCH({ params, request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 when user is not author', async () => {
			const { updateComment, CommentError } = await import('$lib/server/services/comment');
			const { PATCH } = await import('../../src/routes/api/comments/[id]/+server');

			vi.mocked(updateComment).mockRejectedValue(
				new CommentError('NOT_AUTHOR', 'Only the author can edit this comment')
			);

			const params = { id: 'comment-123' };
			const request = createMockRequest({ body: 'Updated' });
			const locals = { user: { id: 'other-user' } };

			await expect(PATCH({ params, request, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});

		it('should throw 404 when comment not found', async () => {
			const { updateComment, CommentError } = await import('$lib/server/services/comment');
			const { PATCH } = await import('../../src/routes/api/comments/[id]/+server');

			vi.mocked(updateComment).mockRejectedValue(
				new CommentError('COMMENT_NOT_FOUND', 'Comment not found')
			);

			const params = { id: 'nonexistent' };
			const request = createMockRequest({ body: 'Updated' });
			const locals = { user: { id: 'user-123' } };

			await expect(PATCH({ params, request, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});
	});

	describe('DELETE /api/comments/:id', () => {
		it('should delete comment for author', async () => {
			const { deleteComment } = await import('$lib/server/services/comment');
			const { DELETE } = await import('../../src/routes/api/comments/[id]/+server');

			vi.mocked(deleteComment).mockResolvedValue(undefined);

			const params = { id: 'comment-123' };
			const locals = { user: { id: 'user-123' } };

			const response = await DELETE({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.message).toContain('deleted');
			expect(deleteComment).toHaveBeenCalledWith('user-123', 'comment-123');
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { DELETE } = await import('../../src/routes/api/comments/[id]/+server');

			const params = { id: 'comment-123' };
			const locals = { user: null };

			await expect(DELETE({ params, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 when user is not author', async () => {
			const { deleteComment, CommentError } = await import('$lib/server/services/comment');
			const { DELETE } = await import('../../src/routes/api/comments/[id]/+server');

			vi.mocked(deleteComment).mockRejectedValue(
				new CommentError('NOT_AUTHOR', 'Only the author can delete this comment')
			);

			const params = { id: 'comment-123' };
			const locals = { user: { id: 'other-user' } };

			await expect(DELETE({ params, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});
	});

	describe('GET /api/comments/:id/vote', () => {
		it('should return voting summary and user vote', async () => {
			const { getCommentVotingSummary, getUserCommentVote } = await import(
				'$lib/server/services/comment'
			);
			const { GET } = await import('../../src/routes/api/comments/[id]/vote/+server');

			vi.mocked(getCommentVotingSummary).mockResolvedValue({
				upvotes: 10,
				downvotes: 3,
				score: 7
			} as any);
			vi.mocked(getUserCommentVote).mockResolvedValue({
				value: 1,
				weight: 2.4
			} as any);

			const params = { id: 'comment-123' };
			const locals = { user: { id: 'user-123' } };

			const response = await GET({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.summary.upvotes).toBe(10);
			expect(data.data.userVote.value).toBe(1);
			expect(data.data.userVote.weight).toBe(2.4);
		});

		it('should return null userVote for unauthenticated user', async () => {
			const { getCommentVotingSummary } = await import('$lib/server/services/comment');
			const { GET } = await import('../../src/routes/api/comments/[id]/vote/+server');

			vi.mocked(getCommentVotingSummary).mockResolvedValue({
				upvotes: 10,
				downvotes: 3,
				score: 7
			} as any);

			const params = { id: 'comment-123' };
			const locals = { user: null };

			const response = await GET({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.userVote).toBeNull();
		});
	});

	describe('POST /api/comments/:id/vote', () => {
		it('should record upvote', async () => {
			const { voteOnComment } = await import('$lib/server/services/comment');
			const { POST } = await import('../../src/routes/api/comments/[id]/vote/+server');

			vi.mocked(voteOnComment).mockResolvedValue({
				vote: { value: 1, weight: 2.4 },
				votingSummary: { upvotes: 11, downvotes: 3 }
			} as any);

			const params = { id: 'comment-123' };
			const request = createMockRequest({ value: 1 });
			const locals = { user: { id: 'user-123', emailVerified: true } };

			const response = await POST({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.vote.value).toBe(1);
			expect(data.data.vote.weight).toBe(2.4);
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { POST } = await import('../../src/routes/api/comments/[id]/vote/+server');

			const params = { id: 'comment-123' };
			const request = createMockRequest({ value: 1 });
			const locals = { user: null };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 for unverified email', async () => {
			const { POST } = await import('../../src/routes/api/comments/[id]/vote/+server');

			const params = { id: 'comment-123' };
			const request = createMockRequest({ value: 1 });
			const locals = { user: { id: 'user-123', emailVerified: false } };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});

		it('should throw 404 when comment not found', async () => {
			const { voteOnComment, CommentError } = await import('$lib/server/services/comment');
			const { POST } = await import('../../src/routes/api/comments/[id]/vote/+server');

			vi.mocked(voteOnComment).mockRejectedValue(
				new CommentError('COMMENT_NOT_FOUND', 'Comment not found')
			);

			const params = { id: 'nonexistent' };
			const request = createMockRequest({ value: 1 });
			const locals = { user: { id: 'user-123', emailVerified: true } };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});
	});

	describe('DELETE /api/comments/:id/vote', () => {
		it('should remove vote', async () => {
			const { removeCommentVote, getCommentVotingSummary } = await import(
				'$lib/server/services/comment'
			);
			const { DELETE } = await import('../../src/routes/api/comments/[id]/vote/+server');

			vi.mocked(removeCommentVote).mockResolvedValue(undefined);
			vi.mocked(getCommentVotingSummary).mockResolvedValue({
				upvotes: 9,
				downvotes: 3,
				score: 6
			} as any);

			const params = { id: 'comment-123' };
			const locals = { user: { id: 'user-123' } };

			const response = await DELETE({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.message).toContain('removed');
			expect(data.data.votingSummary.upvotes).toBe(9);
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { DELETE } = await import('../../src/routes/api/comments/[id]/vote/+server');

			const params = { id: 'comment-123' };
			const locals = { user: null };

			await expect(DELETE({ params, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 404 when vote not found', async () => {
			const { removeCommentVote, CommentError } = await import('$lib/server/services/comment');
			const { DELETE } = await import('../../src/routes/api/comments/[id]/vote/+server');

			vi.mocked(removeCommentVote).mockRejectedValue(
				new CommentError('VOTE_NOT_FOUND', 'No vote found to remove')
			);

			const params = { id: 'comment-123' };
			const locals = { user: { id: 'user-123' } };

			await expect(DELETE({ params, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});
	});
});
