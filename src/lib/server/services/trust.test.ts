import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock database
vi.mock('../db', () => ({
	db: {
		user: {
			findUnique: vi.fn(),
			update: vi.fn(),
			findMany: vi.fn()
		},
		trustScoreConfig: {
			findMany: vi.fn(),
			upsert: vi.fn(),
			count: vi.fn()
		},
		trustModifierConfig: {
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			count: vi.fn()
		}
	}
}));

// Mock trustScore utility
vi.mock('$lib/utils/trustScore', () => ({
	calculateTrustChange: vi.fn((action: string) => {
		const points: Record<string, number> = {
			FACT_APPROVED: 10,
			FACT_WRONG: -20,
			FACT_OUTDATED: 0,
			VETO_SUCCESS: 5,
			VETO_FAIL: -5,
			VERIFICATION_CORRECT: 3,
			VERIFICATION_WRONG: -10,
			UPVOTED: 1,
			DOWNVOTED: -1
		};
		return points[action] || 0;
	}),
	getVoteModifier: vi.fn((trustScore: number) => {
		if (trustScore >= 100) return 1.5;
		if (trustScore >= 50) return 1.2;
		if (trustScore >= 0) return 1.0;
		if (trustScore >= -25) return 0.5;
		if (trustScore >= -50) return 0.25;
		return 0;
	}),
	setCachedTrustPoints: vi.fn(),
	setCachedModifiers: vi.fn(),
	getDefaultTrustPoints: vi.fn().mockReturnValue({
		FACT_APPROVED: 10,
		FACT_WRONG: -20,
		FACT_OUTDATED: 0,
		VETO_SUCCESS: 5,
		VETO_FAIL: -5,
		VERIFICATION_CORRECT: 3,
		VERIFICATION_WRONG: -10,
		UPVOTED: 1,
		DOWNVOTED: -1
	}),
	getDefaultTrustModifiers: vi.fn().mockReturnValue([
		{ minTrust: 100, maxTrust: null, modifier: 1.5 },
		{ minTrust: 50, maxTrust: 99, modifier: 1.2 },
		{ minTrust: 0, maxTrust: 49, modifier: 1.0 },
		{ minTrust: -25, maxTrust: -1, modifier: 0.5 },
		{ minTrust: -50, maxTrust: -26, modifier: 0.25 },
		{ minTrust: -Infinity, maxTrust: -51, modifier: 0 }
	]),
	calculateNewTrustScore: vi.fn((current: number, action: string) => {
		const points: Record<string, number> = {
			FACT_APPROVED: 10,
			FACT_WRONG: -20,
			VETO_SUCCESS: 5,
			VETO_FAIL: -5
		};
		return current + (points[action] || 0);
	})
}));

