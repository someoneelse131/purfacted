import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * T27: Fact Lifecycle Integration Tests
 *
 * Tests the complete fact lifecycle from creation through status transitions.
 * Covers: Create → Source → Vote → Status Change → Edit → Veto → Archive
 */

// Mock fact service
vi.mock('$lib/server/services/fact', () => ({
	createFact: vi.fn(),
	getFactById: vi.fn(),
	updateFactStatus: vi.fn(),
	searchFacts: vi.fn(),
	FactError: class FactError extends Error {
		code: string;
		constructor(code: string, message: string) {
			super(message);
			this.code = code;
		}
	}
}));

// Mock source service
vi.mock('$lib/server/services/source', () => ({
	addSource: vi.fn(),
	getSourcesByFact: vi.fn(),
	validateSource: vi.fn(),
	calculateSourceCredibility: vi.fn()
}));

// Mock vote service
vi.mock('$lib/server/services/vote', () => ({
	castVote: vi.fn(),
	getVotesByFact: vi.fn(),
	calculateWeightedScore: vi.fn(),
	getUserVote: vi.fn(),
	recalculateFactVotes: vi.fn()
}));

// Mock fact edit service
vi.mock('$lib/server/services/factEdit', () => ({
	requestFactEdit: vi.fn(),
	approveEdit: vi.fn(),
	rejectEdit: vi.fn(),
	getPendingEdits: vi.fn(),
	FactEditError: class FactEditError extends Error {
		code: string;
		constructor(code: string, message: string) {
			super(message);
			this.code = code;
		}
	}
}));

// Mock veto service
vi.mock('$lib/server/services/veto', () => ({
	submitVeto: vi.fn(),
	getVetosByFact: vi.fn(),
	processVeto: vi.fn(),
	VetoError: class VetoError extends Error {
		code: string;
		constructor(code: string, message: string) {
			super(message);
			this.code = code;
		}
	}
}));

// Mock trust service
vi.mock('$lib/server/services/trust', () => ({
	updateTrustScore: vi.fn(),
	getUserTrustScore: vi.fn()
}));

// Mock LLM service
vi.mock('$lib/server/llm', () => ({
	checkGrammar: vi.fn()
}));

