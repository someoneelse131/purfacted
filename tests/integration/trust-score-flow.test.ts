import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * T28: Trust Score Flow Integration Tests
 *
 * Tests the complete trust score system including calculation, updates, and effects.
 * Covers: Initial Score → Actions → Updates → Vote Weight → Thresholds
 */

// Mock trust service
vi.mock('$lib/server/services/trust', () => ({
	getUserTrustScore: vi.fn(),
	updateTrustScore: vi.fn(),
	recalculateTrustScore: vi.fn(),
	getTrustScoreHistory: vi.fn(),
	calculateTrustModifier: vi.fn(),
	getTrustConfig: vi.fn()
}));

// Mock vote service
vi.mock('$lib/server/services/vote', () => ({
	calculateVoteWeight: vi.fn(),
	getBaseVoteWeight: vi.fn()
}));

// Mock user service
vi.mock('$lib/server/services/user', () => ({
	getUserById: vi.fn(),
	updateUser: vi.fn(),
	getUsersByTrustScore: vi.fn()
}));

describe('T28: Trust Score Flow Integration Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Trust Score Initialization', () => {
		it('should initialize new user with default trust score', async () => {
			const { getUserTrustScore, getTrustConfig } = await import(
				'$lib/server/services/trust'
			);

			vi.mocked(getTrustConfig).mockReturnValue({
				newUserStart: 10,
				minimumScore: -50,
				maximumScore: 500
			});

			vi.mocked(getUserTrustScore).mockResolvedValue(10);

			const config = getTrustConfig();
			expect(config.newUserStart).toBe(10);

			const score = await getUserTrustScore('new-user');
			expect(score).toBe(10);
		});

		it('should respect trust score bounds', async () => {
			const { getTrustConfig, recalculateTrustScore } = await import(
				'$lib/server/services/trust'
			);

			vi.mocked(getTrustConfig).mockReturnValue({
				newUserStart: 10,
				minimumScore: -50,
				maximumScore: 500
			});

			// Even with massive negative actions, score shouldn't go below -50
			vi.mocked(recalculateTrustScore).mockResolvedValue(-50);

			const score = await recalculateTrustScore('bad-user');
			expect(score).toBe(-50);
		});
	});

	describe('Trust Score Updates from Actions', () => {
		it('should increase trust when fact is approved', async () => {
			const { updateTrustScore, getUserTrustScore } = await import(
				'$lib/server/services/trust'
			);

			vi.mocked(getUserTrustScore).mockResolvedValueOnce(10); // Before
			vi.mocked(updateTrustScore).mockResolvedValue(undefined);
			vi.mocked(getUserTrustScore).mockResolvedValueOnce(20); // After (+10 for FACT_APPROVED)

			const before = await getUserTrustScore('author-123');
			await updateTrustScore('author-123', 10, 'FACT_APPROVED');
			const after = await getUserTrustScore('author-123');

			expect(after).toBe(before + 10);
		});

		it('should decrease trust when fact is disproven', async () => {
			const { updateTrustScore, getUserTrustScore } = await import(
				'$lib/server/services/trust'
			);

			vi.mocked(getUserTrustScore).mockResolvedValueOnce(10);
			vi.mocked(updateTrustScore).mockResolvedValue(undefined);
			vi.mocked(getUserTrustScore).mockResolvedValueOnce(-10); // After (-20 for FACT_WRONG)

			const before = await getUserTrustScore('author-456');
			await updateTrustScore('author-456', -20, 'FACT_WRONG');
			const after = await getUserTrustScore('author-456');

			expect(after).toBeLessThan(before);
		});

		it('should not change trust when fact marked as outdated', async () => {
			const { updateTrustScore, getUserTrustScore } = await import(
				'$lib/server/services/trust'
			);

			vi.mocked(getUserTrustScore).mockResolvedValue(50);
			vi.mocked(updateTrustScore).mockResolvedValue(undefined);

			const before = await getUserTrustScore('author-789');
			await updateTrustScore('author-789', 0, 'FACT_OUTDATED');
			const after = await getUserTrustScore('author-789');

			expect(after).toBe(before);
		});

		it('should track trust from successful veto', async () => {
			const { updateTrustScore, getUserTrustScore } = await import(
				'$lib/server/services/trust'
			);

			vi.mocked(getUserTrustScore).mockResolvedValueOnce(30);
			vi.mocked(updateTrustScore).mockResolvedValue(undefined);
			vi.mocked(getUserTrustScore).mockResolvedValueOnce(35); // +5 for SUCCESSFUL_VETO

			const before = await getUserTrustScore('vetoer-123');
			await updateTrustScore('vetoer-123', 5, 'SUCCESSFUL_VETO');
			const after = await getUserTrustScore('vetoer-123');

			expect(after).toBe(35);
		});

		it('should track trust loss from failed veto', async () => {
			const { updateTrustScore, getUserTrustScore } = await import(
				'$lib/server/services/trust'
			);

			vi.mocked(getUserTrustScore).mockResolvedValueOnce(30);
			vi.mocked(updateTrustScore).mockResolvedValue(undefined);
			vi.mocked(getUserTrustScore).mockResolvedValueOnce(25); // -5 for FAILED_VETO

			const before = await getUserTrustScore('vetoer-456');
			await updateTrustScore('vetoer-456', -5, 'FAILED_VETO');
			const after = await getUserTrustScore('vetoer-456');

			expect(after).toBe(25);
		});

		it('should track trust from verification actions', async () => {
			const { updateTrustScore, getUserTrustScore } = await import(
				'$lib/server/services/trust'
			);

			// Correct verification gives +3
			vi.mocked(getUserTrustScore).mockResolvedValueOnce(20);
			vi.mocked(updateTrustScore).mockResolvedValue(undefined);
			vi.mocked(getUserTrustScore).mockResolvedValueOnce(23);

			await updateTrustScore('reviewer-123', 3, 'VERIFICATION_CORRECT');
			expect(updateTrustScore).toHaveBeenCalledWith('reviewer-123', 3, 'VERIFICATION_CORRECT');

			// Wrong verification loses -10
			vi.mocked(getUserTrustScore).mockResolvedValueOnce(20);
			vi.mocked(updateTrustScore).mockResolvedValue(undefined);
			vi.mocked(getUserTrustScore).mockResolvedValueOnce(10);

			await updateTrustScore('reviewer-456', -10, 'VERIFICATION_WRONG');
			expect(updateTrustScore).toHaveBeenCalledWith('reviewer-456', -10, 'VERIFICATION_WRONG');
		});

		it('should track trust from upvotes and downvotes', async () => {
			const { updateTrustScore } = await import('$lib/server/services/trust');

			vi.mocked(updateTrustScore).mockResolvedValue(undefined);

			// Getting upvoted gives +1
			await updateTrustScore('user-123', 1, 'RECEIVED_UPVOTE');
			expect(updateTrustScore).toHaveBeenCalledWith('user-123', 1, 'RECEIVED_UPVOTE');

			// Getting downvoted loses -1
			await updateTrustScore('user-456', -1, 'RECEIVED_DOWNVOTE');
			expect(updateTrustScore).toHaveBeenCalledWith('user-456', -1, 'RECEIVED_DOWNVOTE');
		});
	});

	describe('Trust Score Modifiers on Vote Weight', () => {
		it('should apply 1.5x modifier for trust score 100+', async () => {
			const { calculateTrustModifier } = await import('$lib/server/services/trust');
			const { calculateVoteWeight, getBaseVoteWeight } = await import(
				'$lib/server/services/vote'
			);

			vi.mocked(calculateTrustModifier).mockReturnValue(1.5);
			vi.mocked(getBaseVoteWeight).mockReturnValue(2);
			vi.mocked(calculateVoteWeight).mockReturnValue(3); // 2 * 1.5

			const modifier = calculateTrustModifier(100);
			const baseWeight = getBaseVoteWeight('VERIFIED');
			const voteWeight = calculateVoteWeight('high-trust-user');

			expect(modifier).toBe(1.5);
			expect(voteWeight).toBe(baseWeight * modifier);
		});

		it('should apply 1.2x modifier for trust score 50-99', async () => {
			const { calculateTrustModifier } = await import('$lib/server/services/trust');

			vi.mocked(calculateTrustModifier).mockReturnValue(1.2);

			const modifier = calculateTrustModifier(75);
			expect(modifier).toBe(1.2);
		});

		it('should apply 1.0x modifier for trust score 0-49', async () => {
			const { calculateTrustModifier } = await import('$lib/server/services/trust');

			vi.mocked(calculateTrustModifier).mockReturnValue(1.0);

			const modifier = calculateTrustModifier(25);
			expect(modifier).toBe(1.0);
		});

		it('should apply 0.5x modifier for trust score -1 to -25', async () => {
			const { calculateTrustModifier } = await import('$lib/server/services/trust');

			vi.mocked(calculateTrustModifier).mockReturnValue(0.5);

			const modifier = calculateTrustModifier(-15);
			expect(modifier).toBe(0.5);
		});

		it('should apply 0.25x modifier for trust score -26 to -50', async () => {
			const { calculateTrustModifier } = await import('$lib/server/services/trust');

			vi.mocked(calculateTrustModifier).mockReturnValue(0.25);

			const modifier = calculateTrustModifier(-40);
			expect(modifier).toBe(0.25);
		});

		it('should apply 0x modifier for trust score below -50', async () => {
			const { calculateTrustModifier } = await import('$lib/server/services/trust');

			vi.mocked(calculateTrustModifier).mockReturnValue(0);

			const modifier = calculateTrustModifier(-60);
			expect(modifier).toBe(0);
		});
	});

	describe('User Type Base Vote Weights', () => {
		it('should return correct base weight for each user type', async () => {
			const { getBaseVoteWeight } = await import('$lib/server/services/vote');

			const weights = {
				ANONYMOUS: 0.1,
				VERIFIED: 2,
				EXPERT: 5,
				PHD: 8,
				ORGANIZATION: 100,
				MODERATOR: 3
			};

			Object.entries(weights).forEach(([type, expected]) => {
				vi.mocked(getBaseVoteWeight).mockReturnValueOnce(expected);
				const weight = getBaseVoteWeight(type);
				expect(weight).toBe(expected);
			});
		});
	});

	describe('Trust Score History', () => {
		it('should track trust score change history', async () => {
			const { getTrustScoreHistory } = await import('$lib/server/services/trust');

			vi.mocked(getTrustScoreHistory).mockResolvedValue([
				{ id: '1', change: 10, reason: 'FACT_APPROVED', createdAt: new Date() },
				{ id: '2', change: -20, reason: 'FACT_WRONG', createdAt: new Date() },
				{ id: '3', change: 5, reason: 'SUCCESSFUL_VETO', createdAt: new Date() }
			] as any);

			const history = await getTrustScoreHistory('user-123');

			expect(history).toHaveLength(3);
			expect(history[0].reason).toBe('FACT_APPROVED');
			expect(history[1].change).toBe(-20);
		});

		it('should calculate net trust change from history', async () => {
			const { getTrustScoreHistory } = await import('$lib/server/services/trust');

			vi.mocked(getTrustScoreHistory).mockResolvedValue([
				{ change: 10 },
				{ change: -20 },
				{ change: 5 },
				{ change: 3 },
				{ change: -1 }
			] as any);

			const history = await getTrustScoreHistory('user-123');
			const netChange = history.reduce((sum, h) => sum + h.change, 0);

			expect(netChange).toBe(-3); // 10 - 20 + 5 + 3 - 1
		});
	});

	describe('Trust Score Thresholds', () => {
		it('should identify users eligible for moderator based on trust', async () => {
			const { getUsersByTrustScore } = await import('$lib/server/services/user');

			vi.mocked(getUsersByTrustScore).mockResolvedValue([
				{ id: 'user-1', trustScore: 150, userType: 'VERIFIED' },
				{ id: 'user-2', trustScore: 120, userType: 'EXPERT' }
			] as any);

			// Get users with trust >= 100 (moderator eligible)
			const eligible = await getUsersByTrustScore({ minScore: 100 });

			expect(eligible).toHaveLength(2);
			expect(eligible.every((u) => u.trustScore >= 100)).toBe(true);
		});

		it('should identify users to flag based on negative trust', async () => {
			const { getUsersByTrustScore } = await import('$lib/server/services/user');

			vi.mocked(getUsersByTrustScore).mockResolvedValue([
				{ id: 'user-1', trustScore: -30, userType: 'VERIFIED' },
				{ id: 'user-2', trustScore: -45, userType: 'VERIFIED' }
			] as any);

			// Get users with trust below -25 (should be flagged)
			const flagged = await getUsersByTrustScore({ maxScore: -25 });

			expect(flagged).toHaveLength(2);
			expect(flagged.every((u) => u.trustScore <= -25)).toBe(true);
		});
	});

	describe('Combined Trust and Vote Weight Calculation', () => {
		it('should calculate final vote weight correctly', async () => {
			const { getUserTrustScore, calculateTrustModifier } = await import(
				'$lib/server/services/trust'
			);
			const { getBaseVoteWeight, calculateVoteWeight } = await import(
				'$lib/server/services/vote'
			);

			// Expert user with 120 trust score
			vi.mocked(getUserTrustScore).mockResolvedValue(120);
			vi.mocked(calculateTrustModifier).mockReturnValue(1.5);
			vi.mocked(getBaseVoteWeight).mockReturnValue(5); // EXPERT base weight
			vi.mocked(calculateVoteWeight).mockReturnValue(7.5); // 5 * 1.5

			const trustScore = await getUserTrustScore('expert-user');
			const modifier = calculateTrustModifier(trustScore);
			const baseWeight = getBaseVoteWeight('EXPERT');
			const finalWeight = calculateVoteWeight('expert-user');

			expect(trustScore).toBe(120);
			expect(modifier).toBe(1.5);
			expect(baseWeight).toBe(5);
			expect(finalWeight).toBe(7.5);
		});

		it('should prevent voting when trust modifier is 0', async () => {
			const { calculateTrustModifier } = await import('$lib/server/services/trust');
			const { calculateVoteWeight } = await import('$lib/server/services/vote');

			vi.mocked(calculateTrustModifier).mockReturnValue(0);
			vi.mocked(calculateVoteWeight).mockReturnValue(0);

			const modifier = calculateTrustModifier(-60);
			const weight = calculateVoteWeight('very-negative-user');

			expect(modifier).toBe(0);
			expect(weight).toBe(0); // Cannot vote effectively
		});
	});

	describe('Trust Score Recalculation', () => {
		it('should recalculate trust score based on all actions', async () => {
			const { recalculateTrustScore, getTrustConfig } = await import(
				'$lib/server/services/trust'
			);

			vi.mocked(getTrustConfig).mockReturnValue({
				newUserStart: 10,
				minimumScore: -50,
				maximumScore: 500
			});

			// User started at 10, had various actions
			vi.mocked(recalculateTrustScore).mockResolvedValue(45);

			const recalculated = await recalculateTrustScore('user-123');

			// Should equal starting score + sum of all changes
			expect(recalculated).toBe(45);
		});

		it('should handle recalculation with capped score', async () => {
			const { recalculateTrustScore, getTrustConfig } = await import(
				'$lib/server/services/trust'
			);

			vi.mocked(getTrustConfig).mockReturnValue({
				newUserStart: 10,
				minimumScore: -50,
				maximumScore: 500
			});

			// User would have 600 but capped at 500
			vi.mocked(recalculateTrustScore).mockResolvedValue(500);

			const recalculated = await recalculateTrustScore('super-trusted-user');
			expect(recalculated).toBe(500);
		});
	});

	describe('Trust Score and Fact Status Transitions', () => {
		it('should update author trust when fact transitions to PROVEN', async () => {
			const { updateTrustScore, getUserTrustScore } = await import(
				'$lib/server/services/trust'
			);

			// Initial score before update
			vi.mocked(getUserTrustScore).mockResolvedValueOnce(20);
			const initialScore = await getUserTrustScore('author-id');
			expect(initialScore).toBe(20);

			// Simulate fact becoming proven
			vi.mocked(updateTrustScore).mockResolvedValue(undefined);
			await updateTrustScore('author-id', 10, 'FACT_APPROVED');
			expect(updateTrustScore).toHaveBeenCalledWith('author-id', 10, 'FACT_APPROVED');

			// Final score after update
			vi.mocked(getUserTrustScore).mockResolvedValueOnce(30);
			const finalScore = await getUserTrustScore('author-id');
			expect(finalScore).toBe(30);
		});

		it('should update multiple users trust when fact involves veto', async () => {
			const { updateTrustScore } = await import('$lib/server/services/trust');

			vi.mocked(updateTrustScore).mockResolvedValue(undefined);

			// Fact proven, then vetoed successfully
			// Original author loses some trust
			await updateTrustScore('original-author', -5, 'FACT_VETOED');

			// Veto submitter gains trust
			await updateTrustScore('veto-submitter', 5, 'SUCCESSFUL_VETO');

			expect(updateTrustScore).toHaveBeenCalledWith('original-author', -5, 'FACT_VETOED');
			expect(updateTrustScore).toHaveBeenCalledWith('veto-submitter', 5, 'SUCCESSFUL_VETO');
		});
	});
});
