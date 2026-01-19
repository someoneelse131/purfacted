import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	getCredibilityPoints,
	detectSourceType,
	getSourceTypeLabel,
	calculateTotalCredibility,
	getCredibilityRating,
	setCachedCredibilityPoints,
	getDefaultCredibilityPoints
} from './sourceCredibility';

describe('R14: Source Credibility System', () => {
	beforeEach(() => {
		console.log('🧪 Test suite starting...');
	});

	afterEach(() => {
		// Reset cache
		setCachedCredibilityPoints(getDefaultCredibilityPoints());
		console.log('🧪 Test suite complete.');
	});

	describe('getCredibilityPoints', () => {
		it('should return 5 points for PEER_REVIEWED', () => {
			expect(getCredibilityPoints('PEER_REVIEWED')).toBe(5);
		});

		it('should return 4 points for OFFICIAL', () => {
			expect(getCredibilityPoints('OFFICIAL')).toBe(4);
		});

		it('should return 3 points for NEWS', () => {
			expect(getCredibilityPoints('NEWS')).toBe(3);
		});

		it('should return 2 points for COMPANY', () => {
			expect(getCredibilityPoints('COMPANY')).toBe(2);
		});

		it('should return 1 point for BLOG', () => {
			expect(getCredibilityPoints('BLOG')).toBe(1);
		});

		it('should return 0 points for OTHER', () => {
			expect(getCredibilityPoints('OTHER')).toBe(0);
		});

		it('should use cached config when available', () => {
			setCachedCredibilityPoints({
				PEER_REVIEWED: 10,
				OFFICIAL: 8,
				NEWS: 6,
				COMPANY: 4,
				BLOG: 2,
				OTHER: 1
			});

			expect(getCredibilityPoints('PEER_REVIEWED')).toBe(10);
			expect(getCredibilityPoints('OFFICIAL')).toBe(8);
		});
	});

	describe('detectSourceType', () => {
		it('should detect .gov as OFFICIAL', () => {
			expect(detectSourceType('https://www.cdc.gov/health')).toBe('OFFICIAL');
			expect(detectSourceType('https://www.whitehouse.gov')).toBe('OFFICIAL');
		});

		it('should detect .edu as PEER_REVIEWED', () => {
			expect(detectSourceType('https://www.harvard.edu/research')).toBe('PEER_REVIEWED');
			expect(detectSourceType('https://mit.edu/papers')).toBe('PEER_REVIEWED');
		});

		it('should detect known academic sources as PEER_REVIEWED', () => {
			expect(detectSourceType('https://pubmed.ncbi.nlm.nih.gov/12345')).toBe('PEER_REVIEWED');
			expect(detectSourceType('https://www.nature.com/articles/xxx')).toBe('PEER_REVIEWED');
			expect(detectSourceType('https://arxiv.org/abs/2301.00001')).toBe('PEER_REVIEWED');
		});

		it('should detect known news sources as NEWS', () => {
			expect(detectSourceType('https://www.reuters.com/article')).toBe('NEWS');
			expect(detectSourceType('https://www.bbc.com/news/world')).toBe('NEWS');
			expect(detectSourceType('https://www.nytimes.com/2023/01/01/article')).toBe('NEWS');
		});

		it('should detect blog platforms as BLOG', () => {
			expect(detectSourceType('https://medium.com/post')).toBe('BLOG');
			expect(detectSourceType('https://substack.com/article')).toBe('BLOG');
			expect(detectSourceType('https://myblog.wordpress.com')).toBe('BLOG');
		});

		it('should detect generic .com as COMPANY', () => {
			expect(detectSourceType('https://www.somecompany.com/page')).toBe('COMPANY');
		});

		it('should return OTHER for invalid URLs', () => {
			expect(detectSourceType('not-a-url')).toBe('OTHER');
			expect(detectSourceType('')).toBe('OTHER');
		});
	});

	describe('getSourceTypeLabel', () => {
		it('should return correct labels for all types', () => {
			expect(getSourceTypeLabel('PEER_REVIEWED')).toBe('Peer-Reviewed');
			expect(getSourceTypeLabel('OFFICIAL')).toBe('Official Source');
			expect(getSourceTypeLabel('NEWS')).toBe('News Organization');
			expect(getSourceTypeLabel('COMPANY')).toBe('Company/Corporate');
			expect(getSourceTypeLabel('BLOG')).toBe('Blog/Personal');
			expect(getSourceTypeLabel('OTHER')).toBe('Other');
		});
	});

	describe('calculateTotalCredibility', () => {
		it('should calculate total credibility for multiple sources', () => {
			const sources = [{ type: 'PEER_REVIEWED' as const }, { type: 'OFFICIAL' as const }];
			expect(calculateTotalCredibility(sources)).toBe(9); // 5 + 4
		});

		it('should return 0 for empty sources', () => {
			expect(calculateTotalCredibility([])).toBe(0);
		});

		it('should sum all source types correctly', () => {
			const sources = [
				{ type: 'PEER_REVIEWED' as const },
				{ type: 'NEWS' as const },
				{ type: 'BLOG' as const }
			];
			expect(calculateTotalCredibility(sources)).toBe(9); // 5 + 3 + 1
		});
	});

	describe('getCredibilityRating', () => {
		it('should return Excellent for >= 15', () => {
			expect(getCredibilityRating(15)).toBe('Excellent');
			expect(getCredibilityRating(20)).toBe('Excellent');
		});

		it('should return Very Good for 10-14', () => {
			expect(getCredibilityRating(10)).toBe('Very Good');
			expect(getCredibilityRating(14)).toBe('Very Good');
		});

		it('should return Good for 5-9', () => {
			expect(getCredibilityRating(5)).toBe('Good');
			expect(getCredibilityRating(9)).toBe('Good');
		});

		it('should return Fair for 2-4', () => {
			expect(getCredibilityRating(2)).toBe('Fair');
			expect(getCredibilityRating(4)).toBe('Fair');
		});

		it('should return Low for < 2', () => {
			expect(getCredibilityRating(0)).toBe('Low');
			expect(getCredibilityRating(1)).toBe('Low');
		});
	});
});
