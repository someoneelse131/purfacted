import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock database
vi.mock('../db', () => ({
	db: {
		user: {
			findUnique: vi.fn(),
			findMany: vi.fn()
		},
		voteWeightConfig: {
			findMany: vi.fn(),
			upsert: vi.fn()
		}
	}
}));

// Mock voteWeight utility
vi.mock('$lib/utils/voteWeight', () => ({
	calculateVoteWeight: vi.fn((userType: string, trustScore: number) => {
		const baseWeights: Record<string, number> = {
			ANONYMOUS: 0.1,
			VERIFIED: 2,
			EXPERT: 5,
			PHD: 8,
			ORGANIZATION: 100,
			MODERATOR: 3
		};

		const base = baseWeights[userType] || 1;

		// Apply trust modifier
		let modifier = 1.0;
		if (trustScore >= 100) modifier = 1.5;
		else if (trustScore >= 50) modifier = 1.2;
		else if (trustScore >= 0) modifier = 1.0;
		else if (trustScore >= -25) modifier = 0.5;
		else if (trustScore >= -50) modifier = 0.25;
		else modifier = 0;

		return base * modifier;
	}),
	setCachedBaseWeights: vi.fn(),
	getDefaultBaseWeights: vi.fn().mockReturnValue({
		ANONYMOUS: 0.1,
		VERIFIED: 2,
		EXPERT: 5,
		PHD: 8,
		ORGANIZATION: 100,
		MODERATOR: 3
	})
}));

