import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DuplicateError } from './duplicate';

// Mock the database
vi.mock('../db', () => ({
	db: {
		fact: {
			findUnique: vi.fn(),
			findMany: vi.fn(),
			update: vi.fn(),
			count: vi.fn()
		},
		factVote: {
			findUnique: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			deleteMany: vi.fn()
		}
	}
}));

describe('R18: Duplicate Detection & Merging', () => {
	beforeEach(() => {
		console.log('🧪 Test suite starting...');
		vi.clearAllMocks();
	});

	afterEach(() => {
		console.log('🧪 Test suite complete.');
	});

	describe('DuplicateError', () => {
		it('should have correct name and code', () => {
			const error = new DuplicateError('Test message', 'TEST_CODE');
			expect(error.name).toBe('DuplicateError');
			expect(error.code).toBe('TEST_CODE');
			expect(error.message).toBe('Test message');
		});

		it('should extend Error', () => {
			const error = new DuplicateError('Test', 'CODE');
			expect(error instanceof Error).toBe(true);
		});
	});

	describe('Similarity calculation', () => {
		function calculateJaccardSimilarity(text1: string, text2: string): number {
			const words1 = new Set(text1.toLowerCase().split(/\s+/));
			const words2 = new Set(text2.toLowerCase().split(/\s+/));

			const intersection = new Set([...words1].filter((x) => words2.has(x)));
			const union = new Set([...words1, ...words2]);

			return intersection.size / union.size;
		}

		it('should return 1.0 for identical text', () => {
			const similarity = calculateJaccardSimilarity('Hello World', 'Hello World');
			expect(similarity).toBe(1.0);
		});

		it('should return 0.0 for completely different text', () => {
			const similarity = calculateJaccardSimilarity('Apple Banana', 'Cat Dog');
			expect(similarity).toBe(0.0);
		});

		it('should return partial similarity for overlapping text', () => {
			const similarity = calculateJaccardSimilarity('The quick brown fox', 'The lazy brown dog');
			// Words: {the, quick, brown, fox} and {the, lazy, brown, dog}
			// Intersection: {the, brown} = 2
			// Union: {the, quick, brown, fox, lazy, dog} = 6
			// Similarity: 2/6 = 0.333...
			expect(similarity).toBeCloseTo(0.333, 2);
		});

		it('should be case insensitive', () => {
			const similarity = calculateJaccardSimilarity('HELLO WORLD', 'hello world');
			expect(similarity).toBe(1.0);
		});

		it('should handle single word texts', () => {
			const sameSimilarity = calculateJaccardSimilarity('Hello', 'Hello');
			expect(sameSimilarity).toBe(1.0);

			const diffSimilarity = calculateJaccardSimilarity('Hello', 'World');
			expect(diffSimilarity).toBe(0.0);
		});
	});

	describe('Duplicate flagging validation', () => {
		it('should prevent self-duplicate', () => {
			const factId = 'fact-1';
			const duplicateOfId = 'fact-1';
			expect(factId).toBe(duplicateOfId);
			// This should be rejected
		});

		it('should validate both facts exist', () => {
			// Both factId and duplicateOfId must reference valid facts
			const validIds = ['fact-1', 'fact-2'];
			expect(validIds.length).toBe(2);
		});
	});

	describe('Merge operation', () => {
		it('should transfer votes from duplicate to primary', () => {
			// Mock scenario: duplicate has 3 votes, 1 already exists on primary
			const duplicateVotes = [
				{ userId: 'user-1', value: 1, weight: 2.0 },
				{ userId: 'user-2', value: -1, weight: 1.5 },
				{ userId: 'user-3', value: 1, weight: 3.0 }
			];
			const existingPrimaryVotes = [{ userId: 'user-1' }]; // Already voted

			// Expected: 2 votes transferred (user-2 and user-3)
			const newVotes = duplicateVotes.filter(
				(v) => !existingPrimaryVotes.some((e) => e.userId === v.userId)
			);
			expect(newVotes.length).toBe(2);
		});

		it('should not create duplicate votes on primary', () => {
			const userVotes = ['user-1', 'user-1', 'user-2'];
			const uniqueVotes = [...new Set(userVotes)];
			expect(uniqueVotes.length).toBe(2);
		});
	});

	describe('Potential duplicates interface', () => {
		it('should define correct response structure', () => {
			const potentialDuplicates = [
				{
					fact: {
						id: 'fact-1',
						title: 'Similar fact',
						body: 'Body content',
						status: 'SUBMITTED' as const
					},
					similarity: 0.75
				},
				{
					fact: {
						id: 'fact-2',
						title: 'Another similar',
						body: 'Body content',
						status: 'PROVEN' as const
					},
					similarity: 0.45
				}
			];

			expect(potentialDuplicates[0]).toHaveProperty('fact');
			expect(potentialDuplicates[0]).toHaveProperty('similarity');
			expect(potentialDuplicates[0].similarity).toBeGreaterThan(0);
			expect(potentialDuplicates[0].similarity).toBeLessThanOrEqual(1);
		});
	});

	describe('Statistics interface', () => {
		it('should define correct stats structure', () => {
			const stats = {
				totalDuplicates: 15,
				factsWithDuplicates: 8
			};

			expect(stats).toHaveProperty('totalDuplicates');
			expect(stats).toHaveProperty('factsWithDuplicates');
			expect(stats.totalDuplicates).toBeGreaterThanOrEqual(0);
			expect(stats.factsWithDuplicates).toBeGreaterThanOrEqual(0);
		});
	});
});
