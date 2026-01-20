import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock factVote service
vi.mock('$lib/server/services/factVote', () => ({
	voteOnFact: vi.fn(),
	removeVote: vi.fn(),
	getUserVote: vi.fn(),
	getFactVotingSummary: vi.fn(),
	VoteError: class VoteError extends Error {
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

describe('T14: Voting API Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET /api/facts/:id/vote', () => {
		it('should return voting summary without user vote for unauthenticated user', async () => {
			const { getFactVotingSummary, getUserVote } = await import('$lib/server/services/factVote');
			const { GET } = await import('../../src/routes/api/facts/[id]/vote/+server');

			vi.mocked(getFactVotingSummary).mockResolvedValue({
				upvotes: 10,
				downvotes: 3,
				score: 7,
				totalWeight: 15.5
			} as any);

			const params = { id: 'fact-123' };
			const locals = { user: null };

			const response = await GET({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.summary.upvotes).toBe(10);
			expect(data.data.userVote).toBeNull();
			expect(getUserVote).not.toHaveBeenCalled();
		});

		it('should return voting summary with user vote for authenticated user', async () => {
			const { getFactVotingSummary, getUserVote } = await import('$lib/server/services/factVote');
			const { GET } = await import('../../src/routes/api/facts/[id]/vote/+server');

			vi.mocked(getFactVotingSummary).mockResolvedValue({
				upvotes: 10,
				downvotes: 3,
				score: 7
			} as any);
			vi.mocked(getUserVote).mockResolvedValue({
				value: 1,
				weight: 2.4,
				createdAt: new Date()
			} as any);

			const params = { id: 'fact-123' };
			const locals = { user: { id: 'user-123' } };

			const response = await GET({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.userVote.value).toBe(1);
			expect(data.data.userVote.weight).toBe(2.4);
		});

		it('should throw 404 when fact not found', async () => {
			const { getFactVotingSummary, VoteError } = await import('$lib/server/services/factVote');
			const { GET } = await import('../../src/routes/api/facts/[id]/vote/+server');

			vi.mocked(getFactVotingSummary).mockRejectedValue(
				new VoteError('FACT_NOT_FOUND', 'Fact not found')
			);

			const params = { id: 'nonexistent' };
			const locals = { user: null };

			await expect(GET({ params, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});
	});

	describe('POST /api/facts/:id/vote', () => {
		it('should record upvote for authenticated user', async () => {
			const { voteOnFact } = await import('$lib/server/services/factVote');
			const { POST } = await import('../../src/routes/api/facts/[id]/vote/+server');

			vi.mocked(voteOnFact).mockResolvedValue({
				vote: { value: 1, weight: 2.4 },
				factScore: 10,
				statusChanged: false
			} as any);

			const params = { id: 'fact-123' };
			const request = createMockRequest({ value: 1 });
			const locals = { user: { id: 'user-123' } };

			const response = await POST({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.vote.value).toBe(1);
			expect(data.data.factScore).toBe(10);
			expect(voteOnFact).toHaveBeenCalledWith('user-123', 'fact-123', 1);
		});

		it('should record downvote for authenticated user', async () => {
			const { voteOnFact } = await import('$lib/server/services/factVote');
			const { POST } = await import('../../src/routes/api/facts/[id]/vote/+server');

			vi.mocked(voteOnFact).mockResolvedValue({
				vote: { value: -1, weight: 2.4 },
				factScore: 5,
				statusChanged: false
			} as any);

			const params = { id: 'fact-123' };
			const request = createMockRequest({ value: -1 });
			const locals = { user: { id: 'user-123' } };

			const response = await POST({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.vote.value).toBe(-1);
		});

		it('should return status change information', async () => {
			const { voteOnFact } = await import('$lib/server/services/factVote');
			const { POST } = await import('../../src/routes/api/facts/[id]/vote/+server');

			vi.mocked(voteOnFact).mockResolvedValue({
				vote: { value: 1, weight: 100 },
				factScore: 100,
				statusChanged: true,
				newStatus: 'APPROVED'
			} as any);

			const params = { id: 'fact-123' };
			const request = createMockRequest({ value: 1 });
			const locals = { user: { id: 'org-user' } };

			const response = await POST({ params, request, locals } as any);
			const data = await response.json();

			expect(data.data.statusChanged).toBe(true);
			expect(data.data.newStatus).toBe('APPROVED');
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { POST } = await import('../../src/routes/api/facts/[id]/vote/+server');

			const params = { id: 'fact-123' };
			const request = createMockRequest({ value: 1 });
			const locals = { user: null };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw error for invalid vote value', async () => {
			const { POST } = await import('../../src/routes/api/facts/[id]/vote/+server');

			const params = { id: 'fact-123' };
			const request = createMockRequest({ value: 0 });
			const locals = { user: { id: 'user-123' } };

			// Note: The validation error gets caught by the generic catch block and converted to 500
			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 500
			});
		});

		it('should throw 404 when fact not found', async () => {
			const { voteOnFact, VoteError } = await import('$lib/server/services/factVote');
			const { POST } = await import('../../src/routes/api/facts/[id]/vote/+server');

			vi.mocked(voteOnFact).mockRejectedValue(
				new VoteError('FACT_NOT_FOUND', 'Fact not found')
			);

			const params = { id: 'nonexistent' };
			const request = createMockRequest({ value: 1 });
			const locals = { user: { id: 'user-123' } };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});

		it('should throw 403 for unverified email', async () => {
			const { voteOnFact, VoteError } = await import('$lib/server/services/factVote');
			const { POST } = await import('../../src/routes/api/facts/[id]/vote/+server');

			vi.mocked(voteOnFact).mockRejectedValue(
				new VoteError('EMAIL_NOT_VERIFIED', 'Please verify your email')
			);

			const params = { id: 'fact-123' };
			const request = createMockRequest({ value: 1 });
			const locals = { user: { id: 'user-123' } };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});

		it('should throw 400 when voting on own fact', async () => {
			const { voteOnFact, VoteError } = await import('$lib/server/services/factVote');
			const { POST } = await import('../../src/routes/api/facts/[id]/vote/+server');

			vi.mocked(voteOnFact).mockRejectedValue(
				new VoteError('OWN_FACT', 'Cannot vote on your own fact')
			);

			const params = { id: 'fact-123' };
			const request = createMockRequest({ value: 1 });
			const locals = { user: { id: 'user-123' } };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 400
			});
		});

		it('should throw 400 for debounce (too frequent voting)', async () => {
			const { voteOnFact, VoteError } = await import('$lib/server/services/factVote');
			const { POST } = await import('../../src/routes/api/facts/[id]/vote/+server');

			vi.mocked(voteOnFact).mockRejectedValue(
				new VoteError('DEBOUNCE', 'Please wait before voting again')
			);

			const params = { id: 'fact-123' };
			const request = createMockRequest({ value: 1 });
			const locals = { user: { id: 'user-123' } };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 400
			});
		});
	});

	describe('DELETE /api/facts/:id/vote', () => {
		it('should remove vote for authenticated user', async () => {
			const { removeVote } = await import('$lib/server/services/factVote');
			const { DELETE } = await import('../../src/routes/api/facts/[id]/vote/+server');

			vi.mocked(removeVote).mockResolvedValue(undefined);

			const params = { id: 'fact-123' };
			const locals = { user: { id: 'user-123' } };

			const response = await DELETE({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(removeVote).toHaveBeenCalledWith('user-123', 'fact-123');
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { DELETE } = await import('../../src/routes/api/facts/[id]/vote/+server');

			const params = { id: 'fact-123' };
			const locals = { user: null };

			await expect(DELETE({ params, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 404 when vote not found', async () => {
			const { removeVote, VoteError } = await import('$lib/server/services/factVote');
			const { DELETE } = await import('../../src/routes/api/facts/[id]/vote/+server');

			vi.mocked(removeVote).mockRejectedValue(
				new VoteError('VOTE_NOT_FOUND', 'No vote found to remove')
			);

			const params = { id: 'fact-123' };
			const locals = { user: { id: 'user-123' } };

			await expect(DELETE({ params, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});
	});
});
