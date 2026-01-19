import { db } from '../db';
import type { Category, CategoryAlias, CategoryMergeRequest, MergeRequestStatus } from '@prisma/client';

// ============================================
// Types
// ============================================

export interface CreateCategoryInput {
	name: string;
	parentId?: string | null;
}

export interface CategoryWithDetails extends Category {
	_count: {
		facts: number;
		children: number;
	};
	aliases: CategoryAlias[];
	parent: Category | null;
	children: Category[];
}

export interface CreateMergeRequestInput {
	fromCategoryId: string;
	toCategoryId: string;
}

export interface MergeRequestWithDetails extends CategoryMergeRequest {
	fromCategory: Category;
	toCategory: Category;
	requestedBy: {
		id: string;
		firstName: string;
		lastName: string;
	};
	_count: {
		votes: number;
	};
	voteSummary?: {
		approveCount: number;
		rejectCount: number;
		totalVotes: number;
	};
}

// ============================================
// Error Handling
// ============================================

export class CategoryError extends Error {
	code: string;

	constructor(message: string, code: string) {
		super(message);
		this.name = 'CategoryError';
		this.code = code;
	}
}

// ============================================
// Category Configuration
// ============================================

const MERGE_APPROVAL_THRESHOLD = 10; // Minimum net votes to approve
const MERGE_REJECTION_THRESHOLD = -5; // Net votes to reject

// ============================================
// Validation
// ============================================