describe('T8: Trust Service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('loadTrustConfig', () => {
		it('should load trust config from database', async () => {
			const { db } = await import('../db');
			const { setCachedTrustPoints, setCachedModifiers } = await import('$lib/utils/trustScore');
			const { loadTrustConfig } = await import('./trust');

			vi.mocked(db.trustScoreConfig.findMany).mockResolvedValue([
				{ id: '1', action: 'FACT_APPROVED', points: 15, createdAt: new Date(), updatedAt: new Date() }
			] as any);

			vi.mocked(db.trustModifierConfig.findMany).mockResolvedValue([
				{ id: '1', minTrust: 100, maxTrust: null, modifier: 1.5 }
			] as any);

			await loadTrustConfig();

			expect(db.trustScoreConfig.findMany).toHaveBeenCalled();
			expect(db.trustModifierConfig.findMany).toHaveBeenCalled();
			expect(setCachedTrustPoints).toHaveBeenCalled();
			expect(setCachedModifiers).toHaveBeenCalled();
		});

		it('should use defaults if database is empty', async () => {
			const { db } = await import('../db');
			const { setCachedTrustPoints, setCachedModifiers } = await import('$lib/utils/trustScore');
			const { loadTrustConfig } = await import('./trust');

			vi.mocked(db.trustScoreConfig.findMany).mockResolvedValue([]);
			vi.mocked(db.trustModifierConfig.findMany).mockResolvedValue([]);

			await loadTrustConfig();

			expect(setCachedTrustPoints).not.toHaveBeenCalled();
			expect(setCachedModifiers).not.toHaveBeenCalled();
		});

		it('should handle database errors gracefully', async () => {
			const { db } = await import('../db');
			const { loadTrustConfig } = await import('./trust');

			vi.mocked(db.trustScoreConfig.findMany).mockRejectedValue(new Error('DB error'));

			// Should not throw
			await expect(loadTrustConfig()).resolves.not.toThrow();
		});
	});

	describe('updateUserTrustScore', () => {
		const mockUser = {
			id: 'user-123',
			email: 'test@example.com',
			trustScore: 50
		};

		it('should increase trust score for FACT_APPROVED', async () => {
			const { db } = await import('../db');
			const { updateUserTrustScore } = await import('./trust');

			vi.mocked(db.user.findUnique).mockResolvedValue(mockUser as any);
			vi.mocked(db.user.update).mockResolvedValue({
				...mockUser,
				trustScore: 60
			} as any);

			const result = await updateUserTrustScore('user-123', 'FACT_APPROVED');

			expect(result.change).toBe(10);
			expect(result.newScore).toBe(60);
			expect(db.user.update).toHaveBeenCalledWith({
				where: { id: 'user-123' },
				data: { trustScore: 60 }
			});
		});

		it('should decrease trust score for FACT_WRONG', async () => {
			const { db } = await import('../db');
			const { updateUserTrustScore } = await import('./trust');

			vi.mocked(db.user.findUnique).mockResolvedValue(mockUser as any);
			vi.mocked(db.user.update).mockResolvedValue({
				...mockUser,
				trustScore: 30
			} as any);

			const result = await updateUserTrustScore('user-123', 'FACT_WRONG');

			expect(result.change).toBe(-20);
			expect(result.newScore).toBe(30);
		});

		it('should not change trust score for FACT_OUTDATED', async () => {
			const { db } = await import('../db');
			const { updateUserTrustScore } = await import('./trust');

			vi.mocked(db.user.findUnique).mockResolvedValue(mockUser as any);
			vi.mocked(db.user.update).mockResolvedValue(mockUser as any);

			const result = await updateUserTrustScore('user-123', 'FACT_OUTDATED');

			expect(result.change).toBe(0);
			expect(result.newScore).toBe(50);
		});

		it('should throw error for non-existent user', async () => {
			const { db } = await import('../db');
			const { updateUserTrustScore } = await import('./trust');

			vi.mocked(db.user.findUnique).mockResolvedValue(null);

			await expect(
				updateUserTrustScore('nonexistent', 'FACT_APPROVED')
			).rejects.toThrow('User not found');
		});

		it('should handle veto success', async () => {
			const { db } = await import('../db');
			const { updateUserTrustScore } = await import('./trust');

			vi.mocked(db.user.findUnique).mockResolvedValue(mockUser as any);
			vi.mocked(db.user.update).mockResolvedValue({
				...mockUser,
				trustScore: 55
			} as any);

			const result = await updateUserTrustScore('user-123', 'VETO_SUCCESS');

			expect(result.change).toBe(5);
		});

		it('should handle veto failure', async () => {
			const { db } = await import('../db');
			const { updateUserTrustScore } = await import('./trust');

			vi.mocked(db.user.findUnique).mockResolvedValue(mockUser as any);
			vi.mocked(db.user.update).mockResolvedValue({
				...mockUser,
				trustScore: 45
			} as any);

			const result = await updateUserTrustScore('user-123', 'VETO_FAIL');

			expect(result.change).toBe(-5);
		});
	});

	describe('getUserVoteModifier', () => {
		it('should return 1.5x modifier for trust >= 100', async () => {
			const { db } = await import('../db');
			const { getUserVoteModifier } = await import('./trust');

			vi.mocked(db.user.findUnique).mockResolvedValue({
				id: 'user-123',
				trustScore: 100
			} as any);

			const modifier = await getUserVoteModifier('user-123');

			expect(modifier).toBe(1.5);
		});

		it('should return 1.2x modifier for trust 50-99', async () => {
			const { db } = await import('../db');
			const { getUserVoteModifier } = await import('./trust');

			vi.mocked(db.user.findUnique).mockResolvedValue({
				id: 'user-123',
				trustScore: 75
			} as any);

			const modifier = await getUserVoteModifier('user-123');

			expect(modifier).toBe(1.2);
		});

		it('should return 1.0x modifier for trust 0-49', async () => {
			const { db } = await import('../db');
			const { getUserVoteModifier } = await import('./trust');

			vi.mocked(db.user.findUnique).mockResolvedValue({
				id: 'user-123',
				trustScore: 25
			} as any);

			const modifier = await getUserVoteModifier('user-123');

			expect(modifier).toBe(1.0);
		});

		it('should return 0.5x modifier for trust -1 to -25', async () => {
			const { db } = await import('../db');
			const { getUserVoteModifier } = await import('./trust');

			vi.mocked(db.user.findUnique).mockResolvedValue({
				id: 'user-123',
				trustScore: -10
			} as any);

			const modifier = await getUserVoteModifier('user-123');

			expect(modifier).toBe(0.5);
		});

		it('should return 0x modifier for trust below -50', async () => {
			const { db } = await import('../db');
			const { getUserVoteModifier } = await import('./trust');

			vi.mocked(db.user.findUnique).mockResolvedValue({
				id: 'user-123',
				trustScore: -75
			} as any);

			const modifier = await getUserVoteModifier('user-123');

			expect(modifier).toBe(0);
		});

		it('should throw error for non-existent user', async () => {
			const { db } = await import('../db');
			const { getUserVoteModifier } = await import('./trust');

			vi.mocked(db.user.findUnique).mockResolvedValue(null);

			await expect(
				getUserVoteModifier('nonexistent')
			).rejects.toThrow('User not found');
		});
	});

	describe('getTrustScoreConfig', () => {
		it('should return trust score configuration', async () => {
			const { db } = await import('../db');
			const { getDefaultTrustPoints } = await import('$lib/utils/trustScore');
			const { getTrustScoreConfig } = await import('./trust');

			vi.mocked(db.trustScoreConfig.findMany).mockResolvedValue([
				{ action: 'FACT_APPROVED', points: 10 },
				{ action: 'FACT_WRONG', points: -20 }
			] as any);
			vi.mocked(getDefaultTrustPoints).mockReturnValue({
				FACT_APPROVED: 10,
				FACT_WRONG: -20,
				FACT_OUTDATED: 0,
				VETO_SUCCESS: 5,
				VETO_FAIL: -5,
				VERIFICATION_CORRECT: 3,
				VERIFICATION_WRONG: -10,
				UPVOTED: 1,
				DOWNVOTED: -1
			});

			const config = await getTrustScoreConfig();

			expect(config.FACT_APPROVED).toBe(10);
			expect(config.FACT_WRONG).toBe(-20);
		});

		it('should fill in defaults for missing actions', async () => {
			const { db } = await import('../db');
			const { getDefaultTrustPoints } = await import('$lib/utils/trustScore');
			const { getTrustScoreConfig } = await import('./trust');

			vi.mocked(db.trustScoreConfig.findMany).mockResolvedValue([]);
			vi.mocked(getDefaultTrustPoints).mockReturnValue({
				FACT_APPROVED: 10,
				FACT_WRONG: -20,
				FACT_OUTDATED: 0,
				VETO_SUCCESS: 5,
				VETO_FAIL: -5,
				VERIFICATION_CORRECT: 3,
				VERIFICATION_WRONG: -10,
				UPVOTED: 1,
				DOWNVOTED: -1
			});

			const config = await getTrustScoreConfig();

			expect(config.FACT_APPROVED).toBe(10);
			expect(config.VETO_SUCCESS).toBe(5);
		});
	});

	describe('getTopTrustedUsers', () => {
		it('should return top users by trust score', async () => {
			const { db } = await import('../db');
			const { getTopTrustedUsers } = await import('./trust');

			const mockUsers = [
				{ id: '1', trustScore: 100 },
				{ id: '2', trustScore: 80 },
				{ id: '3', trustScore: 60 }
			];

			vi.mocked(db.user.findMany).mockResolvedValue(mockUsers as any);

			const users = await getTopTrustedUsers(3);

			expect(users).toHaveLength(3);
			expect(db.user.findMany).toHaveBeenCalledWith({
				where: { deletedAt: null },
				orderBy: { trustScore: 'desc' },
				take: 3
			});
		});

		it('should default to limit of 10', async () => {
			const { db } = await import('../db');
			const { getTopTrustedUsers } = await import('./trust');

			vi.mocked(db.user.findMany).mockResolvedValue([]);

			await getTopTrustedUsers();

			expect(db.user.findMany).toHaveBeenCalledWith(
				expect.objectContaining({ take: 10 })
			);
		});
	});

	describe('getUsersByTrustRange', () => {
		it('should return users in trust score range', async () => {
			const { db } = await import('../db');
			const { getUsersByTrustRange } = await import('./trust');

			vi.mocked(db.user.findMany).mockResolvedValue([
				{ id: '1', trustScore: 60 },
				{ id: '2', trustScore: 55 }
			] as any);

			const users = await getUsersByTrustRange(50, 70);

			expect(db.user.findMany).toHaveBeenCalledWith({
				where: {
					trustScore: { gte: 50, lte: 70 },
					deletedAt: null
				},
				orderBy: { trustScore: 'desc' }
			});
		});

		it('should work with only minimum trust', async () => {
			const { db } = await import('../db');
			const { getUsersByTrustRange } = await import('./trust');

			vi.mocked(db.user.findMany).mockResolvedValue([]);

			await getUsersByTrustRange(50);

			expect(db.user.findMany).toHaveBeenCalledWith({
				where: {
					trustScore: { gte: 50 },
					deletedAt: null
				},
				orderBy: { trustScore: 'desc' }
			});
		});
	});

	describe('previewTrustChange', () => {
		it('should preview trust change without updating', async () => {
			const { previewTrustChange } = await import('./trust');

			const preview = previewTrustChange(50, 'FACT_APPROVED');

			expect(preview.change).toBe(10);
			expect(preview.newScore).toBe(60);
			expect(preview.newModifier).toBe(1.2);
		});

		it('should preview negative trust change', async () => {
			const { previewTrustChange } = await import('./trust');

			const preview = previewTrustChange(10, 'FACT_WRONG');

			expect(preview.change).toBe(-20);
			expect(preview.newScore).toBe(-10);
			expect(preview.newModifier).toBe(0.5);
		});
	});

	describe('batchUpdateTrustScores', () => {
		it('should update multiple users', async () => {
			const { db } = await import('../db');
			const { batchUpdateTrustScores } = await import('./trust');

			vi.mocked(db.user.findUnique).mockResolvedValue({
				id: 'user-1',
				trustScore: 50
			} as any);
			vi.mocked(db.user.update).mockResolvedValue({} as any);

			const updates = [
				{ userId: 'user-1', action: 'FACT_APPROVED' as const },
				{ userId: 'user-2', action: 'UPVOTED' as const }
			];

			await batchUpdateTrustScores(updates);

			expect(db.user.findUnique).toHaveBeenCalledTimes(2);
			expect(db.user.update).toHaveBeenCalledTimes(2);
		});
	});
});
