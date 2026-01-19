import { db } from '../db';
import type { SourceType, Source } from '@prisma/client';
import {
	getCredibilityPoints,
	setCachedCredibilityPoints,
	getDefaultCredibilityPoints,
	detectSourceType,
	calculateTotalCredibility
} from '$lib/utils/sourceCredibility';

/**
 * Load source credibility config from database
 */
export async function loadSourceCredibilityConfig(): Promise<void> {
	try {
		const configs = await db.sourceCredibilityConfig.findMany();

		if (configs.length > 0) {
			const points: Partial<Record<SourceType, number>> = {};
			for (const config of configs) {
				points[config.sourceType] = config.points;
			}

			// Merge with defaults for any missing types
			const defaults = getDefaultCredibilityPoints();
			const merged = { ...defaults, ...points } as Record<SourceType, number>;
			setCachedCredibilityPoints(merged);
		}
	} catch (error) {
		console.warn('Failed to load source credibility config from database, using defaults:', error);
	}
}

/**
 * Initialize source credibility config in database with defaults
 */
export async function initializeSourceCredibilityConfig(): Promise<void> {
	const defaults = getDefaultCredibilityPoints();

	for (const [sourceType, points] of Object.entries(defaults)) {
		await db.sourceCredibilityConfig.upsert({
			where: { sourceType: sourceType as SourceType },
			create: { sourceType: sourceType as SourceType, points },
			update: {}
		});
	}
}

/**
 * Get source credibility config from database
 */
export async function getSourceCredibilityConfig(): Promise<Record<SourceType, number>> {
	const configs = await db.sourceCredibilityConfig.findMany();

	const result: Partial<Record<SourceType, number>> = {};
	for (const config of configs) {
		result[config.sourceType] = config.points;
	}

	// Fill in defaults for any missing types
	const defaults = getDefaultCredibilityPoints();
	for (const [sourceType, points] of Object.entries(defaults)) {
		if (!(sourceType in result)) {
			result[sourceType as SourceType] = points;
		}
	}

	return result as Record<SourceType, number>;
}

/**
 * Update source credibility config in database
 */
export async function updateSourceCredibilityConfig(
	sourceType: SourceType,
	points: number
): Promise<void> {
	await db.sourceCredibilityConfig.upsert({
		where: { sourceType },
		create: { sourceType, points },
		update: { points }
	});

	// Reload cache
	await loadSourceCredibilityConfig();
}

/**
 * Update source type for a source (moderator correction)
 */
export async function updateSourceType(
	sourceId: string,
	newType: SourceType
): Promise<Source> {
	return db.source.update({
		where: { id: sourceId },
		data: { type: newType }
	});
}

/**
 * Get all sources for a fact
 */
export async function getFactSources(factId: string): Promise<Source[]> {
	return db.source.findMany({
		where: { factId },
		orderBy: { createdAt: 'asc' }
	});
}

/**
 * Calculate credibility score for a fact's sources
 */
export async function calculateFactCredibility(factId: string): Promise<{
	totalScore: number;
	sourceCount: number;
	breakdown: Array<{ sourceId: string; type: SourceType; points: number }>;
}> {
	const sources = await getFactSources(factId);

	const breakdown = sources.map((source) => ({
		sourceId: source.id,
		type: source.type,
		points: getCredibilityPoints(source.type)
	}));

	return {
		totalScore: calculateTotalCredibility(sources),
		sourceCount: sources.length,
		breakdown
	};
}

/**
 * Auto-suggest source type from URL
 */
export function suggestSourceType(url: string): {
	detectedType: SourceType;
	confidence: 'high' | 'medium' | 'low';
} {
	const detectedType = detectSourceType(url);

	// Determine confidence based on detection method
	let confidence: 'high' | 'medium' | 'low' = 'low';

	try {
		const urlObj = new URL(url);
		const hostname = urlObj.hostname.toLowerCase();

		// High confidence for known domains
		const knownDomains = [
			'pubmed.ncbi.nlm.nih.gov',
			'nature.com',
			'science.org',
			'reuters.com',
			'bbc.com',
			'nytimes.com'
		];
		if (knownDomains.some((d) => hostname.includes(d))) {
			confidence = 'high';
		}
		// High confidence for TLD-based detection
		else if (hostname.endsWith('.gov') || hostname.endsWith('.edu')) {
			confidence = 'high';
		}
		// Medium confidence for pattern-based detection
		else if (detectedType !== 'OTHER' && detectedType !== 'COMPANY') {
			confidence = 'medium';
		}
	} catch {
		confidence = 'low';
	}

	return { detectedType, confidence };
}

/**
 * Get statistics about sources
 */
export async function getSourceStatistics(): Promise<{
	totalSources: number;
	byType: Record<SourceType, number>;
	averagePerFact: number;
}> {
	const [totalSources, facts, sourcesByType] = await Promise.all([
		db.source.count(),
		db.fact.count(),
		db.source.groupBy({
			by: ['type'],
			_count: true
		})
	]);

	const byType: Record<SourceType, number> = {
		PEER_REVIEWED: 0,
		OFFICIAL: 0,
		NEWS: 0,
		COMPANY: 0,
		BLOG: 0,
		OTHER: 0
	};

	for (const group of sourcesByType) {
		byType[group.type] = group._count;
	}

	return {
		totalSources,
		byType,
		averagePerFact: facts > 0 ? totalSources / facts : 0
	};
}
