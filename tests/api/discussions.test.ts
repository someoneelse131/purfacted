import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock discussion service
vi.mock('$lib/server/services/discussion', () => ({
	createDiscussion: vi.fn(),
	getFactDiscussions: vi.fn(),
	getFactDiscussionsByType: vi.fn(),
	getDiscussionById: vi.fn(),
	updateDiscussion: vi.fn(),
	deleteDiscussion: vi.fn(),
	voteOnDiscussion: vi.fn(),
	getUserDiscussionVote: vi.fn(),
	removeDiscussionVote: vi.fn(),
	getDiscussionVotingSummary: vi.fn(),
	DiscussionError: class DiscussionError extends Error {
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

describe('T17: Discussions API Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET /api/facts/:id/discussions', () => {
		it('should return paginated list of discussions', async () => {
			const { getFactDiscussions } = await import('$lib/server/services/discussion');
			const { GET } = await import('../../src/routes/api/facts/[id]/discussions/+server');

			vi.mocked(getFactDiscussions).mockResolvedValue({
				discussions: [
					{
						id: 'disc-1',
						type: 'PRO',
						body: 'This is correct because...',
						user: { id: 'user-1', username: 'alice' },
						_count: { votes: 5 },
						voteSummary: { up: 5, down: 0 },
						createdAt: new Date(),
						updatedAt: new Date()
					},
					{
						id: 'disc-2',
						type: 'CONTRA',
						body: 'I disagree because...',
						user: { id: 'user-2', username: 'bob' },
						_count: { votes: 3 },
						voteSummary: { up: 1, down: 2 },
						createdAt: new Date(),
						updatedAt: new Date()
					}
				],
				total: 2
			} as any);

			const params = { id: 'fact-123' };
			const url = createMockUrl('/api/facts/fact-123/discussions');

			const response = await GET({ params, url } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.discussions).toHaveLength(2);
			expect(data.data.discussions[0].type).toBe('PRO');
			expect(data.data.discussions[1].type).toBe('CONTRA');
		});

		it('should return discussions grouped by type', async () => {
			const { getFactDiscussionsByType } = await import('$lib/server/services/discussion');
			const { GET } = await import('../../src/routes/api/facts/[id]/discussions/+server');

			vi.mocked(getFactDiscussionsByType).mockResolvedValue({
				pro: [{ id: 'disc-1', type: 'PRO', body: 'Pro argument', _count: { votes: 5 } }],
				contra: [{ id: 'disc-2', type: 'CONTRA', body: 'Con argument', _count: { votes: 3 } }],
				neutral: [{ id: 'disc-3', type: 'NEUTRAL', body: 'Neutral point', _count: { votes: 1 } }]
			} as any);

			const params = { id: 'fact-123' };
			const url = createMockUrl('/api/facts/fact-123/discussions', { grouped: 'true' });

			const response = await GET({ params, url } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.pro).toHaveLength(1);
			expect(data.data.contra).toHaveLength(1);
			expect(data.data.neutral).toHaveLength(1);
		});

		it('should filter by type', async () => {
			const { getFactDiscussions } = await import('$lib/server/services/discussion');
			const { GET } = await import('../../src/routes/api/facts/[id]/discussions/+server');

			vi.mocked(getFactDiscussions).mockResolvedValue({
				discussions: [],
				total: 0
			} as any);

			const params = { id: 'fact-123' };
			const url = createMockUrl('/api/facts/fact-123/discussions', { type: 'PRO' });

			await GET({ params, url } as any);

			expect(getFactDiscussions).toHaveBeenCalledWith(
				'fact-123',
				expect.objectContaining({
					type: 'PRO'
				})
			);
		});

		it('should support sorting', async () => {
			const { getFactDiscussions } = await import('$lib/server/services/discussion');
			const { GET } = await import('../../src/routes/api/facts/[id]/discussions/+server');

			vi.mocked(getFactDiscussions).mockResolvedValue({
				discussions: [],
				total: 0
			} as any);

			const params = { id: 'fact-123' };
			const url = createMockUrl('/api/facts/fact-123/discussions', { sortBy: 'votes' });

			await GET({ params, url } as any);

			expect(getFactDiscussions).toHaveBeenCalledWith(
				'fact-123',
				expect.objectContaining({
					sortBy: 'votes'
				})
			);
		});

		it('should throw 500 on service error', async () => {
			const { getFactDiscussions } = await import('$lib/server/services/discussion');
			const { GET } = await import('../../src/routes/api/facts/[id]/discussions/+server');

			vi.mocked(getFactDiscussions).mockRejectedValue(new Error('Database error'));

			const params = { id: 'fact-123' };
			const url = createMockUrl('/api/facts/fact-123/discussions');

			await expect(GET({ params, url } as any)).rejects.toMatchObject({
				status: 500
			});
		});
	});

	describe('POST /api/facts/:id/discussions', () => {
		it('should create discussion for authenticated verified user', async () => {
			const { createDiscussion } = await import('$lib/server/services/discussion');
			const { POST } = await import('../../src/routes/api/facts/[id]/discussions/+server');

			vi.mocked(createDiscussion).mockResolvedValue({
				id: 'disc-123',
				type: 'PRO'
			} as any);

			const params = { id: 'fact-123' };
			const request = createMockRequest({
				type: 'PRO',
				body: 'I support this fact because...'
			});
			const locals = { user: { id: 'user-123', emailVerified: true } };

			const response = await POST({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.id).toBe('disc-123');
			expect(data.data.type).toBe('PRO');
			expect(createDiscussion).toHaveBeenCalledWith('user-123', {
				factId: 'fact-123',
				type: 'PRO',
				body: 'I support this fact because...'
			});
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { POST } = await import('../../src/routes/api/facts/[id]/discussions/+server');

			const params = { id: 'fact-123' };
			const request = createMockRequest({ type: 'PRO', body: 'Test' });
			const locals = { user: null };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 for unverified email', async () => {
			const { POST } = await import('../../src/routes/api/facts/[id]/discussions/+server');

			const params = { id: 'fact-123' };
			const request = createMockRequest({ type: 'PRO', body: 'Test' });
			const locals = { user: { id: 'user-123', emailVerified: false } };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});

		it('should throw 404 when fact not found', async () => {
			const { createDiscussion, DiscussionError } = await import(
				'$lib/server/services/discussion'
			);
			const { POST } = await import('../../src/routes/api/facts/[id]/discussions/+server');

			vi.mocked(createDiscussion).mockRejectedValue(
				new DiscussionError('FACT_NOT_FOUND', 'Fact not found')
			);

			const params = { id: 'nonexistent' };
			const request = createMockRequest({ type: 'PRO', body: 'Test' });
			const locals = { user: { id: 'user-123', emailVerified: true } };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});
	});

	describe('GET /api/discussions/:id', () => {
		it('should return discussion details with user vote', async () => {
			const { getDiscussionById, getUserDiscussionVote } = await import(
				'$lib/server/services/discussion'
			);
			const { GET } = await import('../../src/routes/api/discussions/[id]/+server');

			vi.mocked(getDiscussionById).mockResolvedValue({
				id: 'disc-123',
				factId: 'fact-123',
				type: 'PRO',
				body: 'Supporting argument',
				user: { id: 'user-1', username: 'alice' },
				voteSummary: { up: 10, down: 2 },
				createdAt: new Date(),
				updatedAt: new Date()
			} as any);
			vi.mocked(getUserDiscussionVote).mockResolvedValue({ value: 1 } as any);

			const params = { id: 'disc-123' };
			const locals = { user: { id: 'user-456' } };

			const response = await GET({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.id).toBe('disc-123');
			expect(data.data.type).toBe('PRO');
			expect(data.data.userVote.value).toBe(1);
		});

		it('should return null userVote for unauthenticated user', async () => {
			const { getDiscussionById } = await import('$lib/server/services/discussion');
			const { GET } = await import('../../src/routes/api/discussions/[id]/+server');

			vi.mocked(getDiscussionById).mockResolvedValue({
				id: 'disc-123',
				factId: 'fact-123',
				type: 'PRO',
				body: 'Supporting argument',
				user: { id: 'user-1', username: 'alice' },
				voteSummary: { up: 10, down: 2 },
				createdAt: new Date(),
				updatedAt: new Date()
			} as any);

			const params = { id: 'disc-123' };
			const locals = { user: null };

			const response = await GET({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.userVote).toBeNull();
		});

		it('should throw 404 when discussion not found', async () => {
			const { getDiscussionById } = await import('$lib/server/services/discussion');
			const { GET } = await import('../../src/routes/api/discussions/[id]/+server');

			vi.mocked(getDiscussionById).mockResolvedValue(null);

			const params = { id: 'nonexistent' };
			const locals = { user: null };

			await expect(GET({ params, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});
	});

	describe('PATCH /api/discussions/:id', () => {
		it('should update discussion for author', async () => {
			const { updateDiscussion } = await import('$lib/server/services/discussion');
			const { PATCH } = await import('../../src/routes/api/discussions/[id]/+server');

			vi.mocked(updateDiscussion).mockResolvedValue({
				id: 'disc-123',
				body: 'Updated content',
				updatedAt: new Date()
			} as any);

			const params = { id: 'disc-123' };
			const request = createMockRequest({ body: 'Updated content' });
			const locals = { user: { id: 'user-123' } };

			const response = await PATCH({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.body).toBe('Updated content');
			expect(updateDiscussion).toHaveBeenCalledWith('user-123', 'disc-123', 'Updated content');
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { PATCH } = await import('../../src/routes/api/discussions/[id]/+server');

			const params = { id: 'disc-123' };
			const request = createMockRequest({ body: 'Updated' });
			const locals = { user: null };

			await expect(PATCH({ params, request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 when user is not author', async () => {
			const { updateDiscussion, DiscussionError } = await import(
				'$lib/server/services/discussion'
			);
			const { PATCH } = await import('../../src/routes/api/discussions/[id]/+server');

			vi.mocked(updateDiscussion).mockRejectedValue(
				new DiscussionError('NOT_AUTHOR', 'Only the author can edit this discussion')
			);

			const params = { id: 'disc-123' };
			const request = createMockRequest({ body: 'Updated' });
			const locals = { user: { id: 'other-user' } };

			await expect(PATCH({ params, request, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});

		it('should throw 404 when discussion not found', async () => {
			const { updateDiscussion, DiscussionError } = await import(
				'$lib/server/services/discussion'
			);
			const { PATCH } = await import('../../src/routes/api/discussions/[id]/+server');

			vi.mocked(updateDiscussion).mockRejectedValue(
				new DiscussionError('DISCUSSION_NOT_FOUND', 'Discussion not found')
			);

			const params = { id: 'nonexistent' };
			const request = createMockRequest({ body: 'Updated' });
			const locals = { user: { id: 'user-123' } };

			await expect(PATCH({ params, request, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});
	});

	describe('DELETE /api/discussions/:id', () => {
		it('should delete discussion for author', async () => {
			const { deleteDiscussion } = await import('$lib/server/services/discussion');
			const { DELETE } = await import('../../src/routes/api/discussions/[id]/+server');

			vi.mocked(deleteDiscussion).mockResolvedValue(undefined);

			const params = { id: 'disc-123' };
			const locals = { user: { id: 'user-123' } };

			const response = await DELETE({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.message).toContain('deleted');
			expect(deleteDiscussion).toHaveBeenCalledWith('user-123', 'disc-123');
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { DELETE } = await import('../../src/routes/api/discussions/[id]/+server');

			const params = { id: 'disc-123' };
			const locals = { user: null };

			await expect(DELETE({ params, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 when user is not author', async () => {
			const { deleteDiscussion, DiscussionError } = await import(
				'$lib/server/services/discussion'
			);
			const { DELETE } = await import('../../src/routes/api/discussions/[id]/+server');

			vi.mocked(deleteDiscussion).mockRejectedValue(
				new DiscussionError('NOT_AUTHOR', 'Only the author can delete this discussion')
			);

			const params = { id: 'disc-123' };
			const locals = { user: { id: 'other-user' } };

			await expect(DELETE({ params, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});
	});

	describe('GET /api/discussions/:id/vote', () => {
		it('should return voting summary and user vote', async () => {
			const { getDiscussionVotingSummary, getUserDiscussionVote } = await import(
				'$lib/server/services/discussion'
			);
			const { GET } = await import('../../src/routes/api/discussions/[id]/vote/+server');

			vi.mocked(getDiscussionVotingSummary).mockResolvedValue({
				upvotes: 10,
				downvotes: 3,
				score: 7
			} as any);
			vi.mocked(getUserDiscussionVote).mockResolvedValue({
				value: 1,
				weight: 2.4
			} as any);

			const params = { id: 'disc-123' };
			const locals = { user: { id: 'user-123' } };

			const response = await GET({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.summary.upvotes).toBe(10);
			expect(data.data.summary.downvotes).toBe(3);
			expect(data.data.userVote.value).toBe(1);
			expect(data.data.userVote.weight).toBe(2.4);
		});

		it('should return null userVote for unauthenticated user', async () => {
			const { getDiscussionVotingSummary } = await import('$lib/server/services/discussion');
			const { GET } = await import('../../src/routes/api/discussions/[id]/vote/+server');

			vi.mocked(getDiscussionVotingSummary).mockResolvedValue({
				upvotes: 10,
				downvotes: 3,
				score: 7
			} as any);

			const params = { id: 'disc-123' };
			const locals = { user: null };

			const response = await GET({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.userVote).toBeNull();
		});
	});

	describe('POST /api/discussions/:id/vote', () => {
		it('should record upvote', async () => {
			const { voteOnDiscussion } = await import('$lib/server/services/discussion');
			const { POST } = await import('../../src/routes/api/discussions/[id]/vote/+server');

			vi.mocked(voteOnDiscussion).mockResolvedValue({
				vote: { value: 1, weight: 2.4 },
				votingSummary: { upvotes: 11, downvotes: 3 }
			} as any);

			const params = { id: 'disc-123' };
			const request = createMockRequest({ value: 1 });
			const locals = { user: { id: 'user-123', emailVerified: true } };

			const response = await POST({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.vote.value).toBe(1);
			expect(data.data.vote.weight).toBe(2.4);
		});

		it('should record downvote', async () => {
			const { voteOnDiscussion } = await import('$lib/server/services/discussion');
			const { POST } = await import('../../src/routes/api/discussions/[id]/vote/+server');

			vi.mocked(voteOnDiscussion).mockResolvedValue({
				vote: { value: -1, weight: 2.4 },
				votingSummary: { upvotes: 10, downvotes: 4 }
			} as any);

			const params = { id: 'disc-123' };
			const request = createMockRequest({ value: -1 });
			const locals = { user: { id: 'user-123', emailVerified: true } };

			const response = await POST({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.vote.value).toBe(-1);
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { POST } = await import('../../src/routes/api/discussions/[id]/vote/+server');

			const params = { id: 'disc-123' };
			const request = createMockRequest({ value: 1 });
			const locals = { user: null };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 for unverified email', async () => {
			const { POST } = await import('../../src/routes/api/discussions/[id]/vote/+server');

			const params = { id: 'disc-123' };
			const request = createMockRequest({ value: 1 });
			const locals = { user: { id: 'user-123', emailVerified: false } };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});

		it('should throw 404 when discussion not found', async () => {
			const { voteOnDiscussion, DiscussionError } = await import(
				'$lib/server/services/discussion'
			);
			const { POST } = await import('../../src/routes/api/discussions/[id]/vote/+server');

			vi.mocked(voteOnDiscussion).mockRejectedValue(
				new DiscussionError('DISCUSSION_NOT_FOUND', 'Discussion not found')
			);

			const params = { id: 'nonexistent' };
			const request = createMockRequest({ value: 1 });
			const locals = { user: { id: 'user-123', emailVerified: true } };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});
	});

	describe('DELETE /api/discussions/:id/vote', () => {
		it('should remove vote', async () => {
			const { removeDiscussionVote, getDiscussionVotingSummary } = await import(
				'$lib/server/services/discussion'
			);
			const { DELETE } = await import('../../src/routes/api/discussions/[id]/vote/+server');

			vi.mocked(removeDiscussionVote).mockResolvedValue(undefined);
			vi.mocked(getDiscussionVotingSummary).mockResolvedValue({
				upvotes: 9,
				downvotes: 3,
				score: 6
			} as any);

			const params = { id: 'disc-123' };
			const locals = { user: { id: 'user-123' } };

			const response = await DELETE({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.message).toContain('removed');
			expect(data.data.votingSummary.upvotes).toBe(9);
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { DELETE } = await import('../../src/routes/api/discussions/[id]/vote/+server');

			const params = { id: 'disc-123' };
			const locals = { user: null };

			await expect(DELETE({ params, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 404 when vote not found', async () => {
			const { removeDiscussionVote, DiscussionError } = await import(
				'$lib/server/services/discussion'
			);
			const { DELETE } = await import('../../src/routes/api/discussions/[id]/vote/+server');

			vi.mocked(removeDiscussionVote).mockRejectedValue(
				new DiscussionError('VOTE_NOT_FOUND', 'No vote found to remove')
			);

			const params = { id: 'disc-123' };
			const locals = { user: { id: 'user-123' } };

			await expect(DELETE({ params, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});
	});
});
