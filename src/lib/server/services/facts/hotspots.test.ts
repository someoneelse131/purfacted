import { describe, expect, it } from 'vitest';
import { computeQuorumProgress, deadlineProximity, hotspotUrgency } from './hotspots';

const START = new Date('2026-06-01T00:00:00Z');
const DEADLINE = new Date('2026-06-15T00:00:00Z'); // 14-day window

describe('deadlineProximity', () => {
	it('is 0 at the start, ~0.5 at the midpoint and 1 at/after the deadline', () => {
		expect(deadlineProximity(START, DEADLINE, START)).toBe(0);
		expect(deadlineProximity(START, DEADLINE, new Date('2026-06-08T00:00:00Z'))).toBeCloseTo(
			0.5,
			5
		);
		expect(deadlineProximity(START, DEADLINE, DEADLINE)).toBe(1);
		expect(deadlineProximity(START, DEADLINE, new Date('2026-06-20T00:00:00Z'))).toBe(1);
	});

	it('treats a degenerate (non-positive) window as fully elapsed', () => {
		expect(deadlineProximity(DEADLINE, START, new Date('2026-06-10T00:00:00Z'))).toBe(1);
	});
});

describe('computeQuorumProgress', () => {
	const config = { minTotalWeight: 15, minReviewers: 5, minReviewHours: 48 };

	it('averages weight/reviewer/age progress, each capped at 1', () => {
		// half on every axis -> 0.5
		expect(
			computeQuorumProgress(
				{ totalVoteWeight: 7.5, distinctReviewers: 2.5, reviewAgeHours: 24 },
				config
			)
		).toBeCloseTo(0.5, 5);
		// fully met (and beyond) on every axis -> 1
		expect(
			computeQuorumProgress(
				{ totalVoteWeight: 99, distinctReviewers: 99, reviewAgeHours: 999 },
				config
			)
		).toBe(1);
		// nothing yet -> 0
		expect(
			computeQuorumProgress({ totalVoteWeight: 0, distinctReviewers: 0, reviewAgeHours: 0 }, config)
		).toBe(0);
	});
});

describe('hotspotUrgency', () => {
	it('is deadline proximity times missing quorum', () => {
		// midpoint deadline (0.5) x missing quorum (1 - 0.4 = 0.6) = 0.3
		const u = hotspotUrgency({
			reviewStartedAt: START,
			reviewDeadline: DEADLINE,
			quorumProgress: 0.4,
			now: new Date('2026-06-08T00:00:00Z')
		});
		expect(u).toBeCloseTo(0.3, 5);
	});

	it('ranks a near-deadline, low-quorum fact above a fresh, high-quorum one', () => {
		const atRisk = hotspotUrgency({
			reviewStartedAt: START,
			reviewDeadline: DEADLINE,
			quorumProgress: 0.2,
			now: new Date('2026-06-14T00:00:00Z') // almost expired
		});
		const fresh = hotspotUrgency({
			reviewStartedAt: START,
			reviewDeadline: DEADLINE,
			quorumProgress: 0.8,
			now: new Date('2026-06-02T00:00:00Z') // just started
		});
		expect(atRisk).toBeGreaterThan(fresh);
	});

	it('is 0 once quorum progress is complete, regardless of the deadline', () => {
		expect(
			hotspotUrgency({
				reviewStartedAt: START,
				reviewDeadline: DEADLINE,
				quorumProgress: 1,
				now: DEADLINE
			})
		).toBe(0);
	});
});