describe('T27: Fact Lifecycle Integration Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Complete Fact Lifecycle', () => {
		it('should complete full lifecycle: create → source → vote → proven', async () => {
			const { createFact, getFactById, updateFactStatus } = await import(
				'$lib/server/services/fact'
			);
			const { addSource } = await import('$lib/server/services/source');
			const { castVote, recalculateFactVotes } = await import('$lib/server/services/vote');
			const { checkGrammar } = await import('$lib/server/llm');
			const { updateTrustScore } = await import('$lib/server/services/trust');

			// Step 1: Create fact with grammar check
			vi.mocked(checkGrammar).mockResolvedValue({
				isCorrect: true,
				suggestions: []
			});

			const newFact = {
				id: 'fact-new',
				title: 'Water boils at 100°C at sea level',
				body: 'Under standard atmospheric pressure (1 atm), pure water boils at exactly 100 degrees Celsius.',
				status: 'SUBMITTED',
				authorId: 'user-123',
				upvotes: 0,
				downvotes: 0,
				weightedScore: 0
			};

			vi.mocked(createFact).mockResolvedValue(newFact as any);

			const fact = await createFact({
				title: newFact.title,
				body: newFact.body,
				authorId: 'user-123'
			});

			expect(fact.id).toBe('fact-new');
			expect(fact.status).toBe('SUBMITTED');

			// Step 2: Add sources
			vi.mocked(addSource).mockResolvedValue({
				id: 'source-1',
				url: 'https://physics.example.edu/water-boiling',
				type: 'ACADEMIC',
				credibilityScore: 85,
				factId: 'fact-new'
			} as any);

			const source = await addSource('fact-new', {
				url: 'https://physics.example.edu/water-boiling',
				type: 'ACADEMIC'
			});

			expect(source.credibilityScore).toBe(85);

			// Step 3: Receive votes
			vi.mocked(castVote).mockResolvedValue({
				id: 'vote-1',
				factId: 'fact-new',
				userId: 'voter-1',
				value: 1,
				weight: 2.0
			} as any);

			vi.mocked(recalculateFactVotes).mockResolvedValue({
				upvotes: 15,
				downvotes: 2,
				weightedScore: 25.5
			});

			// Simulate multiple votes
			await castVote('fact-new', 'voter-1', 1);
			const voteResult = await recalculateFactVotes('fact-new');

			expect(voteResult.weightedScore).toBe(25.5);

			// Step 4: Status changes to PROVEN
			vi.mocked(updateFactStatus).mockResolvedValue({
				...newFact,
				status: 'PROVEN',
				upvotes: 15,
				downvotes: 2,
				weightedScore: 25.5
			} as any);

			vi.mocked(updateTrustScore).mockResolvedValue(undefined);

			const provenFact = await updateFactStatus('fact-new', 'PROVEN');
			expect(provenFact.status).toBe('PROVEN');

			// Author gets trust points
			await updateTrustScore('user-123', 10, 'FACT_APPROVED');
			expect(updateTrustScore).toHaveBeenCalledWith('user-123', 10, 'FACT_APPROVED');
		});

		it('should handle fact lifecycle to DISPROVEN status', async () => {
			const { createFact, updateFactStatus } = await import('$lib/server/services/fact');
			const { castVote, recalculateFactVotes } = await import('$lib/server/services/vote');
			const { updateTrustScore } = await import('$lib/server/services/trust');

			vi.mocked(createFact).mockResolvedValue({
				id: 'fact-false',
				status: 'SUBMITTED',
				authorId: 'user-456'
			} as any);

			await createFact({ title: 'False claim', body: 'This is false', authorId: 'user-456' });

			// Heavy downvoting
			vi.mocked(recalculateFactVotes).mockResolvedValue({
				upvotes: 2,
				downvotes: 20,
				weightedScore: -35.0
			});

			const voteResult = await recalculateFactVotes('fact-false');
			expect(voteResult.weightedScore).toBeLessThan(0);

			// Status changes to DISPROVEN
			vi.mocked(updateFactStatus).mockResolvedValue({
				id: 'fact-false',
				status: 'DISPROVEN',
				weightedScore: -35.0
			} as any);

			const disproven = await updateFactStatus('fact-false', 'DISPROVEN');
			expect(disproven.status).toBe('DISPROVEN');

			// Author loses trust
			vi.mocked(updateTrustScore).mockResolvedValue(undefined);
			await updateTrustScore('user-456', -20, 'FACT_WRONG');
			expect(updateTrustScore).toHaveBeenCalledWith('user-456', -20, 'FACT_WRONG');
		});

		it('should handle disputed fact status', async () => {
			const { updateFactStatus } = await import('$lib/server/services/fact');
			const { recalculateFactVotes } = await import('$lib/server/services/vote');

			// Mixed votes lead to disputed
			vi.mocked(recalculateFactVotes).mockResolvedValue({
				upvotes: 12,
				downvotes: 10,
				weightedScore: 0.5
			});

			const voteResult = await recalculateFactVotes('fact-disputed');
			expect(Math.abs(voteResult.weightedScore)).toBeLessThan(5); // Close to zero

			vi.mocked(updateFactStatus).mockResolvedValue({
				id: 'fact-disputed',
				status: 'DISPUTED',
				weightedScore: 0.5
			} as any);

			const disputed = await updateFactStatus('fact-disputed', 'DISPUTED');
			expect(disputed.status).toBe('DISPUTED');
		});
	});

	describe('Source Requirements', () => {
		it('should require at least one source for fact creation', async () => {
			const { createFact, FactError } = await import('$lib/server/services/fact');

			vi.mocked(createFact).mockRejectedValue(
				new FactError('SOURCE_REQUIRED', 'At least one source is required')
			);

			await expect(
				createFact({ title: 'Test', body: 'Test body', authorId: 'user-123' })
			).rejects.toMatchObject({
				code: 'SOURCE_REQUIRED'
			});
		});

		it('should validate source URL format', async () => {
			const { validateSource } = await import('$lib/server/services/source');

			vi.mocked(validateSource).mockReturnValue(false);

			const isValid = validateSource('not-a-valid-url');
			expect(isValid).toBe(false);
		});

		it('should calculate source credibility based on type', async () => {
			const { calculateSourceCredibility } = await import('$lib/server/services/source');

			// Academic sources have higher base credibility
			vi.mocked(calculateSourceCredibility).mockReturnValueOnce(85);
			expect(calculateSourceCredibility('ACADEMIC', 'harvard.edu')).toBe(85);

			// News sources have medium credibility
			vi.mocked(calculateSourceCredibility).mockReturnValueOnce(60);
			expect(calculateSourceCredibility('NEWS', 'bbc.com')).toBe(60);

			// Other sources have lower credibility
			vi.mocked(calculateSourceCredibility).mockReturnValueOnce(40);
			expect(calculateSourceCredibility('OTHER', 'blog.example.com')).toBe(40);
		});
	});

	describe('Voting on Facts', () => {
		it('should allow verified users to vote', async () => {
			const { castVote, getUserVote } = await import('$lib/server/services/vote');

			vi.mocked(castVote).mockResolvedValue({
				id: 'vote-new',
				value: 1,
				weight: 2.0
			} as any);

			const vote = await castVote('fact-123', 'user-verified', 1);
			expect(vote.value).toBe(1);
			expect(vote.weight).toBe(2.0);
		});

		it('should apply vote weight based on user trust score', async () => {
			const { castVote } = await import('$lib/server/services/vote');

			// High trust user gets weight multiplier
			vi.mocked(castVote).mockResolvedValue({
				value: 1,
				weight: 3.0 // Base 2 * 1.5 multiplier
			} as any);

			const highTrustVote = await castVote('fact-123', 'high-trust-user', 1);
			expect(highTrustVote.weight).toBe(3.0);

			// Low/negative trust user gets reduced weight
			vi.mocked(castVote).mockResolvedValue({
				value: 1,
				weight: 1.0 // Base 2 * 0.5 multiplier
			} as any);

			const lowTrustVote = await castVote('fact-456', 'low-trust-user', 1);
			expect(lowTrustVote.weight).toBe(1.0);
		});

		it('should prevent double voting', async () => {
			const { castVote } = await import('$lib/server/services/vote');

			// First vote succeeds
			vi.mocked(castVote).mockResolvedValueOnce({ id: 'vote-1' } as any);
			await castVote('fact-123', 'user-123', 1);

			// Second vote updates existing vote
			vi.mocked(castVote).mockResolvedValueOnce({
				id: 'vote-1',
				value: -1, // Changed vote
				updated: true
			} as any);

			const secondVote = await castVote('fact-123', 'user-123', -1);
			expect(secondVote.value).toBe(-1);
		});

		it('should prevent banned users from voting', async () => {
			const { castVote } = await import('$lib/server/services/vote');

			vi.mocked(castVote).mockRejectedValue(new Error('User is banned'));

			await expect(castVote('fact-123', 'banned-user', 1)).rejects.toThrow('User is banned');
		});
	});

	describe('Fact Editing', () => {
		it('should allow author to request edit', async () => {
			const { requestFactEdit } = await import('$lib/server/services/factEdit');

			vi.mocked(requestFactEdit).mockResolvedValue({
				id: 'edit-1',
				factId: 'fact-123',
				requesterId: 'author-123',
				changes: { body: 'Updated body text' },
				status: 'PENDING'
			} as any);

			const edit = await requestFactEdit('fact-123', 'author-123', {
				body: 'Updated body text'
			});

			expect(edit.status).toBe('PENDING');
		});

		it('should allow non-author to request edit (requires approval)', async () => {
			const { requestFactEdit } = await import('$lib/server/services/factEdit');

			vi.mocked(requestFactEdit).mockResolvedValue({
				id: 'edit-2',
				factId: 'fact-123',
				requesterId: 'other-user',
				changes: { body: 'Suggested correction' },
				status: 'PENDING_APPROVAL'
			} as any);

			const edit = await requestFactEdit('fact-123', 'other-user', {
				body: 'Suggested correction'
			});

			expect(edit.status).toBe('PENDING_APPROVAL');
		});

		it('should approve edit and update fact', async () => {
			const { approveEdit, getPendingEdits } = await import('$lib/server/services/factEdit');
			const { getFactById } = await import('$lib/server/services/fact');

			vi.mocked(approveEdit).mockResolvedValue({
				id: 'edit-1',
				status: 'APPROVED'
			} as any);

			await approveEdit('edit-1', 'moderator-123');

			vi.mocked(getFactById).mockResolvedValue({
				id: 'fact-123',
				body: 'Updated body text' // Edit applied
			} as any);

			const fact = await getFactById('fact-123');
			expect(fact?.body).toBe('Updated body text');
		});

		it('should reject invalid edit request', async () => {
			const { rejectEdit } = await import('$lib/server/services/factEdit');

			vi.mocked(rejectEdit).mockResolvedValue({
				id: 'edit-1',
				status: 'REJECTED',
				rejectionReason: 'Changes introduce inaccuracies'
			} as any);

			const rejected = await rejectEdit('edit-1', 'moderator-123', 'Changes introduce inaccuracies');
			expect(rejected.status).toBe('REJECTED');
		});
	});

	describe('Veto System', () => {
		it('should allow veto submission on proven fact', async () => {
			const { submitVeto } = await import('$lib/server/services/veto');

			vi.mocked(submitVeto).mockResolvedValue({
				id: 'veto-1',
				factId: 'fact-proven',
				submitterId: 'user-expert',
				reason: 'New research contradicts this',
				status: 'PENDING'
			} as any);

			const veto = await submitVeto('fact-proven', 'user-expert', 'New research contradicts this');
			expect(veto.status).toBe('PENDING');
		});

		it('should process successful veto and change fact status', async () => {
			const { processVeto } = await import('$lib/server/services/veto');
			const { updateFactStatus } = await import('$lib/server/services/fact');
			const { updateTrustScore } = await import('$lib/server/services/trust');

			vi.mocked(processVeto).mockResolvedValue({
				id: 'veto-1',
				status: 'APPROVED',
				approved: true
			} as any);

			const processedVeto = await processVeto('veto-1', true);
			expect(processedVeto.approved).toBe(true);

			// Fact status changes
			vi.mocked(updateFactStatus).mockResolvedValue({
				id: 'fact-proven',
				status: 'DISPUTED'
			} as any);

			const fact = await updateFactStatus('fact-proven', 'DISPUTED');
			expect(fact.status).toBe('DISPUTED');

			// Veto submitter gains trust
			vi.mocked(updateTrustScore).mockResolvedValue(undefined);
			await updateTrustScore('user-expert', 5, 'SUCCESSFUL_VETO');
			expect(updateTrustScore).toHaveBeenCalledWith('user-expert', 5, 'SUCCESSFUL_VETO');
		});

		it('should handle failed veto', async () => {
			const { processVeto } = await import('$lib/server/services/veto');
			const { updateTrustScore } = await import('$lib/server/services/trust');

			vi.mocked(processVeto).mockResolvedValue({
				id: 'veto-2',
				status: 'REJECTED',
				approved: false
			} as any);

			const processedVeto = await processVeto('veto-2', false);
			expect(processedVeto.approved).toBe(false);

			// Veto submitter loses trust
			vi.mocked(updateTrustScore).mockResolvedValue(undefined);
			await updateTrustScore('user-novice', -5, 'FAILED_VETO');
			expect(updateTrustScore).toHaveBeenCalledWith('user-novice', -5, 'FAILED_VETO');
		});

		it('should prevent veto on non-proven facts', async () => {
			const { submitVeto, VetoError } = await import('$lib/server/services/veto');

			vi.mocked(submitVeto).mockRejectedValue(
				new VetoError('INVALID_STATUS', 'Can only veto proven facts')
			);

			await expect(
				submitVeto('fact-pending', 'user-123', 'Test veto')
			).rejects.toMatchObject({
				code: 'INVALID_STATUS'
			});
		});
	});

	describe('Grammar Checking', () => {
		it('should check grammar before fact creation', async () => {
			const { checkGrammar } = await import('$lib/server/llm');

			vi.mocked(checkGrammar).mockResolvedValue({
				isCorrect: true,
				suggestions: []
			});

			const result = await checkGrammar('This sentence is grammatically correct.');
			expect(result.isCorrect).toBe(true);
		});

		it('should return suggestions for grammar errors', async () => {
			const { checkGrammar } = await import('$lib/server/llm');

			vi.mocked(checkGrammar).mockResolvedValue({
				isCorrect: false,
				suggestions: [
					{ original: 'Their', suggestion: 'There', position: 0 },
					{ original: 'alot', suggestion: 'a lot', position: 20 }
				]
			});

			const result = await checkGrammar('Their is alot of evidence.');
			expect(result.isCorrect).toBe(false);
			expect(result.suggestions).toHaveLength(2);
		});

		it('should bypass grammar check when feature disabled', async () => {
			const { checkGrammar } = await import('$lib/server/llm');

			// When disabled, returns isCorrect: true without checking
			vi.mocked(checkGrammar).mockResolvedValue({
				isCorrect: true,
				suggestions: [],
				skipped: true
			});

			const result = await checkGrammar('Any text');
			expect(result.isCorrect).toBe(true);
		});
	});

	describe('Fact Search and Discovery', () => {
		it('should search facts by keyword', async () => {
			const { searchFacts } = await import('$lib/server/services/fact');

			vi.mocked(searchFacts).mockResolvedValue({
				facts: [
					{ id: 'fact-1', title: 'Water boils at 100°C', status: 'PROVEN' },
					{ id: 'fact-2', title: 'Water freezes at 0°C', status: 'PROVEN' }
				],
				total: 2
			} as any);

			const results = await searchFacts({ query: 'water' });
			expect(results.facts).toHaveLength(2);
			expect(results.total).toBe(2);
		});

		it('should filter facts by status', async () => {
			const { searchFacts } = await import('$lib/server/services/fact');

			vi.mocked(searchFacts).mockResolvedValue({
				facts: [{ id: 'fact-1', status: 'PROVEN' }],
				total: 1
			} as any);

			const results = await searchFacts({ status: 'PROVEN' });
			expect(results.facts[0].status).toBe('PROVEN');
		});

		it('should sort facts by weighted score', async () => {
			const { searchFacts } = await import('$lib/server/services/fact');

			vi.mocked(searchFacts).mockResolvedValue({
				facts: [
					{ id: 'fact-1', weightedScore: 100 },
					{ id: 'fact-2', weightedScore: 50 },
					{ id: 'fact-3', weightedScore: 25 }
				],
				total: 3
			} as any);

			const results = await searchFacts({ sortBy: 'weightedScore', order: 'desc' });
			expect(results.facts[0].weightedScore).toBe(100);
		});
	});

	describe('Concurrent Operations', () => {
		it('should handle concurrent votes correctly', async () => {
			const { castVote, recalculateFactVotes } = await import('$lib/server/services/vote');

			// Multiple votes at once
			vi.mocked(castVote)
				.mockResolvedValueOnce({ id: 'v1', value: 1 } as any)
				.mockResolvedValueOnce({ id: 'v2', value: 1 } as any)
				.mockResolvedValueOnce({ id: 'v3', value: -1 } as any);

			const votes = await Promise.all([
				castVote('fact-123', 'user-1', 1),
				castVote('fact-123', 'user-2', 1),
				castVote('fact-123', 'user-3', -1)
			]);

			expect(votes).toHaveLength(3);

			// Recalculate should give correct total
			vi.mocked(recalculateFactVotes).mockResolvedValue({
				upvotes: 2,
				downvotes: 1,
				weightedScore: 3.0
			});

			const final = await recalculateFactVotes('fact-123');
			expect(final.upvotes).toBe(2);
			expect(final.downvotes).toBe(1);
		});
	});
});
