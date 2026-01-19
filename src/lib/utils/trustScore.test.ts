import { describe, it, expect, beforeEach } from 'vitest';
import {
	getTrustPoints,
	calculateTrustChange,
	getVoteModifier,
	calculateNewTrustScore,
	getTrustLevel,
	clearTrustScoreCache
} from './trustScore';

describe('R8: Trust Score System', () => {
	beforeEach(() => {
		clearTrustScoreCache();
	});

	describe('getTrustPoints', () => {
		it('should return correct points for FACT_APPROVED', () => {
			const points = getTrustPoints('FACT_APPROVED');
			expect(points).toBe(10);
		});

		it('should return correct points for FACT_WRONG', () => {
			const points = getTrustPoints('FACT_WRONG');
			expect(points).toBe(-20);
		});

		it('should return correct points for FACT_OUTDATED', () => {
			const points = getTrustPoints('FACT_OUTDATED');
			expect(points).toBe(0);
		});

		it('should return correct points for VETO_SUCCESS', () => {
			const points = getTrustPoints('VETO_SUCCESS');
			expect(points).toBe(5);
		});

		it('should return correct points for VETO_FAIL', () => {
			const points = getTrustPoints('VETO_FAIL');
			expect(points).toBe(-5);
		});

		it('should return correct points for VERIFICATION_CORRECT', () => {
			const points = getTrustPoints('VERIFICATION_CORRECT');
			expect(points).toBe(3);
		});

		it('should return correct points for VERIFICATION_WRONG', () => {
			const points = getTrustPoints('VERIFICATION_WRONG');
			expect(points).toBe(-10);
		});

		it('should return correct points for UPVOTED', () => {
			const points = getTrustPoints('UPVOTED');
			expect(points).toBe(1);
		});

		it('should return correct points for DOWNVOTED', () => {
			const points = getTrustPoints('DOWNVOTED');
			expect(points).toBe(-1);
		});

		it('should use database config when provided', () => {
			const dbConfig = {
				FACT_APPROVED: 15,
				FACT_WRONG: -25,
				FACT_OUTDATED: 0,
				VETO_SUCCESS: 5,
				VETO_FAIL: -5,
				VERIFICATION_CORRECT: 3,
				VERIFICATION_WRONG: -10,
				UPVOTED: 1,
				DOWNVOTED: -1
			};

			const points = getTrustPoints('FACT_APPROVED', dbConfig as any);
			expect(points).toBe(15);
		});
	});

	describe('calculateTrustChange', () => {
		it('should calculate positive trust change', () => {
			const change = calculateTrustChange('FACT_APPROVED');
			expect(change).toBe(10);
		});

		it('should calculate negative trust change', () => {
			const change = calculateTrustChange('FACT_WRONG');
			expect(change).toBe(-20);
		});

		it('should calculate zero trust change', () => {
			const change = calculateTrustChange('FACT_OUTDATED');
			expect(change).toBe(0);
		});
	});

	describe('getVoteModifier', () => {
		it('should return 1.5x modifier for trust >= 100', () => {
			expect(getVoteModifier(100)).toBe(1.5);
			expect(getVoteModifier(150)).toBe(1.5);
		});

		it('should return 1.2x modifier for trust 50-99', () => {
			expect(getVoteModifier(50)).toBe(1.2);
			expect(getVoteModifier(75)).toBe(1.2);
			expect(getVoteModifier(99)).toBe(1.2);
		});

		it('should return 1.0x modifier for trust 0-49', () => {
			expect(getVoteModifier(0)).toBe(1.0);
			expect(getVoteModifier(25)).toBe(1.0);
			expect(getVoteModifier(49)).toBe(1.0);
		});

		it('should return 0.5x modifier for trust -25 to -1', () => {
			expect(getVoteModifier(-1)).toBe(0.5);
			expect(getVoteModifier(-15)).toBe(0.5);
			expect(getVoteModifier(-25)).toBe(0.5);
		});

		it('should return 0.25x modifier for trust -50 to -26', () => {
			expect(getVoteModifier(-26)).toBe(0.25);
			expect(getVoteModifier(-40)).toBe(0.25);
			expect(getVoteModifier(-50)).toBe(0.25);
		});

		it('should return 0x modifier for trust below -50', () => {
			expect(getVoteModifier(-51)).toBe(0);
			expect(getVoteModifier(-100)).toBe(0);
		});
	});

	describe('calculateNewTrustScore', () => {
		it('should add positive points correctly', () => {
			const newScore = calculateNewTrustScore(50, 'FACT_APPROVED');
			expect(newScore).toBe(60);
		});

		it('should subtract negative points correctly', () => {
			const newScore = calculateNewTrustScore(50, 'FACT_WRONG');
			expect(newScore).toBe(30);
		});

		it('should handle zero point changes', () => {
			const newScore = calculateNewTrustScore(50, 'FACT_OUTDATED');
			expect(newScore).toBe(50);
		});

		it('should allow negative total trust scores', () => {
			const newScore = calculateNewTrustScore(5, 'FACT_WRONG');
			expect(newScore).toBe(-15);
		});
	});

	describe('getTrustLevel', () => {
		it('should return "Highly Trusted" for score >= 100', () => {
			expect(getTrustLevel(100)).toBe('Highly Trusted');
			expect(getTrustLevel(200)).toBe('Highly Trusted');
		});

		it('should return "Trusted" for score 50-99', () => {
			expect(getTrustLevel(50)).toBe('Trusted');
			expect(getTrustLevel(99)).toBe('Trusted');
		});

		it('should return "Standard" for score 0-49', () => {
			expect(getTrustLevel(0)).toBe('Standard');
			expect(getTrustLevel(49)).toBe('Standard');
		});

		it('should return "Low Trust" for score -25 to -1', () => {
			expect(getTrustLevel(-1)).toBe('Low Trust');
			expect(getTrustLevel(-25)).toBe('Low Trust');
		});

		it('should return "Very Low Trust" for score -50 to -26', () => {
			expect(getTrustLevel(-26)).toBe('Very Low Trust');
			expect(getTrustLevel(-50)).toBe('Very Low Trust');
		});

		it('should return "No Voting Power" for score below -50', () => {
			expect(getTrustLevel(-51)).toBe('No Voting Power');
		});
	});
});
