import { describe, expect, it } from 'vitest';
import {
	checkQuorum,
	effectiveBalance,
	evidenceScores,
	sourceScore,
	statusForBalance,
	type ScorableSource
} from './scoring';

function src(
	side: 'PRO' | 'CONTRA',
	credibility: number,
	votes: [number, number][]
): ScorableSource {
	return { side, credibility, votes: votes.map(([value, weight]) => ({ value, weight })) };
}

describe('sourceScore', () => {
	it('multiplies the positive weighted vote sum with credibility', () => {
		expect(
			sourceScore(
				src('PRO', 5, [
					[1, 1],
					[1, 3]
				])
			)
		).toBe(20); // (1+3)*5
		expect(
			sourceScore(
				src('PRO', 3, [
					[1, 2],
					[-1, 1]
				])
			)
		).toBe(3); // (2-1)*3
	});

	it('never goes negative (junk scores 0 for its side)', () => {
		expect(sourceScore(src('PRO', 5, [[-1, 4]]))).toBe(0);
		expect(sourceScore(src('CONTRA', 1, []))).toBe(0);
	});
});

describe('evidenceScores / balance', () => {
	it('computes pro, contra and balance', () => {
		const { proScore, contraScore, balance } = evidenceScores([
			src('PRO', 5, [[1, 3]]), // 15
			src('PRO', 1, [[1, 1]]), // 1
			src('CONTRA', 4, [[1, 1]]) // 4
		]);
		expect(proScore).toBe(16);
		expect(contraScore).toBe(4);
		expect(balance).toBeCloseTo((16 - 4) / 20);
	});

	it('is null when no source scored', () => {
		expect(evidenceScores([]).balance).toBeNull();
		expect(evidenceScores([src('PRO', 5, [[-1, 2]])]).balance).toBeNull();
	});

	it('hits the extremes', () => {
		expect(evidenceScores([src('PRO', 3, [[1, 1]])]).balance).toBe(1);
		expect(evidenceScores([src('CONTRA', 3, [[1, 1]])]).balance).toBe(-1);
	});
});

describe('effectiveBalance / confidence damping', () => {
	const k = 10;

	it('is null when there is nothing to weigh', () => {
		expect(effectiveBalance(evidenceScores([]), k)).toBeNull();
	});

	it('damps thin one-sided evidence below the verify threshold', () => {
		// one PRO source, weight 1, credibility 5 -> proScore 5, raw balance 1.0
		const scores = evidenceScores([src('PRO', 5, [[1, 1]])]);
		expect(scores.balance).toBe(1);
		// effective = 1 * 5/(5+10) = 0.333... -> would NOT verify at 0.5
		expect(effectiveBalance(scores, k)).toBeCloseTo(5 / 15);
		expect(effectiveBalance(scores, k)!).toBeLessThan(0.5);
	});

	it('vanishes as evidence mass grows (S >> K)', () => {
		// proScore 100 vs 0 -> S = 100, effective = 1 * 100/110
		const scores = evidenceScores([src('PRO', 5, [[1, 20]])]);
		expect(effectiveBalance(scores, k)).toBeCloseTo(100 / 110);
	});

	it('k = 0 leaves the balance untouched', () => {
		const scores = evidenceScores([src('PRO', 5, [[1, 1]])]);
		expect(effectiveBalance(scores, 0)).toBe(1);
	});

	it('preserves sign for contra-heavy evidence', () => {
		const scores = evidenceScores([src('CONTRA', 5, [[1, 1]])]);
		expect(effectiveBalance(scores, k)).toBeCloseTo(-5 / 15);
	});
});

describe('statusForBalance', () => {
	it('maps thresholds per concept table', () => {
		expect(statusForBalance(0.5, 0.5, -0.5)).toBe('VERIFIED');
		expect(statusForBalance(0.49, 0.5, -0.5)).toBe('DISPUTED');
		expect(statusForBalance(-0.5, 0.5, -0.5)).toBe('REFUTED');
		expect(statusForBalance(-0.49, 0.5, -0.5)).toBe('DISPUTED');
		expect(statusForBalance(0, 0.5, -0.5)).toBe('DISPUTED');
		expect(statusForBalance(null, 0.5, -0.5)).toBe('DISPUTED');
	});
});

describe('checkQuorum', () => {
	const config = { minTotalWeight: 15, minReviewers: 5, minReviewHours: 48 };

	it('reports reached when all conditions hold', () => {
		const result = checkQuorum(
			{ totalVoteWeight: 15, distinctReviewers: 5, reviewAgeHours: 48 },
			config
		);
		expect(result.reached).toBe(true);
	});

	it('reports what is missing', () => {
		const result = checkQuorum(
			{ totalVoteWeight: 12, distinctReviewers: 3, reviewAgeHours: 10 },
			config
		);
		expect(result.reached).toBe(false);
		expect(result.missingWeight).toBe(3);
		expect(result.missingReviewers).toBe(2);
		expect(result.missingHours).toBe(38);
	});

	it('each condition alone blocks the quorum', () => {
		expect(
			checkQuorum({ totalVoteWeight: 14.9, distinctReviewers: 9, reviewAgeHours: 100 }, config)
				.reached
		).toBe(false);
		expect(
			checkQuorum({ totalVoteWeight: 99, distinctReviewers: 4, reviewAgeHours: 100 }, config)
				.reached
		).toBe(false);
		expect(
			checkQuorum({ totalVoteWeight: 99, distinctReviewers: 9, reviewAgeHours: 47.9 }, config)
				.reached
		).toBe(false);
	});
});
