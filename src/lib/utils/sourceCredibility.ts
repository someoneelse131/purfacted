import type { SourceType } from '@prisma/client';

// Default credibility points by source type
const DEFAULT_CREDIBILITY_POINTS: Record<SourceType, number> = {
	PEER_REVIEWED: 5,
	OFFICIAL: 4,
	NEWS: 3,
	COMPANY: 2,
	BLOG: 1,
	OTHER: 0
};

// Cached credibility config (loaded from database)
let cachedCredibilityPoints: Record<SourceType, number> | null = null;

/**
 * Set cached credibility points (from database)
 */
export function setCachedCredibilityPoints(points: Record<SourceType, number>): void {
	cachedCredibilityPoints = points;
}

/**
 * Get default credibility points
 */
export function getDefaultCredibilityPoints(): Record<SourceType, number> {
	return { ...DEFAULT_CREDIBILITY_POINTS };
}

/**
 * Get credibility points for a source type
 */
export function getCredibilityPoints(sourceType: SourceType): number {
	if (cachedCredibilityPoints) {
		return cachedCredibilityPoints[sourceType] ?? DEFAULT_CREDIBILITY_POINTS[sourceType];
	}
	return DEFAULT_CREDIBILITY_POINTS[sourceType];
}

/**
 * Auto-detect source type from URL
 */
export function detectSourceType(url: string): SourceType {
	try {
		const urlObj = new URL(url);
		const hostname = urlObj.hostname.toLowerCase();

		// Known peer-reviewed sources (check first, before .gov)
		const peerReviewedDomains = [
			'pubmed.ncbi.nlm.nih.gov',
			'nature.com',
			'science.org',
			'sciencedirect.com',
			'springer.com',
			'wiley.com',
			'jstor.org',
			'arxiv.org',
			'researchgate.net',
			'scholar.google.com'
		];
		if (peerReviewedDomains.some((d) => hostname.includes(d))) {
			return 'PEER_REVIEWED';
		}

		// Educational/Research institutions
		if (hostname.endsWith('.edu') || hostname.endsWith('.ac.uk')) {
			return 'PEER_REVIEWED';
		}

		// Official government sites
		if (hostname.endsWith('.gov') || hostname.endsWith('.gov.uk') || hostname.endsWith('.europa.eu')) {
			return 'OFFICIAL';
		}

		// Known news organizations
		const newsDomains = [
			'reuters.com',
			'apnews.com',
			'bbc.com',
			'bbc.co.uk',
			'nytimes.com',
			'washingtonpost.com',
			'theguardian.com',
			'cnn.com',
			'npr.org',
			'pbs.org'
		];
		if (newsDomains.some((d) => hostname.includes(d))) {
			return 'NEWS';
		}

		// Company domains (common TLDs or known patterns)
		const companyIndicators = ['.com', '.co', '.io', '.net'];
		const blogIndicators = ['blog', 'medium.com', 'substack.com', 'wordpress.com', 'blogger.com'];

		if (blogIndicators.some((b) => hostname.includes(b) || url.includes(b))) {
			return 'BLOG';
		}

		if (companyIndicators.some((c) => hostname.endsWith(c))) {
			return 'COMPANY';
		}

		return 'OTHER';
	} catch {
		return 'OTHER';
	}
}

/**
 * Get human-readable source type label
 */
export function getSourceTypeLabel(sourceType: SourceType): string {
	const labels: Record<SourceType, string> = {
		PEER_REVIEWED: 'Peer-Reviewed',
		OFFICIAL: 'Official Source',
		NEWS: 'News Organization',
		COMPANY: 'Company/Corporate',
		BLOG: 'Blog/Personal',
		OTHER: 'Other'
	};
	return labels[sourceType];
}

/**
 * Get source type badge color
 */
export function getSourceTypeBadgeColor(sourceType: SourceType): string {
	const colors: Record<SourceType, string> = {
		PEER_REVIEWED: 'bg-green-100 text-green-800',
		OFFICIAL: 'bg-blue-100 text-blue-800',
		NEWS: 'bg-purple-100 text-purple-800',
		COMPANY: 'bg-yellow-100 text-yellow-800',
		BLOG: 'bg-orange-100 text-orange-800',
		OTHER: 'bg-gray-100 text-gray-800'
	};
	return colors[sourceType];
}

/**
 * Calculate total credibility score for multiple sources
 */
export function calculateTotalCredibility(sources: Array<{ type: SourceType }>): number {
	return sources.reduce((total, source) => total + getCredibilityPoints(source.type), 0);
}

/**
 * Get credibility rating label
 */
export function getCredibilityRating(totalCredibility: number): string {
	if (totalCredibility >= 15) return 'Excellent';
	if (totalCredibility >= 10) return 'Very Good';
	if (totalCredibility >= 5) return 'Good';
	if (totalCredibility >= 2) return 'Fair';
	return 'Low';
}
