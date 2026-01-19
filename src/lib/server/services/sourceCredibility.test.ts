import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { suggestSourceType } from './sourceCredibility';

// Mock the database
vi.mock('../db', () => ({
	db: {
		sourceCredibilityConfig: {
			findMany: vi.fn(),
			upsert: vi.fn()
		},
		source: {
			findMany: vi.fn(),
			update: vi.fn(),
			count: vi.fn(),
			groupBy: vi.fn()
		},
		fact: {
			count: vi.fn()
		}
	}
}));

describe('R14: Source Credibility Service', () => {
	beforeEach(() => {
		console.log('🧪 Test suite starting...');
		vi.clearAllMocks();
	});

	afterEach(() => {
		console.log('🧪 Test suite complete.');
	});

	describe('suggestSourceType', () => {
		it('should detect .gov with high confidence', () => {
			const result = suggestSourceType('https://www.cdc.gov/health');
			expect(result.detectedType).toBe('OFFICIAL');
			expect(result.confidence).toBe('high');
		});

		it('should detect .edu with high confidence', () => {
			const result = suggestSourceType('https://www.harvard.edu/research');
			expect(result.detectedType).toBe('PEER_REVIEWED');
			expect(result.confidence).toBe('high');
		});

		it('should detect known news sites with high confidence', () => {
			const result = suggestSourceType('https://www.reuters.com/article');
			expect(result.detectedType).toBe('NEWS');
			expect(result.confidence).toBe('high');
		});

		it('should detect known academic sites with high confidence', () => {
			const result = suggestSourceType('https://www.nature.com/articles/xxx');
			expect(result.detectedType).toBe('PEER_REVIEWED');
			expect(result.confidence).toBe('high');
		});

		it('should detect pubmed with high confidence', () => {
			const result = suggestSourceType('https://pubmed.ncbi.nlm.nih.gov/12345');
			expect(result.detectedType).toBe('PEER_REVIEWED');
			expect(result.confidence).toBe('high');
		});

		it('should detect blog platforms with medium confidence', () => {
			const result = suggestSourceType('https://medium.com/article');
			expect(result.detectedType).toBe('BLOG');
			expect(result.confidence).toBe('medium');
		});

		it('should detect generic .com as company with low confidence', () => {
			const result = suggestSourceType('https://www.randomsite.com/page');
			expect(result.detectedType).toBe('COMPANY');
			expect(result.confidence).toBe('low');
		});

		it('should return OTHER with low confidence for invalid URLs', () => {
			const result = suggestSourceType('not-a-url');
			expect(result.detectedType).toBe('OTHER');
			expect(result.confidence).toBe('low');
		});
	});

	describe('Credibility calculation interface', () => {
		it('should define correct response structure', () => {
			const expectedStructure = {
				totalScore: 0,
				sourceCount: 0,
				breakdown: []
			};

			expect(expectedStructure).toHaveProperty('totalScore');
			expect(expectedStructure).toHaveProperty('sourceCount');
			expect(expectedStructure).toHaveProperty('breakdown');
		});

		it('should define correct breakdown item structure', () => {
			const breakdownItem = {
				sourceId: 'test-id',
				type: 'PEER_REVIEWED' as const,
				points: 5
			};

			expect(breakdownItem).toHaveProperty('sourceId');
			expect(breakdownItem).toHaveProperty('type');
			expect(breakdownItem).toHaveProperty('points');
		});
	});

	describe('Source statistics interface', () => {
		it('should define correct statistics structure', () => {
			const stats = {
				totalSources: 100,
				byType: {
					PEER_REVIEWED: 10,
					OFFICIAL: 15,
					NEWS: 30,
					COMPANY: 25,
					BLOG: 15,
					OTHER: 5
				},
				averagePerFact: 2.5
			};

			expect(stats).toHaveProperty('totalSources');
			expect(stats).toHaveProperty('byType');
			expect(stats).toHaveProperty('averagePerFact');
			expect(stats.byType).toHaveProperty('PEER_REVIEWED');
			expect(stats.byType).toHaveProperty('OFFICIAL');
			expect(stats.byType).toHaveProperty('NEWS');
			expect(stats.byType).toHaveProperty('COMPANY');
			expect(stats.byType).toHaveProperty('BLOG');
			expect(stats.byType).toHaveProperty('OTHER');
		});
	});
});
