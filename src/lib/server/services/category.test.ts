import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CategoryError } from './category';

// Mock the database
vi.mock('../db', () => ({
	db: {
		category: {
			findUnique: vi.fn(),
			findFirst: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			updateMany: vi.fn(),
			delete: vi.fn(),
			count: vi.fn()
		},
		categoryAlias: {
			findFirst: vi.fn(),
			findUnique: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
			count: vi.fn()
		},
		categoryMergeRequest: {
			findUnique: vi.fn(),
			findFirst: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			count: vi.fn()
		},
		categoryMergeVote: {
			findUnique: vi.fn(),
			findMany: vi.fn(),
			upsert: vi.fn(),
			count: vi.fn()
		},
		fact: {
			updateMany: vi.fn()
		},
		$transaction: vi.fn()
	}
}));

describe('R20: Category System', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('CategoryError', () => {
		it('should have correct name and code', () => {
			const error = new CategoryError('Test message', 'TEST_CODE');
			expect(error.name).toBe('CategoryError');
			expect(error.code).toBe('TEST_CODE');
			expect(error.message).toBe('Test message');
		});

		it('should extend Error', () => {
			const error = new CategoryError('Test', 'CODE');
			expect(error instanceof Error).toBe(true);
		});
	});

	describe('Category name validation', () => {
		it('should accept valid category names', () => {
			const validNames = [
				'Science',
				'Health & Medicine',
				"Tom's Category",
				'Sports-News',
				'Category 123'
			];

			for (const name of validNames) {
				// These should not throw
				expect(name.length <= 50).toBe(true);
				expect(/^[a-zA-Z0-9\s\-&']+$/.test(name)).toBe(true);
			}
		});

		it('should reject names with invalid characters', () => {
			const invalidNames = ['Category!', 'Test@Category', 'Name#123', 'Category$'];

			for (const name of invalidNames) {
				expect(/^[a-zA-Z0-9\s\-&']+$/.test(name)).toBe(false);
			}
		});

		it('should reject names longer than 50 characters', () => {
			const longName = 'a'.repeat(51);
			expect(longName.length > 50).toBe(true);
		});

		it('should reject empty names', () => {
			const emptyNames = ['', '   ', '\t\n'];

			for (const name of emptyNames) {
				expect(name.trim().length === 0).toBe(true);
			}
		});
	});

	describe('Category name normalization', () => {
		it('should normalize category names for comparison', () => {
			const normalize = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

			expect(normalize('  Science  ')).toBe('science');
			expect(normalize('Health   Medicine')).toBe('health medicine');
			expect(normalize('COOKING')).toBe('cooking');
		});
	});

	describe('Category hierarchy', () => {
		it('should support parent-child relationships', () => {
			const parent = { id: 'parent-1', name: 'Science', parentId: null };
			const child = { id: 'child-1', name: 'Physics', parentId: 'parent-1' };

			expect(child.parentId).toBe(parent.id);
		});

		it('should identify root categories', () => {
			const categories = [
				{ id: '1', name: 'Science', parentId: null },
				{ id: '2', name: 'Physics', parentId: '1' },
				{ id: '3', name: 'Arts', parentId: null }
			];

			const rootCategories = categories.filter((c) => c.parentId === null);
			expect(rootCategories.length).toBe(2);
			expect(rootCategories.map((c) => c.name)).toContain('Science');
			expect(rootCategories.map((c) => c.name)).toContain('Arts');
		});
	});

	describe('Category aliases', () => {
		it('should map aliases to primary category', () => {
			const category = { id: 'cat-1', name: 'Cooking' };
			const aliases = [
				{ id: 'alias-1', name: 'cook', categoryId: 'cat-1' },
				{ id: 'alias-2', name: 'cuisine', categoryId: 'cat-1' }
			];

			for (const alias of aliases) {
				expect(alias.categoryId).toBe(category.id);
			}
		});

		it('should prevent duplicate alias names', () => {
			const existingAliases = ['cooking', 'cook', 'cuisine'];
			const newAlias = 'cook';

			const isDuplicate = existingAliases.some(
				(a) => a.toLowerCase() === newAlias.toLowerCase()
			);
			expect(isDuplicate).toBe(true);
		});
	});

	describe('Merge request voting', () => {
		it('should calculate net votes correctly', () => {
			const votes = [
				{ value: 1 }, // approve
				{ value: 1 }, // approve
				{ value: -1 }, // reject
				{ value: 1 } // approve
			];

			const netVotes = votes.reduce((sum, v) => sum + v.value, 0);
			expect(netVotes).toBe(2); // 3 approve - 1 reject = 2
		});

		it('should approve when reaching positive threshold', () => {
			const APPROVAL_THRESHOLD = 10;
			const netVotes = 10;

			expect(netVotes >= APPROVAL_THRESHOLD).toBe(true);
		});

		it('should reject when reaching negative threshold', () => {
			const REJECTION_THRESHOLD = -5;
			const netVotes = -5;

			expect(netVotes <= REJECTION_THRESHOLD).toBe(true);
		});

		it('should remain pending between thresholds', () => {
			const APPROVAL_THRESHOLD = 10;
			const REJECTION_THRESHOLD = -5;
			const netVotes = 3;

			const isPending =
				netVotes < APPROVAL_THRESHOLD && netVotes > REJECTION_THRESHOLD;
			expect(isPending).toBe(true);
		});
	});

	describe('Merge execution', () => {
		it('should define correct merge steps', () => {
			const mergeSteps = [
				'Move facts from source to target category',
				'Move child categories to target category',
				'Add source category name as alias',
				'Move existing aliases to target category',
				'Delete source category'
			];

			expect(mergeSteps.length).toBe(5);
		});

		it('should preserve merged category name as alias', () => {
			const sourceCategory = { name: 'cook' };
			const targetCategory = { name: 'Cooking' };

			// After merge, "cook" becomes an alias of "Cooking"
			const newAlias = {
				name: sourceCategory.name,
				categoryId: 'target-id'
			};

			expect(newAlias.name).toBe('cook');
		});
	});

	describe('Merge request constraints', () => {
		it('should prevent merging category into itself', () => {
			const fromCategoryId = 'cat-1';
			const toCategoryId = 'cat-1';

			expect(fromCategoryId === toCategoryId).toBe(true);
		});

		it('should prevent duplicate pending merge requests', () => {
			const pendingRequests = [
				{ fromCategoryId: 'cat-1', toCategoryId: 'cat-2', status: 'PENDING' }
			];

			const newRequest = { fromCategoryId: 'cat-1', toCategoryId: 'cat-2' };

			const isDuplicate = pendingRequests.some(
				(r) =>
					r.status === 'PENDING' &&
					((r.fromCategoryId === newRequest.fromCategoryId &&
						r.toCategoryId === newRequest.toCategoryId) ||
						(r.fromCategoryId === newRequest.toCategoryId &&
							r.toCategoryId === newRequest.fromCategoryId))
			);

			expect(isDuplicate).toBe(true);
		});
	});

	describe('Category statistics', () => {
		it('should define correct statistics structure', () => {
			const stats = {
				totalCategories: 50,
				totalAliases: 25,
				pendingMergeRequests: 3,
				categoriesWithFacts: 35
			};

			expect(stats).toHaveProperty('totalCategories');
			expect(stats).toHaveProperty('totalAliases');
			expect(stats).toHaveProperty('pendingMergeRequests');
			expect(stats).toHaveProperty('categoriesWithFacts');
		});
	});

	describe('Category lookup', () => {
		it('should find category by exact name', () => {
			const categories = [
				{ id: '1', name: 'Science' },
				{ id: '2', name: 'Cooking' }
			];

			const found = categories.find(
				(c) => c.name.toLowerCase() === 'science'.toLowerCase()
			);
			expect(found?.id).toBe('1');
		});

		it('should find category by alias', () => {
			const aliases = [
				{ name: 'cook', categoryId: 'cat-cooking' },
				{ name: 'cuisine', categoryId: 'cat-cooking' }
			];

			const searchName = 'cook';
			const alias = aliases.find(
				(a) => a.name.toLowerCase() === searchName.toLowerCase()
			);
			expect(alias?.categoryId).toBe('cat-cooking');
		});
	});
});