describe('T9: Vote Service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('loadVoteWeightConfig', () => {
		it('should load vote weight config from database', async () => {
			const { db } = await import('../db');
			const { setCachedBaseWeights } = await import('$lib/utils/voteWeight');
			const { loadVoteWeightConfig } = await import('./vote');

			vi.mocked(db.voteWeightConfig.findMany).mockResolvedValue([
				{ id: '1', userType: 'VERIFIED', baseWeight: 2.5, createdAt: new Date(), updatedAt: new Date() },
				{ id: '2', userType: 'EXPERT', baseWeight: 6, createdAt: new Date(), updatedAt: new Date() }
			] as any);

			await loadVoteWeightConfig();

			expect(db.voteWeightConfig.findMany).toHaveBeenCalled();
			expect(setCachedBaseWeights).toHaveBeenCalledWith({
				VERIFIED: 2.5,
				EXPERT: 6
			});
		});

		it('should not set cache if database is empty', async () => {
			const { db } = await import('../db');
			const { setCachedBaseWeights } = await import('$lib/utils/voteWeight');
			const { loadVoteWeightConfig } = await import('./vote');

			vi.mocked(db.voteWeightConfig.findMany).mockResolvedValue([]);

			await loadVoteWeightConfig();

			expect(setCachedBaseWeights).not.toHaveBeenCalled();
		});

		it('should handle database errors gracefully', async () => {
			const { db } = await import('../db');
			const { loadVoteWeightConfig } = await import('./vote');

			vi.mocked(db.voteWeightConfig.findMany).mockRejectedValue(new Error('DB error'));

			// Should not throw
			await expect(loadVoteWeightConfig()).resolves.not.toThrow();
		});
	});

	describe('initializeVoteWeightConfig', () => {
		it('should initialize all default vote weights in database', async () => {
			const { db } = await import('../db');
			const { getDefaultBaseWeights } = await import('$lib/utils/voteWeight');
			const { initializeVoteWeightConfig } = await import('./vote');

			vi.mocked(db.voteWeightConfig.upsert).mockResolvedValue({} as any);
			vi.mocked(getDefaultBaseWeights).mockReturnValue({
				ANONYMOUS: 0.1,
				VERIFIED: 2,
				EXPERT: 5,
				PHD: 8,
				ORGANIZATION: 100,
				MODERATOR: 3
			});

			await initializeVoteWeightConfig();

			// Should upsert for each user type
			expect(db.voteWeightConfig.upsert).toHaveBeenCalledTimes(6);
			expect(db.voteWeightConfig.upsert).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { userType: 'VERIFIED' },
					create: { userType: 'VERIFIED', baseWeight: 2 }
				})
			);
		});
	});

	describe('getVoteWeightConfig', () => {
		it('should return vote weight configuration from database', async () => {
			const { db } = await import('../db');
			const { getDefaultBaseWeights } = await import('$lib/utils/voteWeight');
			const { getVoteWeightConfig } = await import('./vote');

			vi.mocked(db.voteWeightConfig.findMany).mockResolvedValue([
				{ userType: 'VERIFIED', baseWeight: 2 },
				{ userType: 'EXPERT', baseWeight: 5 }
			] as any);
			vi.mocked(getDefaultBaseWeights).mockReturnValue({
				ANONYMOUS: 0.1,
				VERIFIED: 2,
				EXPERT: 5,
				PHD: 8,
				ORGANIZATION: 100,
				MODERATOR: 3
			});

			const config = await getVoteWeightConfig();

			expect(config.VERIFIED).toBe(2);
			expect(config.EXPERT).toBe(5);
		});

		it('should fill in defaults for missing user types', async () => {
			const { db } = await import('../db');
			const { getDefaultBaseWeights } = await import('$lib/utils/voteWeight');
			const { getVoteWeightConfig } = await import('./vote');

			vi.mocked(db.voteWeightConfig.findMany).mockResolvedValue([
				{ userType: 'VERIFIED', baseWeight: 2 }
			] as any);
			vi.mocked(getDefaultBaseWeights).mockReturnValue({
				ANONYMOUS: 0.1,
				VERIFIED: 2,
				EXPERT: 5,
				PHD: 8,
				ORGANIZATION: 100,
				MODERATOR: 3
			});

			const config = await getVoteWeightConfig();

			expect(config.VERIFIED).toBe(2);
			expect(config.EXPERT).toBe(5); // Default value
			expect(config.PHD).toBe(8); // Default value
		});
	});

	describe('updateVoteWeightConfig', () => {
		it('should update vote weight in database', async () => {
			const { db } = await import('../db');
			const { updateVoteWeightConfig } = await import('./vote');

			vi.mocked(db.voteWeightConfig.upsert).mockResolvedValue({} as any);
			vi.mocked(db.voteWeightConfig.findMany).mockResolvedValue([]);

			await updateVoteWeightConfig('EXPERT' as any, 7);

			expect(db.voteWeightConfig.upsert).toHaveBeenCalledWith({
				where: { userType: 'EXPERT' },
				create: { userType: 'EXPERT', baseWeight: 7 },
				update: { baseWeight: 7 }
			});
		});

		it('should reload cache after update', async () => {
			const { db } = await import('../db');
			const { updateVoteWeightConfig } = await import('./vote');

			vi.mocked(db.voteWeightConfig.upsert).mockResolvedValue({} as any);
			vi.mocked(db.voteWeightConfig.findMany).mockResolvedValue([
				{ userType: 'EXPERT', baseWeight: 7 }
			] as any);

			await updateVoteWeightConfig('EXPERT' as any, 7);

			// Should call findMany to reload cache
			expect(db.voteWeightConfig.findMany).toHaveBeenCalled();
		});
	});

	describe('getUserVoteWeight', () => {
		const mockVerifiedUser = {
			id: 'user-123',
			userType: 'VERIFIED',
			trustScore: 50
		};

		it('should return vote weight for verified user', async () => {
			const { db } = await import('../db');
			const { getUserVoteWeight } = await import('./vote');

			vi.mocked(db.user.findUnique).mockResolvedValue(mockVerifiedUser as any);

			const weight = await getUserVoteWeight('user-123');

			// VERIFIED (2) * 1.2 (trust 50-99 modifier) = 2.4
			expect(weight).toBe(2.4);
		});

		it('should return vote weight for expert user', async () => {
			const { db } = await import('../db');
			const { getUserVoteWeight } = await import('./vote');

			vi.mocked(db.user.findUnique).mockResolvedValue({
				id: 'user-456',
				userType: 'EXPERT',
				trustScore: 100
			} as any);

			const weight = await getUserVoteWeight('user-456');

			// EXPERT (5) * 1.5 (trust 100+ modifier) = 7.5
			expect(weight).toBe(7.5);
		});

		it('should return vote weight for anonymous user', async () => {
			const { db } = await import('../db');
			const { getUserVoteWeight } = await import('./vote');

			vi.mocked(db.user.findUnique).mockResolvedValue({
				id: 'anon-123',
				userType: 'ANONYMOUS',
				trustScore: 0
			} as any);

			const weight = await getUserVoteWeight('anon-123');

			// ANONYMOUS (0.1) * 1.0 (trust 0-49 modifier) = 0.1
			expect(weight).toBe(0.1);
		});

		it('should apply negative trust modifier', async () => {
			const { db } = await import('../db');
			const { getUserVoteWeight } = await import('./vote');

			vi.mocked(db.user.findUnique).mockResolvedValue({
				id: 'user-789',
				userType: 'VERIFIED',
				trustScore: -30
			} as any);

			const weight = await getUserVoteWeight('user-789');

			// VERIFIED (2) * 0.25 (trust -26 to -50 modifier) = 0.5
			expect(weight).toBe(0.5);
		});

		it('should return 0 for very low trust users', async () => {
			const { db } = await import('../db');
			const { getUserVoteWeight } = await import('./vote');

			vi.mocked(db.user.findUnique).mockResolvedValue({
				id: 'user-bad',
				userType: 'VERIFIED',
				trustScore: -60
			} as any);

			const weight = await getUserVoteWeight('user-bad');

			// VERIFIED (2) * 0 (trust below -50 modifier) = 0
			expect(weight).toBe(0);
		});

		it('should throw error for non-existent user', async () => {
			const { db } = await import('../db');
			const { getUserVoteWeight } = await import('./vote');

			vi.mocked(db.user.findUnique).mockResolvedValue(null);

			await expect(
				getUserVoteWeight('nonexistent')
			).rejects.toThrow('User not found');
		});
	});

	describe('getVoteWeightForUser', () => {
		it('should calculate weight without database lookup', async () => {
			const { getVoteWeightForUser } = await import('./vote');

			const user = { userType: 'EXPERT' as const, trustScore: 75 };
			const weight = getVoteWeightForUser(user);

			// EXPERT (5) * 1.2 (trust 50-99 modifier) = 6
			expect(weight).toBe(6);
		});

		it('should work with organization type', async () => {
			const { getVoteWeightForUser } = await import('./vote');

			const user = { userType: 'ORGANIZATION' as const, trustScore: 50 };
			const weight = getVoteWeightForUser(user);

			// ORGANIZATION (100) * 1.2 = 120
			expect(weight).toBe(120);
		});

		it('should work with PhD type', async () => {
			const { getVoteWeightForUser } = await import('./vote');

			const user = { userType: 'PHD' as const, trustScore: 100 };
			const weight = getVoteWeightForUser(user);

			// PHD (8) * 1.5 = 12
			expect(weight).toBe(12);
		});
	});

	describe('compareUserVotingPower', () => {
		it('should compare voting power of two users', async () => {
			const { db } = await import('../db');
			const { compareUserVotingPower } = await import('./vote');

			vi.mocked(db.user.findUnique)
				.mockResolvedValueOnce({
					id: 'user-1',
					userType: 'EXPERT',
					trustScore: 100
				} as any)
				.mockResolvedValueOnce({
					id: 'user-2',
					userType: 'VERIFIED',
					trustScore: 50
				} as any);

			const result = await compareUserVotingPower('user-1', 'user-2');

			// EXPERT (5) * 1.5 = 7.5
			// VERIFIED (2) * 1.2 = 2.4
			expect(result.user1Weight).toBe(7.5);
			expect(result.user2Weight).toBe(2.4);
			expect(result.difference).toBe(5.1);
		});

		it('should return negative difference when user2 has more power', async () => {
			const { db } = await import('../db');
			const { compareUserVotingPower } = await import('./vote');

			vi.mocked(db.user.findUnique)
				.mockResolvedValueOnce({
					id: 'user-1',
					userType: 'VERIFIED',
					trustScore: 25
				} as any)
				.mockResolvedValueOnce({
					id: 'user-2',
					userType: 'ORGANIZATION',
					trustScore: 50
				} as any);

			const result = await compareUserVotingPower('user-1', 'user-2');

			// VERIFIED (2) * 1.0 = 2
			// ORGANIZATION (100) * 1.2 = 120
			expect(result.user1Weight).toBe(2);
			expect(result.user2Weight).toBe(120);
			expect(result.difference).toBe(-118);
		});

		it('should throw error if first user not found', async () => {
			const { db } = await import('../db');
			const { compareUserVotingPower } = await import('./vote');

			vi.mocked(db.user.findUnique)
				.mockResolvedValueOnce(null)
				.mockResolvedValueOnce({ id: 'user-2' } as any);

			await expect(
				compareUserVotingPower('user-1', 'user-2')
			).rejects.toThrow('One or both users not found');
		});

		it('should throw error if second user not found', async () => {
			const { db } = await import('../db');
			const { compareUserVotingPower } = await import('./vote');

			vi.mocked(db.user.findUnique)
				.mockResolvedValueOnce({ id: 'user-1' } as any)
				.mockResolvedValueOnce(null);

			await expect(
				compareUserVotingPower('user-1', 'user-2')
			).rejects.toThrow('One or both users not found');
		});
	});

	describe('getUsersByVotingPower', () => {
		it('should return users sorted by voting power', async () => {
			const { db } = await import('../db');
			const { getUsersByVotingPower } = await import('./vote');

			vi.mocked(db.user.findMany).mockResolvedValue([
				{ id: '1', userType: 'VERIFIED', trustScore: 50 },
				{ id: '2', userType: 'EXPERT', trustScore: 100 },
				{ id: '3', userType: 'ORGANIZATION', trustScore: 50 }
			] as any);

			const users = await getUsersByVotingPower(10);

			expect(users[0].id).toBe('3'); // ORGANIZATION * 1.2 = 120
			expect(users[1].id).toBe('2'); // EXPERT * 1.5 = 7.5
			expect(users[2].id).toBe('1'); // VERIFIED * 1.2 = 2.4
		});

		it('should respect limit parameter', async () => {
			const { db } = await import('../db');
			const { getUsersByVotingPower } = await import('./vote');

			vi.mocked(db.user.findMany).mockResolvedValue([
				{ id: '1', userType: 'VERIFIED', trustScore: 50 },
				{ id: '2', userType: 'EXPERT', trustScore: 100 },
				{ id: '3', userType: 'ORGANIZATION', trustScore: 50 }
			] as any);

			const users = await getUsersByVotingPower(2);

			expect(users).toHaveLength(2);
		});

		it('should default to limit of 50', async () => {
			const { db } = await import('../db');
			const { getUsersByVotingPower } = await import('./vote');

			vi.mocked(db.user.findMany).mockResolvedValue([]);

			await getUsersByVotingPower();

			expect(db.user.findMany).toHaveBeenCalledWith({
				where: { deletedAt: null },
				take: 100 // 50 * 2
			});
		});

		it('should include voteWeight property', async () => {
			const { db } = await import('../db');
			const { getUsersByVotingPower } = await import('./vote');

			vi.mocked(db.user.findMany).mockResolvedValue([
				{ id: '1', userType: 'EXPERT', trustScore: 100 }
			] as any);

			const users = await getUsersByVotingPower();

			expect(users[0].voteWeight).toBe(7.5);
		});
	});

	describe('calculateTotalVotingPower', () => {
		it('should sum voting power of all users', async () => {
			const { calculateTotalVotingPower } = await import('./vote');

			const users = [
				{ userType: 'VERIFIED' as const, trustScore: 50 },
				{ userType: 'EXPERT' as const, trustScore: 100 },
				{ userType: 'ORGANIZATION' as const, trustScore: 50 }
			];

			const total = calculateTotalVotingPower(users);

			// 2.4 + 7.5 + 120 = 129.9
			expect(total).toBeCloseTo(129.9);
		});

		it('should return 0 for empty array', async () => {
			const { calculateTotalVotingPower } = await import('./vote');

			const total = calculateTotalVotingPower([]);

			expect(total).toBe(0);
		});

		it('should handle single user', async () => {
			const { calculateTotalVotingPower } = await import('./vote');

			const total = calculateTotalVotingPower([
				{ userType: 'MODERATOR' as const, trustScore: 75 }
			]);

			// MODERATOR (3) * 1.2 = 3.6
			expect(total).toBeCloseTo(3.6);
		});
	});

	describe('getVotingPowerStats', () => {
		it('should return voting power statistics', async () => {
			const { db } = await import('../db');
			const { getVotingPowerStats } = await import('./vote');

			vi.mocked(db.user.findMany).mockResolvedValue([
				{ id: '1', userType: 'VERIFIED', trustScore: 50 },
				{ id: '2', userType: 'VERIFIED', trustScore: 75 },
				{ id: '3', userType: 'EXPERT', trustScore: 100 }
			] as any);

			const stats = await getVotingPowerStats();

			// VERIFIED * 1.2 = 2.4, VERIFIED * 1.2 = 2.4, EXPERT * 1.5 = 7.5
			expect(stats.totalPower).toBeCloseTo(12.3);
			expect(stats.averagePower).toBeCloseTo(4.1);
		});

		it('should calculate median correctly for odd number of users', async () => {
			const { db } = await import('../db');
			const { getVotingPowerStats } = await import('./vote');

			vi.mocked(db.user.findMany).mockResolvedValue([
				{ id: '1', userType: 'ANONYMOUS', trustScore: 0 },
				{ id: '2', userType: 'VERIFIED', trustScore: 50 },
				{ id: '3', userType: 'EXPERT', trustScore: 100 }
			] as any);

			const stats = await getVotingPowerStats();

			// Sorted: 0.1, 2.4, 7.5 - median is 2.4
			expect(stats.medianPower).toBeCloseTo(2.4);
		});

		it('should calculate median correctly for even number of users', async () => {
			const { db } = await import('../db');
			const { getVotingPowerStats } = await import('./vote');

			vi.mocked(db.user.findMany).mockResolvedValue([
				{ id: '1', userType: 'ANONYMOUS', trustScore: 0 },
				{ id: '2', userType: 'VERIFIED', trustScore: 50 },
				{ id: '3', userType: 'VERIFIED', trustScore: 50 },
				{ id: '4', userType: 'EXPERT', trustScore: 100 }
			] as any);

			const stats = await getVotingPowerStats();

			// Sorted: 0.1, 2.4, 2.4, 7.5 - median is (2.4 + 2.4) / 2 = 2.4
			expect(stats.medianPower).toBeCloseTo(2.4);
		});

		it('should breakdown power by user type', async () => {
			const { db } = await import('../db');
			const { getVotingPowerStats } = await import('./vote');

			vi.mocked(db.user.findMany).mockResolvedValue([
				{ id: '1', userType: 'VERIFIED', trustScore: 50 },
				{ id: '2', userType: 'VERIFIED', trustScore: 100 },
				{ id: '3', userType: 'EXPERT', trustScore: 100 }
			] as any);

			const stats = await getVotingPowerStats();

			expect(stats.powerByUserType.VERIFIED.count).toBe(2);
			// VERIFIED at trust 50: 2 * 1.2 = 2.4, trust 100: 2 * 1.5 = 3
			expect(stats.powerByUserType.VERIFIED.totalPower).toBeCloseTo(5.4);
			expect(stats.powerByUserType.VERIFIED.avgPower).toBeCloseTo(2.7);

			expect(stats.powerByUserType.EXPERT.count).toBe(1);
			expect(stats.powerByUserType.EXPERT.totalPower).toBeCloseTo(7.5);
		});

		it('should handle empty database', async () => {
			const { db } = await import('../db');
			const { getVotingPowerStats } = await import('./vote');

			vi.mocked(db.user.findMany).mockResolvedValue([]);

			const stats = await getVotingPowerStats();

			expect(stats.totalPower).toBe(0);
			expect(stats.averagePower).toBe(0);
			expect(stats.medianPower).toBe(0);
			expect(stats.powerByUserType.VERIFIED.count).toBe(0);
		});

		it('should include all user types in breakdown', async () => {
			const { db } = await import('../db');
			const { getVotingPowerStats } = await import('./vote');

			vi.mocked(db.user.findMany).mockResolvedValue([
				{ id: '1', userType: 'VERIFIED', trustScore: 50 }
			] as any);

			const stats = await getVotingPowerStats();

			// Should have entries for all user types even if 0
			expect(stats.powerByUserType).toHaveProperty('ANONYMOUS');
			expect(stats.powerByUserType).toHaveProperty('VERIFIED');
			expect(stats.powerByUserType).toHaveProperty('EXPERT');
			expect(stats.powerByUserType).toHaveProperty('PHD');
			expect(stats.powerByUserType).toHaveProperty('ORGANIZATION');
			expect(stats.powerByUserType).toHaveProperty('MODERATOR');
		});
	});
});
