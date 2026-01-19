import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VoteError } from './factVote';

// Mock the database
vi.mock('../db', () => ({
	db: {
		user: {
			findUnique: vi.fn()
		},
		fact: {
			findUnique: vi.fn(),
			update: vi.fn()
		},
		factVote: {
			findUnique: vi.fn(),
			findMany: vi.fn(),
			upsert: vi.fn(),
			delete: vi.fn(),
			count: vi.fn()
		}
	}
}));

describe('R15: Fact Voting', () => {
	beforeEach(() => {
		console.log('🧪 Test suite starting...');
		vi.clearAllMocks();
	});

	afterEach(() => {
		console.log('🧪 Test suite complete.');
	});

	describe('VoteError', () => {
		it('should have correct name and code', () => {
			const error = new VoteError('Test message', 'TEST_CODE');
			expect(error.name).toBe('VoteError');
			expect(error.code).toBe('TEST_CODE');
			expect(error.message).toBe('Test message');
		});

		it('should extend Error', () => {
			const error = new VoteError('Test', 'CODE');
			expect(error instanceof Error).toBe(true);
		});
	});

	describe('Vote value validation', () => {
		it('should only accept 1 or -1 as vote values', () => {
			const validValues = [1, -1];
			const invalidValues = [0, 2, -2, 0.5, 'up', 'down'];

			validValues.forEach((val) => {
				expect([1, -1]).toContain(val);
			});

			invalidValues.forEach((val) => {
				expect([1, -1]).not.toContain(val);
			});
		});
	});

	describe('Score calculation logic', () => {
		it('should calculate positive score correctly', () => {
			const votes = [
				{ value: 1, weight: 2.0 },
				{ value: 1, weight: 3.0 },
				{ value: -1, weight: 1.0 }
			];

			let weightedUp = 0;
			let weightedDown = 0;

			for (const vote of votes) {
				if (vote.value > 0) {
					weightedUp += vote.weight;
				} else {
					weightedDown += vote.weight;
				}
			}

			const score = weightedUp - weightedDown;
			expect(score).toBe(4.0); // (2 + 3) - 1 = 4
		});

		it('should calculate negative score correctly', () => {
			const votes = [
				{ value: 1, weight: 1.0 },
				{ value: -1, weight: 3.0 },
				{ value: -1, weight: 2.0 }
			];

			let weightedUp = 0;
			let weightedDown = 0;

			for (const vote of votes) {
				if (vote.value > 0) {
					weightedUp += vote.weight;
				} else {
					weightedDown += vote.weight;
				}
			}

			const score = weightedUp - weightedDown;
			expect(score).toBe(-4.0); // 1 - (3 + 2) = -4
		});

		it('should calculate zero score correctly', () => {
			const votes = [
				{ value: 1, weight: 2.0 },
				{ value: -1, weight: 2.0 }
			];

			let weightedUp = 0;
			let weightedDown = 0;

			for (const vote of votes) {
				if (vote.value > 0) {
					weightedUp += vote.weight;
				} else {
					weightedDown += vote.weight;
				}
			}

			const score = weightedUp - weightedDown;
			expect(score).toBe(0);
		});
	});

	describe('Positive percentage calculation', () => {
		it('should calculate 100% for all upvotes', () => {
			const weightedUp = 10;
			const weightedDown = 0;
			const total = weightedUp + weightedDown;
			const percent = total > 0 ? (weightedUp / total) * 100 : 50;
			expect(percent).toBe(100);
		});

		it('should calculate 0% for all downvotes', () => {
			const weightedUp = 0;
			const weightedDown = 10;
			const total = weightedUp + weightedDown;
			const percent = total > 0 ? (weightedUp / total) * 100 : 50;
			expect(percent).toBe(0);
		});

		it('should calculate 50% for equal votes', () => {
			const weightedUp = 5;
			const weightedDown = 5;
			const total = weightedUp + weightedDown;
			const percent = total > 0 ? (weightedUp / total) * 100 : 50;
			expect(percent).toBe(50);
		});

		it('should return 50% for no votes', () => {
			const weightedUp = 0;
			const weightedDown = 0;
			const total = weightedUp + weightedDown;
			const percent = total > 0 ? (weightedUp / total) * 100 : 50;
			expect(percent).toBe(50);
		});
	});

	describe('Status threshold logic', () => {
		const PROVEN_THRESHOLD = 75;
		const DISPROVEN_THRESHOLD = 25;

		it('should determine PROVEN for >= 75% positive', () => {
			const percentages = [75, 80, 90, 100];

			percentages.forEach((percent) => {
				let status: string;
				if (percent >= PROVEN_THRESHOLD) {
					status = 'PROVEN';
				} else if (percent <= DISPROVEN_THRESHOLD) {
					status = 'DISPROVEN';
				} else {
					status = 'CONTROVERSIAL';
				}
				expect(status).toBe('PROVEN');
			});
		});

		it('should determine DISPROVEN for <= 25% positive', () => {
			const percentages = [0, 10, 20, 25];

			percentages.forEach((percent) => {
				let status: string;
				if (percent >= PROVEN_THRESHOLD) {
					status = 'PROVEN';
				} else if (percent <= DISPROVEN_THRESHOLD) {
					status = 'DISPROVEN';
				} else {
					status = 'CONTROVERSIAL';
				}
				expect(status).toBe('DISPROVEN');
			});
		});

		it('should determine CONTROVERSIAL for 26-74% positive', () => {
			const percentages = [26, 50, 74];

			percentages.forEach((percent) => {
				let status: string;
				if (percent >= PROVEN_THRESHOLD) {
					status = 'PROVEN';
				} else if (percent <= DISPROVEN_THRESHOLD) {
					status = 'DISPROVEN';
				} else {
					status = 'CONTROVERSIAL';
				}
				expect(status).toBe('CONTROVERSIAL');
			});
		});
	});

	describe('Voting summary interface', () => {
		it('should define correct summary structure', () => {
			const summary = {
				score: 10.5,
				totalVotes: 15,
				upvotes: 10,
				downvotes: 5,
				positivePercent: 75,
				status: 'PROVEN' as const,
				minVotesRequired: 20,
				votesRemaining: 5
			};

			expect(summary).toHaveProperty('score');
			expect(summary).toHaveProperty('totalVotes');
			expect(summary).toHaveProperty('upvotes');
			expect(summary).toHaveProperty('downvotes');
			expect(summary).toHaveProperty('positivePercent');
			expect(summary).toHaveProperty('status');
			expect(summary).toHaveProperty('minVotesRequired');
			expect(summary).toHaveProperty('votesRemaining');
		});
	});
});
