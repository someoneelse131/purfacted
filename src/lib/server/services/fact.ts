import { db } from '../db';
import type { Fact, Source, SourceType, FactStatus, User } from '@prisma/client';
import { detectSourceType, calculateTotalCredibility } from '$lib/utils/sourceCredibility';

// Configuration defaults (can be overridden via env)
const FACT_TITLE_MAX_LENGTH = parseInt(process.env.FACT_TITLE_MAX_LENGTH || '200');
const FACT_BODY_MAX_LENGTH = parseInt(process.env.FACT_BODY_MAX_LENGTH || '5000');
const FACT_MAX_PER_DAY_NEW_USER = parseInt(process.env.FACT_MAX_PER_DAY_NEW_USER || '5');

interface CreateFactInput {
	title: string;
	body: string;
	categoryId?: string;
	sources: Array<{
		url: string;
		title?: string;
		type?: SourceType;
	}>;
}

interface FactWithSources extends Fact {
	sources: Source[];
	user: Pick<User, 'id' | 'firstName' | 'lastName' | 'userType'>;
	category?: { id: string; name: string } | null;
}

/**
 * Validation error class
 */
export class FactValidationError extends Error {
	constructor(
		message: string,
		public code: string
	) {
		super(message);
		this.name = 'FactValidationError';
	}
}

/**
 * Validate fact input
 */
export function validateFactInput(input: CreateFactInput): void {
	// Title validation
	if (!input.title || input.title.trim().length === 0) {
		throw new FactValidationError('Title is required', 'TITLE_REQUIRED');
	}
	if (input.title.length > FACT_TITLE_MAX_LENGTH) {
		throw new FactValidationError(
			`Title must be ${FACT_TITLE_MAX_LENGTH} characters or less`,
			'TITLE_TOO_LONG'
		);
	}

	// Body validation
	if (!input.body || input.body.trim().length === 0) {
		throw new FactValidationError('Body is required', 'BODY_REQUIRED');
	}
	if (input.body.length > FACT_BODY_MAX_LENGTH) {
		throw new FactValidationError(
			`Body must be ${FACT_BODY_MAX_LENGTH} characters or less`,
			'BODY_TOO_LONG'
		);
	}

	// Source validation
	if (!input.sources || input.sources.length === 0) {
		throw new FactValidationError('At least one source is required', 'SOURCE_REQUIRED');
	}

	// Validate each source URL
	for (const source of input.sources) {
		if (!source.url || source.url.trim().length === 0) {
			throw new FactValidationError('Source URL is required', 'SOURCE_URL_REQUIRED');
		}
		try {
			new URL(source.url);
		} catch {
			throw new FactValidationError(`Invalid source URL: ${source.url}`, 'INVALID_SOURCE_URL');
		}
	}
}

/**
 * Check if user can create more facts today
 */
export async function canUserCreateFact(userId: string): Promise<boolean> {
	const user = await db.user.findUnique({
		where: { id: userId },
		select: { createdAt: true, trustScore: true }
	});

	if (!user) {
		return false;
	}

	// Check if new user (registered within last 30 days)
	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
	const isNewUser = user.createdAt > thirtyDaysAgo;

	if (!isNewUser) {
		return true; // No limit for established users
	}

	// Count facts created today
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const factsToday = await db.fact.count({
		where: {
			userId,
			createdAt: { gte: today }
		}
	});

	return factsToday < FACT_MAX_PER_DAY_NEW_USER;
}

/**
 * Get remaining fact submissions for today
 */
export async function getRemainingFactsToday(userId: string): Promise<number> {
	const user = await db.user.findUnique({
		where: { id: userId },
		select: { createdAt: true }
	});

	if (!user) {
		return 0;
	}

	// Check if new user
	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
	const isNewUser = user.createdAt > thirtyDaysAgo;

	if (!isNewUser) {
		return -1; // Unlimited
	}

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const factsToday = await db.fact.count({
		where: {
			userId,
			createdAt: { gte: today }
		}
	});

	return Math.max(0, FACT_MAX_PER_DAY_NEW_USER - factsToday);
}

/**
 * Create a new fact with sources
 */
export async function createFact(
	userId: string,
	input: CreateFactInput
): Promise<FactWithSources> {
	// Validate input
	validateFactInput(input);

	// Check rate limit
	const canCreate = await canUserCreateFact(userId);
	if (!canCreate) {
		throw new FactValidationError(
			`New users can only create ${FACT_MAX_PER_DAY_NEW_USER} facts per day`,
			'RATE_LIMIT_EXCEEDED'
		);
	}

	// Validate category if provided
	if (input.categoryId) {
		const category = await db.category.findUnique({
			where: { id: input.categoryId }
		});
		if (!category) {
			throw new FactValidationError('Category not found', 'CATEGORY_NOT_FOUND');
		}
	}

	// Create fact with sources
	const fact = await db.fact.create({
		data: {
			title: input.title.trim(),
			body: input.body.trim(),
			userId,
			categoryId: input.categoryId || null,
			status: 'SUBMITTED',
			sources: {
				create: input.sources.map((source) => ({
					url: source.url.trim(),
					title: source.title?.trim() || null,
					type: source.type || detectSourceType(source.url),
					addedById: userId
				}))
			}
		},
		include: {
			sources: true,
			user: {
				select: { id: true, firstName: true, lastName: true, userType: true }
			},
			category: { select: { id: true, name: true } }
		}
	});

	return fact;
}

