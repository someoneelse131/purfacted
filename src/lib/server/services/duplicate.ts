import { db } from '../db';
import type { Fact } from '@prisma/client';

export class DuplicateError extends Error {
	constructor(
		message: string,
		public code: string
	) {
		super(message);
		this.name = 'DuplicateError';
	}
}

/**
 * Flag a fact as a potential duplicate
 */
export async function flagAsDuplicate(
	factId: string,
	duplicateOfId: string,
	reporterId: string
): Promise<Fact> {
	// Validate facts exist
	const [fact, duplicateOf] = await Promise.all([
		db.fact.findUnique({ where: { id: factId } }),
		db.fact.findUnique({ where: { id: duplicateOfId } })
	]);

	if (!fact) {
		throw new DuplicateError('Fact not found', 'FACT_NOT_FOUND');
	}

	if (!duplicateOf) {
		throw new DuplicateError('Target fact not found', 'TARGET_NOT_FOUND');
	}

	if (factId === duplicateOfId) {
		throw new DuplicateError('Cannot mark fact as duplicate of itself', 'SELF_DUPLICATE');
	}

	if (fact.duplicateOfId) {
		throw new DuplicateError('Fact is already marked as duplicate', 'ALREADY_DUPLICATE');
	}

	// Mark as duplicate (pending moderator approval)
	// For now, we directly mark it - in production, this would go to moderation queue
	return db.fact.update({
		where: { id: factId },
		data: { duplicateOfId }
	});
}

/**
 * Approve a duplicate flag (moderator action)
 */
export async function approveDuplicate(factId: string): Promise<Fact> {
	const fact = await db.fact.findUnique({
		where: { id: factId },
		include: { duplicateOf: true }
	});

	if (!fact) {
		throw new DuplicateError('Fact not found', 'FACT_NOT_FOUND');
	}

	if (!fact.duplicateOfId) {
		throw new DuplicateError('Fact is not flagged as duplicate', 'NOT_DUPLICATE');
	}

	// The fact is already marked, just return it
	// In a full implementation, we might transfer votes/discussions here
	return fact;
}

/**
 * Reject a duplicate flag (moderator action)
 */
export async function rejectDuplicate(factId: string): Promise<Fact> {
	const fact = await db.fact.findUnique({
		where: { id: factId }
	});

	if (!fact) {
		throw new DuplicateError('Fact not found', 'FACT_NOT_FOUND');
	}

	if (!fact.duplicateOfId) {
		throw new DuplicateError('Fact is not flagged as duplicate', 'NOT_DUPLICATE');
	}

	// Remove duplicate flag
	return db.fact.update({
		where: { id: factId },
		data: { duplicateOfId: null }
	});
}

/**
 * Get all duplicates of a fact
 */
export async function getDuplicatesOf(factId: string): Promise<Fact[]> {
	return db.fact.findMany({
		where: { duplicateOfId: factId }
	});
}

/**
 * Get the primary fact (if this is a duplicate)
 */
export async function getPrimaryFact(factId: string): Promise<Fact | null> {
	const fact = await db.fact.findUnique({
		where: { id: factId },
		include: { duplicateOf: true }
	});

	return fact?.duplicateOf || null;
}

/**
 * Merge duplicates into primary fact
 * This transfers votes from duplicate to primary
 */
export async function mergeDuplicates(primaryFactId: string): Promise<{
	primary: Fact;
	mergedCount: number;
	votesTransferred: number;
}> {
	const primary = await db.fact.findUnique({
		where: { id: primaryFactId }
	});

	if (!primary) {
		throw new DuplicateError('Primary fact not found', 'PRIMARY_NOT_FOUND');
	}

	// Get all duplicates
	const duplicates = await getDuplicatesOf(primaryFactId);

	let votesTransferred = 0;

	for (const duplicate of duplicates) {
		// Get votes from duplicate
		const duplicateVotes = await db.factVote.findMany({
			where: { factId: duplicate.id }
		});

		// Transfer votes that don't already exist on primary
		for (const vote of duplicateVotes) {
			const existingVote = await db.factVote.findUnique({
				where: { factId_userId: { factId: primaryFactId, userId: vote.userId } }
			});

			if (!existingVote) {
				await db.factVote.create({
					data: {
						factId: primaryFactId,
						userId: vote.userId,
						value: vote.value,
						weight: vote.weight
					}
				});
				votesTransferred++;
			}
		}

		// Delete votes from duplicate
		await db.factVote.deleteMany({
			where: { factId: duplicate.id }
		});
	}

	return {
		primary,
		mergedCount: duplicates.length,
		votesTransferred
	};
}

/**
 * Find potential duplicates based on title similarity
 */
export async function findPotentialDuplicates(
	title: string,
	excludeFactId?: string
): Promise<Array<{ fact: Fact; similarity: number }>> {
	// Get all facts (in production, use full-text search or similarity search)
	const facts = await db.fact.findMany({
		where: {
			id: excludeFactId ? { not: excludeFactId } : undefined,
			duplicateOfId: null // Only search non-duplicates
		},
		take: 100
	});

	// Simple similarity calculation (Jaccard-like)
	const normalizedTitle = title.toLowerCase().trim();
	const titleWords = new Set(normalizedTitle.split(/\s+/));

	const results: Array<{ fact: Fact; similarity: number }> = [];

	for (const fact of facts) {
		const factTitle = fact.title.toLowerCase().trim();
		const factWords = new Set(factTitle.split(/\s+/));

		// Calculate Jaccard similarity
		const intersection = new Set([...titleWords].filter((x) => factWords.has(x)));
		const union = new Set([...titleWords, ...factWords]);
		const similarity = intersection.size / union.size;

		if (similarity > 0.3) {
			// Threshold of 30% similarity
			results.push({ fact, similarity });
		}
	}

	// Sort by similarity descending
	results.sort((a, b) => b.similarity - a.similarity);

	return results.slice(0, 10); // Return top 10
}

/**
 * Get duplicate statistics
 */
export async function getDuplicateStats(): Promise<{
	totalDuplicates: number;
	factsWithDuplicates: number;
}> {
	const [totalDuplicates, factsWithDuplicates] = await Promise.all([
		db.fact.count({ where: { duplicateOfId: { not: null } } }),
		db.fact.count({
			where: {
				duplicates: { some: {} }
			}
		})
	]);

	return { totalDuplicates, factsWithDuplicates };
}
