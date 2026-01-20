import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fact service
vi.mock('$lib/server/services/fact', () => ({
	addSourceToFact: vi.fn(),
	FactValidationError: class FactValidationError extends Error {
		code: string;
		constructor(code: string, message: string) {
			super(message);
			this.code = code;
		}
	}
}));

// Mock sourceCredibility
vi.mock('$lib/utils/sourceCredibility', () => ({
	detectSourceType: vi.fn()
}));

// Helper to create mock request
function createMockRequest(body: any): Request {
	return {
		json: vi.fn().mockResolvedValue(body)
	} as unknown as Request;
}

// Helper to create mock URL
function createMockUrl(params: Record<string, string>): URL {
	const url = new URL('http://localhost:3000/api/facts/fact-123/sources');
	Object.entries(params).forEach(([key, value]) => {
		url.searchParams.set(key, value);
	});
	return url;
}

describe('T13: Fact Sources API Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('POST /api/facts/:id/sources', () => {
		it('should add source to fact for authenticated user', async () => {
			const { addSourceToFact } = await import('$lib/server/services/fact');
			const { POST } = await import('../../src/routes/api/facts/[id]/sources/+server');

			vi.mocked(addSourceToFact).mockResolvedValue({
				id: 'source-123',
				url: 'https://example.com',
				title: 'Example Source',
				type: 'NEWS_OUTLET'
			} as any);

			const params = { id: 'fact-123' };
			const request = createMockRequest({
				url: 'https://example.com',
				title: 'Example Source'
			});
			const locals = {
				user: { id: 'user-123', emailVerified: true }
			};

			const response = await POST({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.url).toBe('https://example.com');
			expect(addSourceToFact).toHaveBeenCalledWith('fact-123', 'user-123', {
				url: 'https://example.com',
				title: 'Example Source',
				type: undefined
			});
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { POST } = await import('../../src/routes/api/facts/[id]/sources/+server');

			const params = { id: 'fact-123' };
			const request = createMockRequest({ url: 'https://example.com' });
			const locals = { user: null };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 for unverified email', async () => {
			const { POST } = await import('../../src/routes/api/facts/[id]/sources/+server');

			const params = { id: 'fact-123' };
			const request = createMockRequest({ url: 'https://example.com' });
			const locals = {
				user: { id: 'user-123', emailVerified: false }
			};

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});

		it('should throw 404 when fact not found', async () => {
			const { addSourceToFact, FactValidationError } = await import('$lib/server/services/fact');
			const { POST } = await import('../../src/routes/api/facts/[id]/sources/+server');

			vi.mocked(addSourceToFact).mockRejectedValue(
				new FactValidationError('FACT_NOT_FOUND', 'Fact not found')
			);

			const params = { id: 'nonexistent' };
			const request = createMockRequest({ url: 'https://example.com' });
			const locals = {
				user: { id: 'user-123', emailVerified: true }
			};

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});

		it('should handle validation errors', async () => {
			const { addSourceToFact, FactValidationError } = await import('$lib/server/services/fact');
			const { POST } = await import('../../src/routes/api/facts/[id]/sources/+server');

			vi.mocked(addSourceToFact).mockRejectedValue(
				new FactValidationError('DUPLICATE_SOURCE', 'Source already exists')
			);

			const params = { id: 'fact-123' };
			const request = createMockRequest({ url: 'https://example.com' });
			const locals = {
				user: { id: 'user-123', emailVerified: true }
			};

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 400
			});
		});
	});

	describe('GET /api/facts/:id/sources (detect)', () => {
		it('should detect source type from URL', async () => {
			const { detectSourceType } = await import('$lib/utils/sourceCredibility');
			const { GET } = await import('../../src/routes/api/facts/[id]/sources/+server');

			vi.mocked(detectSourceType).mockReturnValue('ACADEMIC_JOURNAL');

			const url = createMockUrl({ url: 'https://nature.com/article' });

			const response = await GET({ url } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.detectedType).toBe('ACADEMIC_JOURNAL');
			expect(detectSourceType).toHaveBeenCalledWith('https://nature.com/article');
		});

		it('should throw 400 when URL parameter is missing', async () => {
			const { GET } = await import('../../src/routes/api/facts/[id]/sources/+server');

			const url = createMockUrl({});

			await expect(GET({ url } as any)).rejects.toMatchObject({
				status: 400
			});
		});

		it('should return OTHER type on detection error', async () => {
			const { detectSourceType } = await import('$lib/utils/sourceCredibility');
			const { GET } = await import('../../src/routes/api/facts/[id]/sources/+server');

			vi.mocked(detectSourceType).mockImplementation(() => {
				throw new Error('Detection failed');
			});

			const url = createMockUrl({ url: 'https://unknown.xyz' });

			const response = await GET({ url } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.detectedType).toBe('OTHER');
		});
	});
});