/**
 * Get a fact by ID with all relations
 */
export async function getFactById(factId: string): Promise<FactWithSources | null> {
	return db.fact.findUnique({
		where: { id: factId },
		include: {
			sources: true,
			user: {
				select: { id: true, firstName: true, lastName: true, userType: true }
			},
			category: { select: { id: true, name: true } }
		}
	});
}

/**
 * Get facts with pagination and filters
 */
export async function getFacts(options: {
	page?: number;
	limit?: number;
	status?: FactStatus;
	categoryId?: string;
	userId?: string;
	search?: string;
	sortBy?: 'newest' | 'oldest' | 'controversial';
}): Promise<{ facts: FactWithSources[]; total: number; pages: number }> {
	const page = options.page || 1;
	const limit = options.limit || 20;
	const skip = (page - 1) * limit;

	const where: any = {};

	if (options.status) {
		where.status = options.status;
	}

	if (options.categoryId) {
		where.categoryId = options.categoryId;
	}

	if (options.userId) {
		where.userId = options.userId;
	}

	if (options.search) {
		where.OR = [
			{ title: { contains: options.search, mode: 'insensitive' } },
			{ body: { contains: options.search, mode: 'insensitive' } }
		];
	}

	let orderBy: any = { createdAt: 'desc' };
	if (options.sortBy === 'oldest') {
		orderBy = { createdAt: 'asc' };
	}
	// Note: 'controversial' sorting would need vote aggregation which we'll add later

	const [facts, total] = await Promise.all([
		db.fact.findMany({
			where,
			include: {
				sources: true,
				user: {
					select: { id: true, firstName: true, lastName: true, userType: true }
				},
				category: { select: { id: true, name: true } }
			},
			orderBy,
			skip,
			take: limit
		}),
		db.fact.count({ where })
	]);

	return {
		facts,
		total,
		pages: Math.ceil(total / limit)
	};
}

/**
 * Add a source to an existing fact
 */
export async function addSourceToFact(
	factId: string,
	userId: string,
	source: { url: string; title?: string; type?: SourceType }
): Promise<Source> {
	// Validate URL
	try {
		new URL(source.url);
	} catch {
		throw new FactValidationError(`Invalid source URL: ${source.url}`, 'INVALID_SOURCE_URL');
	}

	// Check fact exists
	const fact = await db.fact.findUnique({ where: { id: factId } });
	if (!fact) {
		throw new FactValidationError('Fact not found', 'FACT_NOT_FOUND');
	}

	return db.source.create({
		data: {
			factId,
			url: source.url.trim(),
			title: source.title?.trim() || null,
			type: source.type || detectSourceType(source.url),
			addedById: userId
		}
	});
}

/**
 * Update fact status
 */
export async function updateFactStatus(factId: string, status: FactStatus): Promise<Fact> {
	return db.fact.update({
		where: { id: factId },
		data: { status }
	});
}

/**
 * Mark fact as duplicate
 */
export async function markFactAsDuplicate(factId: string, duplicateOfId: string): Promise<Fact> {
	// Verify both facts exist
	const [fact, duplicateOf] = await Promise.all([
		db.fact.findUnique({ where: { id: factId } }),
		db.fact.findUnique({ where: { id: duplicateOfId } })
	]);

	if (!fact) {
		throw new FactValidationError('Fact not found', 'FACT_NOT_FOUND');
	}
	if (!duplicateOf) {
		throw new FactValidationError('Target fact not found', 'TARGET_FACT_NOT_FOUND');
	}
	if (factId === duplicateOfId) {
		throw new FactValidationError('Cannot mark fact as duplicate of itself', 'SELF_DUPLICATE');
	}

	return db.fact.update({
		where: { id: factId },
		data: { duplicateOfId }
	});
}

/**
 * Get fact source credibility score
 */
export async function getFactCredibilityScore(factId: string): Promise<number> {
	const sources = await db.source.findMany({
		where: { factId },
		select: { type: true }
	});

	return calculateTotalCredibility(sources);
}

/**
 * Get user's facts
 */
export async function getUserFacts(userId: string): Promise<FactWithSources[]> {
	return db.fact.findMany({
		where: { userId },
		include: {
			sources: true,
			user: {
				select: { id: true, firstName: true, lastName: true, userType: true }
			},
			category: { select: { id: true, name: true } }
		},
		orderBy: { createdAt: 'desc' }
	});
}

/**
 * Delete a fact (only by owner)
 */
export async function deleteFact(factId: string, userId: string): Promise<void> {
	const fact = await db.fact.findUnique({ where: { id: factId } });

	if (!fact) {
		throw new FactValidationError('Fact not found', 'FACT_NOT_FOUND');
	}

	if (fact.userId !== userId) {
		throw new FactValidationError('Not authorized to delete this fact', 'NOT_AUTHORIZED');
	}

	// Only allow deletion of SUBMITTED facts
	if (fact.status !== 'SUBMITTED') {
		throw new FactValidationError('Cannot delete a fact that has been reviewed', 'CANNOT_DELETE');
	}

	await db.fact.delete({ where: { id: factId } });
}
