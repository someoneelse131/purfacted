import { describe, it, expect, beforeEach } from 'vitest';
import {
	getBaseVoteWeight,
	calculateVoteWeight,
	clearVoteWeightCache,
	getUserTypeDisplayName,
	getUserTypeBadgeColor,
	formatVoteWeight,
	compareVoteWeights
} from './voteWeight';
import { clearTrustScoreCache } from './trustScore';

describe('R9: Vote Weight System', () => {
	beforeEach(() => {
		clearVoteWeightCache();
		clearTrustScoreCache();
	});

	describe('getBaseVoteWeight', () => {
		it('should return correct weight for ANONYMOUS', () => {
			expect(getBaseVoteWeight('ANONYMOUS')).toBe(0.1);
		});

		it('should return correct weight for VERIFIED', () => {
			expect(getBaseVoteWeight('VERIFIED')).toBe(2);
		});

		it('should return correct weight for EXPERT', () => {
			expect(getBaseVoteWeight('EXPERT')).toBe(5);
		});

		it('should return correct weight for PHD', () => {
			expect(getBaseVoteWeight('PHD')).toBe(8);
		});

		it('should return correct weight for ORGANIZATION', () => {
			expect(getBaseVoteWeight('ORGANIZATION')).toBe(100);
		});

		it('should return correct weight for MODERATOR', () => {
			expect(getBaseVoteWeight('MODERATOR')).toBe(3);
		});

		it('should use database config when provided', () => {
			const dbConfig = {
				ANONYMOUS: 0.2,
				VERIFIED: 3,
				EXPERT: 6,
				PHD: 10,
				ORGANIZATION: 150,
				MODERATOR: 4
			};

			expect(getBaseVoteWeight('VERIFIED', dbConfig as any)).toBe(3);
		});
	});

	describe('calculateVoteWeight', () => {
		it('should calculate weight with standard trust modifier (1.0x)', () => {
			// Trust score 25 gives 1.0x modifier
			const weight = calculateVoteWeight('VERIFIED', 25);
			expect(weight).toBe(2 * 1.0); // 2
		});

		it('should calculate weight with high trust modifier (1.5x)', () => {
			// Trust score 100 gives 1.5x modifier
			const weight = calculateVoteWeight('VERIFIED', 100);
			expect(weight).toBe(2 * 1.5); // 3
		});

		it('should calculate weight with trusted modifier (1.2x)', () => {
			// Trust score 75 gives 1.2x modifier
			const weight = calculateVoteWeight('VERIFIED', 75);
			expect(weight).toBe(2 * 1.2); // 2.4
		});

		it('should calculate weight with low trust modifier (0.5x)', () => {
			// Trust score -10 gives 0.5x modifier
			const weight = calculateVoteWeight('VERIFIED', -10);
			expect(weight).toBe(2 * 0.5); // 1
		});

		it('should calculate weight with very low trust modifier (0.25x)', () => {
			// Trust score -40 gives 0.25x modifier
			const weight = calculateVoteWeight('VERIFIED', -40);
			expect(weight).toBe(2 * 0.25); // 0.5
		});

		it('should calculate zero weight for extremely low trust', () => {
			// Trust score -60 gives 0x modifier
			const weight = calculateVoteWeight('VERIFIED', -60);
			expect(weight).toBe(0);
		});

		it('should calculate organization weight correctly', () => {
			// Organization with high trust
			const weight = calculateVoteWeight('ORGANIZATION', 100);
			expect(weight).toBe(100 * 1.5); // 150
		});

		it('should calculate anonymous weight correctly', () => {
			// Anonymous with standard trust
			const weight = calculateVoteWeight('ANONYMOUS', 25);
			expect(weight).toBe(0.1 * 1.0); // 0.1
		});
	});

	describe('getUserTypeDisplayName', () => {
		it('should return correct display names', () => {
			expect(getUserTypeDisplayName('ANONYMOUS')).toBe('Anonymous');
			expect(getUserTypeDisplayName('VERIFIED')).toBe('Verified User');
			expect(getUserTypeDisplayName('EXPERT')).toBe('Expert');
			expect(getUserTypeDisplayName('PHD')).toBe('PhD');
			expect(getUserTypeDisplayName('ORGANIZATION')).toBe('Organization');
			expect(getUserTypeDisplayName('MODERATOR')).toBe('Moderator');
		});
	});

	describe('getUserTypeBadgeColor', () => {
		it('should return correct badge colors', () => {
			expect(getUserTypeBadgeColor('ANONYMOUS')).toBe('gray');
			expect(getUserTypeBadgeColor('VERIFIED')).toBe('green');
			expect(getUserTypeBadgeColor('EXPERT')).toBe('yellow');
			expect(getUserTypeBadgeColor('PHD')).toBe('purple');
			expect(getUserTypeBadgeColor('ORGANIZATION')).toBe('blue');
			expect(getUserTypeBadgeColor('MODERATOR')).toBe('orange');
		});
	});

	describe('formatVoteWeight', () => {
		it('should format large weights without decimals', () => {
			expect(formatVoteWeight(150)).toBe('150');
			expect(formatVoteWeight(10)).toBe('10');
		});

		it('should format medium weights with one decimal', () => {
			expect(formatVoteWeight(2.4)).toBe('2.4');
			expect(formatVoteWeight(5.0)).toBe('5.0');
		});

		it('should format small weights with two decimals', () => {
			expect(formatVoteWeight(0.1)).toBe('0.10');
			expect(formatVoteWeight(0.25)).toBe('0.25');
		});
	});

	describe('compareVoteWeights', () => {
		it('should return positive when user1 has more weight', () => {
			const result = compareVoteWeights(
				{ userType: 'ORGANIZATION', trustScore: 50 },
				{ userType: 'VERIFIED', trustScore: 50 }
			);
			expect(result).toBeGreaterThan(0);
		});

		it('should return negative when user1 has less weight', () => {
			const result = compareVoteWeights(
				{ userType: 'ANONYMOUS', trustScore: 10 },
				{ userType: 'VERIFIED', trustScore: 10 }
			);
			expect(result).toBeLessThan(0);
		});

		it('should consider trust score in comparison', () => {
			// Same user type, different trust
			const result = compareVoteWeights(
				{ userType: 'VERIFIED', trustScore: 100 }, // 2 * 1.5 = 3
				{ userType: 'VERIFIED', trustScore: 25 } // 2 * 1.0 = 2
			);
			expect(result).toBeGreaterThan(0);
		});
	});
});