function validateCategoryName(name: string): void {
	if (!name || name.trim().length === 0) {
		throw new CategoryError('Category name is required', 'NAME_REQUIRED');
	}

	if (name.length > 50) {
		throw new CategoryError('Category name must be 50 characters or less', 'NAME_TOO_LONG');
	}

	// Only allow alphanumeric, spaces, hyphens, and common characters
	const validPattern = /^[a-zA-Z0-9\s\-&']+$/;
	if (!validPattern.test(name)) {
		throw new CategoryError(
			'Category name can only contain letters, numbers, spaces, hyphens, ampersands, and apostrophes',
			'INVALID_CHARACTERS'
		);
	}
}

function normalizeCategoryName(name: string): string {
	return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

// ============================================
// Category CRUD
// ============================================

/**
 * Create a new category
 */
export async function createCategory(
	userId: string,
	input: CreateCategoryInput
): Promise<Category> {
	validateCategoryName(input.name);

	const normalizedName = normalizeCategoryName(input.name);
	const displayName = input.name.trim();

	// Check if category or alias already exists
	const existing = await db.category.findFirst({
		where: {
			OR: [
				{ name: { equals: displayName, mode: 'insensitive' } },
				{ aliases: { some: { name: { equals: displayName, mode: 'insensitive' } } } }
			]
		},
		include: { aliases: true }
	});

	if (existing) {
		throw new CategoryError(
			`Category "${displayName}" already exists${existing.name !== displayName ? ` (alias of "${existing.name}")` : ''}`,
			'CATEGORY_EXISTS'
		);
	}

	// Validate parent category if provided
	if (input.parentId) {
		const parent = await db.category.findUnique({
			where: { id: input.parentId }
		});

		if (!parent) {
			throw new CategoryError('Parent category not found', 'PARENT_NOT_FOUND');
		}
	}

	return db.category.create({
		data: {
			name: displayName,
			parentId: input.parentId || null,
			createdByUserId: userId
		}
	});
}

/**
 * Get category by ID with full details
 */
export async function getCategoryById(categoryId: string): Promise<CategoryWithDetails | null> {
	return db.category.findUnique({
		where: { id: categoryId },
		include: {
			aliases: true,
			parent: true,
			children: true,
			_count: {
				select: {
					facts: true,
					children: true
				}
			}
		}
	});
}

/**
 * Get category by name (checks both name and aliases)
 */
export async function getCategoryByName(name: string): Promise<Category | null> {
	// First check direct name match
	const category = await db.category.findFirst({
		where: {
			name: { equals: name, mode: 'insensitive' }
		}
	});

	if (category) return category;

	// Check aliases
	const alias = await db.categoryAlias.findFirst({
		where: {
			name: { equals: name, mode: 'insensitive' }
		},
		include: { category: true }
	});

	return alias?.category || null;
}

/**
 * List all categories with optional filters
 */
export async function listCategories(options?: {
	parentId?: string | null;
	search?: string;
	page?: number;
	limit?: number;
}): Promise<{ categories: CategoryWithDetails[]; total: number }> {
	const page = options?.page || 1;
	const limit = Math.min(options?.limit || 50, 100);
	const skip = (page - 1) * limit;

	const where: any = {};

	if (options?.parentId !== undefined) {
		where.parentId = options.parentId;
	}

	if (options?.search) {
		where.OR = [
			{ name: { contains: options.search, mode: 'insensitive' } },
			{ aliases: { some: { name: { contains: options.search, mode: 'insensitive' } } } }
		];
	}

	const [categories, total] = await Promise.all([
		db.category.findMany({
			where,
			include: {
				aliases: true,
				parent: true,
				children: true,
				_count: {
					select: {
						facts: true,
						children: true
					}
				}
			},
			orderBy: { name: 'asc' },
			skip,
			take: limit
		}),
		db.category.count({ where })
	]);

	return { categories, total };
}

/**
 * Get root categories (no parent)
 */
export async function getRootCategories(): Promise<CategoryWithDetails[]> {
	const result = await listCategories({ parentId: null });
	return result.categories;
}

/**
 * Get category hierarchy (tree structure)
 */
export async function getCategoryTree(): Promise<CategoryWithDetails[]> {
	// Get all categories
	const allCategories = await db.category.findMany({
		include: {
			aliases: true,
			parent: true,
			children: {
				include: {
					aliases: true,
					children: true,
					_count: { select: { facts: true, children: true } }
				}
			},
			_count: { select: { facts: true, children: true } }
		},
		orderBy: { name: 'asc' }
	});

	// Return only root categories (children are nested)
	return allCategories.filter((c) => c.parentId === null) as CategoryWithDetails[];
}

// ============================================
// Category Aliases
// ============================================

/**
 * Add an alias to a category
 */
export async function addCategoryAlias(categoryId: string, aliasName: string): Promise<CategoryAlias> {
	validateCategoryName(aliasName);

	const category = await db.category.findUnique({
		where: { id: categoryId }
	});

	if (!category) {
		throw new CategoryError('Category not found', 'CATEGORY_NOT_FOUND');
	}

	// Check if alias already exists as category or alias
	const existing = await db.category.findFirst({
		where: {
			OR: [
				{ name: { equals: aliasName, mode: 'insensitive' } },
				{ aliases: { some: { name: { equals: aliasName, mode: 'insensitive' } } } }
			]
		}
	});

	if (existing) {
		throw new CategoryError('This name already exists as a category or alias', 'ALIAS_EXISTS');
	}

	return db.categoryAlias.create({
		data: {
			name: aliasName.trim(),
			categoryId
		}
	});
}

/**
 * Remove an alias from a category
 */
export async function removeCategoryAlias(aliasId: string): Promise<void> {
	const alias = await db.categoryAlias.findUnique({
		where: { id: aliasId }
	});

	if (!alias) {
		throw new CategoryError('Alias not found', 'ALIAS_NOT_FOUND');
	}

	await db.categoryAlias.delete({
		where: { id: aliasId }
	});
}

// ============================================
// Category Merge Requests
// ============================================

/**
 * Create a merge request (e.g., merge "cook" into "cooking")
 */
export async function createMergeRequest(
	userId: string,
	input: CreateMergeRequestInput
): Promise<CategoryMergeRequest> {
	if (input.fromCategoryId === input.toCategoryId) {
		throw new CategoryError('Cannot merge a category into itself', 'SAME_CATEGORY');
	}

	// Verify both categories exist
	const [fromCategory, toCategory] = await Promise.all([
		db.category.findUnique({ where: { id: input.fromCategoryId } }),
		db.category.findUnique({ where: { id: input.toCategoryId } })
	]);

	if (!fromCategory) {
		throw new CategoryError('Source category not found', 'FROM_CATEGORY_NOT_FOUND');
	}

	if (!toCategory) {
		throw new CategoryError('Target category not found', 'TO_CATEGORY_NOT_FOUND');
	}

	// Check for existing pending merge request
	const existingRequest = await db.categoryMergeRequest.findFirst({
		where: {
			status: 'PENDING',
			OR: [
				{ fromCategoryId: input.fromCategoryId, toCategoryId: input.toCategoryId },
				{ fromCategoryId: input.toCategoryId, toCategoryId: input.fromCategoryId }
			]
		}
	});

	if (existingRequest) {
		throw new CategoryError(
			'A pending merge request already exists between these categories',
			'REQUEST_EXISTS'
		);
	}

	return db.categoryMergeRequest.create({
		data: {
			fromCategoryId: input.fromCategoryId,
			toCategoryId: input.toCategoryId,
			requestedById: userId
		}
	});
}

/**
 * Get merge request by ID with details
 */
export async function getMergeRequestById(
	requestId: string
): Promise<MergeRequestWithDetails | null> {
	const request = await db.categoryMergeRequest.findUnique({
		where: { id: requestId },
		include: {
			fromCategory: true,
			toCategory: true,
			requestedBy: {
				select: { id: true, firstName: true, lastName: true }
			},
			_count: { select: { votes: true } }
		}
	});

	if (!request) return null;

	// Get vote summary
	const votes = await db.categoryMergeVote.findMany({
		where: { mergeRequestId: requestId }
	});

	const approveCount = votes.filter((v) => v.value > 0).length;
	const rejectCount = votes.filter((v) => v.value < 0).length;

	return {
		...request,
		voteSummary: {
			approveCount,
			rejectCount,
			totalVotes: votes.length
		}
	};
}

/**
 * List pending merge requests
 */
export async function listMergeRequests(options?: {
	status?: MergeRequestStatus;
	categoryId?: string;
	page?: number;
	limit?: number;
}): Promise<{ requests: MergeRequestWithDetails[]; total: number }> {
	const page = options?.page || 1;
	const limit = Math.min(options?.limit || 20, 50);
	const skip = (page - 1) * limit;

	const where: any = {};

	if (options?.status) {
		where.status = options.status;
	}

	if (options?.categoryId) {
		where.OR = [
			{ fromCategoryId: options.categoryId },
			{ toCategoryId: options.categoryId }
		];
	}

	const [requests, total] = await Promise.all([
		db.categoryMergeRequest.findMany({
			where,
			include: {
				fromCategory: true,
				toCategory: true,
				requestedBy: {
					select: { id: true, firstName: true, lastName: true }
				},
				_count: { select: { votes: true } }
			},
			orderBy: { createdAt: 'desc' },
			skip,
			take: limit
		}),
		db.categoryMergeRequest.count({ where })
	]);

	// Add vote summaries
	const requestsWithSummaries = await Promise.all(
		requests.map(async (request) => {
			const votes = await db.categoryMergeVote.findMany({
				where: { mergeRequestId: request.id }
			});

			const approveCount = votes.filter((v) => v.value > 0).length;
			const rejectCount = votes.filter((v) => v.value < 0).length;

			return {
				...request,
				voteSummary: {
					approveCount,
					rejectCount,
					totalVotes: votes.length
				}
			};
		})
	);

	return { requests: requestsWithSummaries, total };
}

/**
 * Vote on a merge request
 */
export async function voteOnMergeRequest(
	userId: string,
	requestId: string,
	value: 1 | -1
): Promise<{ vote: any; requestStatus: MergeRequestStatus; resolved: boolean }> {
	const request = await db.categoryMergeRequest.findUnique({
		where: { id: requestId },
		include: { fromCategory: true, toCategory: true }
	});

	if (!request) {
		throw new CategoryError('Merge request not found', 'REQUEST_NOT_FOUND');
	}

	if (request.status !== 'PENDING') {
		throw new CategoryError('This merge request has already been resolved', 'REQUEST_RESOLVED');
	}

	// Upsert vote
	const vote = await db.categoryMergeVote.upsert({
		where: {
			mergeRequestId_userId: {
				mergeRequestId: requestId,
				userId
			}
		},
		create: {
			mergeRequestId: requestId,
			userId,
			value
		},
		update: {
			value
		}
	});

	// Check if threshold reached
	const allVotes = await db.categoryMergeVote.findMany({
		where: { mergeRequestId: requestId }
	});

	const netVotes = allVotes.reduce((sum, v) => sum + v.value, 0);

	let newStatus: MergeRequestStatus = 'PENDING';
	let resolved = false;

	if (netVotes >= MERGE_APPROVAL_THRESHOLD) {
		// Approve and execute merge
		await executeMerge(request.fromCategoryId, request.toCategoryId);
		newStatus = 'APPROVED';
		resolved = true;

		await db.categoryMergeRequest.update({
			where: { id: requestId },
			data: {
				status: 'APPROVED',
				resolvedAt: new Date()
			}
		});
	} else if (netVotes <= MERGE_REJECTION_THRESHOLD) {
		// Reject merge request
		newStatus = 'REJECTED';
		resolved = true;

		await db.categoryMergeRequest.update({
			where: { id: requestId },
			data: {
				status: 'REJECTED',
				resolvedAt: new Date()
			}
		});
	}

	return { vote, requestStatus: newStatus, resolved };
}

/**
 * Get user's vote on a merge request
 */
export async function getUserMergeVote(
	userId: string,
	requestId: string
): Promise<{ value: number } | null> {
	return db.categoryMergeVote.findUnique({
		where: {
			mergeRequestId_userId: {
				mergeRequestId: requestId,
				userId
			}
		},
		select: { value: true }
	});
}

// ============================================
// Merge Execution
// ============================================

/**
 * Execute a category merge
 * - Move all facts from fromCategory to toCategory
 * - Add fromCategory name as alias of toCategory
 * - Delete fromCategory
 */
async function executeMerge(fromCategoryId: string, toCategoryId: string): Promise<void> {
	const fromCategory = await db.category.findUnique({
		where: { id: fromCategoryId },
		include: { aliases: true }
	});

	if (!fromCategory) {
		throw new CategoryError('Source category not found', 'FROM_CATEGORY_NOT_FOUND');
	}

	await db.$transaction(async (tx) => {
		// Move all facts to target category
		await tx.fact.updateMany({
			where: { categoryId: fromCategoryId },
			data: { categoryId: toCategoryId }
		});

		// Move children to target category
		await tx.category.updateMany({
			where: { parentId: fromCategoryId },
			data: { parentId: toCategoryId }
		});

		// Add source category name as alias
		await tx.categoryAlias.create({
			data: {
				name: fromCategory.name,
				categoryId: toCategoryId
			}
		});

		// Move existing aliases to target category
		for (const alias of fromCategory.aliases) {
			await tx.categoryAlias.update({
				where: { id: alias.id },
				data: { categoryId: toCategoryId }
			});
		}

		// Delete source category (this will cascade delete related merge requests)
		await tx.category.delete({
			where: { id: fromCategoryId }
		});
	});
}

/**
 * Manually merge categories (for moderators)
 */
export async function manualMerge(fromCategoryId: string, toCategoryId: string): Promise<void> {
	if (fromCategoryId === toCategoryId) {
		throw new CategoryError('Cannot merge a category into itself', 'SAME_CATEGORY');
	}

	const [fromCategory, toCategory] = await Promise.all([
		db.category.findUnique({ where: { id: fromCategoryId } }),
		db.category.findUnique({ where: { id: toCategoryId } })
	]);

	if (!fromCategory) {
		throw new CategoryError('Source category not found', 'FROM_CATEGORY_NOT_FOUND');
	}

	if (!toCategory) {
		throw new CategoryError('Target category not found', 'TO_CATEGORY_NOT_FOUND');
	}

	await executeMerge(fromCategoryId, toCategoryId);
}

// ============================================
// Category Statistics
// ============================================

/**
 * Get category statistics
 */
export async function getCategoryStats(): Promise<{
	totalCategories: number;
	totalAliases: number;
	pendingMergeRequests: number;
	categoriesWithFacts: number;
}> {
	const [totalCategories, totalAliases, pendingMergeRequests, categoriesWithFacts] =
		await Promise.all([
			db.category.count(),
			db.categoryAlias.count(),
			db.categoryMergeRequest.count({ where: { status: 'PENDING' } }),
			db.category.count({
				where: {
					facts: { some: {} }
				}
			})
		]);

	return {
		totalCategories,
		totalAliases,
		pendingMergeRequests,
		categoriesWithFacts
	};
}
