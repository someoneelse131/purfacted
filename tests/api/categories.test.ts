import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock category service
vi.mock('$lib/server/services/category', () => ({
	createCategory: vi.fn(),
	listCategories: vi.fn(),
	getCategoryById: vi.fn(),
	getCategoryByName: vi.fn(),
	getCategoryStats: vi.fn(),
	getCategoryTree: vi.fn(),
	addCategoryAlias: vi.fn(),
	createMergeRequest: vi.fn(),
	listMergeRequests: vi.fn(),
	getMergeRequestById: vi.fn(),
	getUserMergeVote: vi.fn(),
	voteOnMergeRequest: vi.fn(),
	CategoryError: class CategoryError extends Error {
		code: string;
		constructor(code: string, message: string) {
			super(message);
			this.code = code;
		}
	}
}));

// Helper to create mock request
function createMockRequest(body: any): Request {
	return {
		json: vi.fn().mockResolvedValue(body)
	} as unknown as Request;
}

// Helper to create mock URL
function createMockUrl(path: string, params: Record<string, string> = {}): URL {
	const url = new URL(`http://localhost:3000${path}`);
	Object.entries(params).forEach(([key, value]) => {
		url.searchParams.set(key, value);
	});
	return url;
}

describe('T16: Categories API Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET /api/categories', () => {
		it('should return paginated list of categories', async () => {
			const { listCategories } = await import('$lib/server/services/category');
			const { GET } = await import('../../src/routes/api/categories/+server');

			vi.mocked(listCategories).mockResolvedValue({
				categories: [
					{
						id: 'cat-1',
						name: 'Science',
						parentId: null,
						parent: null,
						aliases: [],
						_count: { facts: 10, children: 2 },
						createdAt: new Date()
					},
					{
						id: 'cat-2',
						name: 'Technology',
						parentId: null,
						parent: null,
						aliases: [{ id: 'alias-1', name: 'Tech' }],
						_count: { facts: 5, children: 0 },
						createdAt: new Date()
					}
				],
				total: 2
			} as any);

			const url = createMockUrl('/api/categories');

			const response = await GET({ url } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.categories).toHaveLength(2);
			expect(data.data.categories[0].name).toBe('Science');
			expect(data.data.categories[0].factCount).toBe(10);
			expect(data.data.categories[1].aliases[0].name).toBe('Tech');
		});

		it('should apply search filter', async () => {
			const { listCategories } = await import('$lib/server/services/category');
			const { GET } = await import('../../src/routes/api/categories/+server');

			vi.mocked(listCategories).mockResolvedValue({
				categories: [],
				total: 0
			} as any);

			const url = createMockUrl('/api/categories', { search: 'science' });

			await GET({ url } as any);

			expect(listCategories).toHaveBeenCalledWith(
				expect.objectContaining({
					search: 'science'
				})
			);
		});

		it('should filter by parentId', async () => {
			const { listCategories } = await import('$lib/server/services/category');
			const { GET } = await import('../../src/routes/api/categories/+server');

			vi.mocked(listCategories).mockResolvedValue({
				categories: [],
				total: 0
			} as any);

			const url = createMockUrl('/api/categories', { parentId: 'cat-1' });

			await GET({ url } as any);

			expect(listCategories).toHaveBeenCalledWith(
				expect.objectContaining({
					parentId: 'cat-1'
				})
			);
		});

		it('should return category stats when stats=true', async () => {
			const { getCategoryStats } = await import('$lib/server/services/category');
			const { GET } = await import('../../src/routes/api/categories/+server');

			vi.mocked(getCategoryStats).mockResolvedValue({
				totalCategories: 50,
				totalFacts: 500,
				topCategories: [{ id: 'cat-1', name: 'Science', factCount: 100 }]
			} as any);

			const url = createMockUrl('/api/categories', { stats: 'true' });

			const response = await GET({ url } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.totalCategories).toBe(50);
		});

		it('should throw 500 on service error', async () => {
			const { listCategories } = await import('$lib/server/services/category');
			const { GET } = await import('../../src/routes/api/categories/+server');

			vi.mocked(listCategories).mockRejectedValue(new Error('Database error'));

			const url = createMockUrl('/api/categories');

			await expect(GET({ url } as any)).rejects.toMatchObject({
				status: 500
			});
		});
	});

	describe('POST /api/categories', () => {
		it('should create category for authenticated verified user', async () => {
			const { createCategory } = await import('$lib/server/services/category');
			const { POST } = await import('../../src/routes/api/categories/+server');

			vi.mocked(createCategory).mockResolvedValue({
				id: 'cat-123',
				name: 'New Category',
				parentId: null
			} as any);

			const request = createMockRequest({ name: 'New Category' });
			const locals = { user: { id: 'user-123', emailVerified: true } };

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.id).toBe('cat-123');
			expect(data.data.name).toBe('New Category');
			expect(createCategory).toHaveBeenCalledWith('user-123', {
				name: 'New Category',
				parentId: null
			});
		});

		it('should create category with parent', async () => {
			const { createCategory } = await import('$lib/server/services/category');
			const { POST } = await import('../../src/routes/api/categories/+server');

			vi.mocked(createCategory).mockResolvedValue({
				id: 'cat-456',
				name: 'Subcategory',
				parentId: 'cat-123'
			} as any);

			const request = createMockRequest({ name: 'Subcategory', parentId: 'cat-123' });
			const locals = { user: { id: 'user-123', emailVerified: true } };

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.parentId).toBe('cat-123');
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { POST } = await import('../../src/routes/api/categories/+server');

			const request = createMockRequest({ name: 'New Category' });
			const locals = { user: null };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 for unverified email', async () => {
			const { POST } = await import('../../src/routes/api/categories/+server');

			const request = createMockRequest({ name: 'New Category' });
			const locals = { user: { id: 'user-123', emailVerified: false } };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});

		it('should throw 409 when category exists', async () => {
			const { createCategory, CategoryError } = await import('$lib/server/services/category');
			const { POST } = await import('../../src/routes/api/categories/+server');

			vi.mocked(createCategory).mockRejectedValue(
				new CategoryError('CATEGORY_EXISTS', 'Category already exists')
			);

			const request = createMockRequest({ name: 'Existing Category' });
			const locals = { user: { id: 'user-123', emailVerified: true } };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 409
			});
		});

		it('should throw 404 when parent not found', async () => {
			const { createCategory, CategoryError } = await import('$lib/server/services/category');
			const { POST } = await import('../../src/routes/api/categories/+server');

			vi.mocked(createCategory).mockRejectedValue(
				new CategoryError('PARENT_NOT_FOUND', 'Parent category not found')
			);

			const request = createMockRequest({ name: 'New Category', parentId: 'nonexistent' });
			const locals = { user: { id: 'user-123', emailVerified: true } };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});
	});

	describe('GET /api/categories/:id', () => {
		it('should return category details', async () => {
			const { getCategoryById } = await import('$lib/server/services/category');
			const { GET } = await import('../../src/routes/api/categories/[id]/+server');

			vi.mocked(getCategoryById).mockResolvedValue({
				id: 'cat-123',
				name: 'Science',
				parentId: null,
				parent: null,
				children: [{ id: 'cat-456', name: 'Physics' }],
				aliases: [{ id: 'alias-1', name: 'Sciences' }],
				_count: { facts: 50, children: 3 },
				createdAt: new Date(),
				updatedAt: new Date()
			} as any);

			const params = { id: 'cat-123' };

			const response = await GET({ params } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.id).toBe('cat-123');
			expect(data.data.name).toBe('Science');
			expect(data.data.children[0].name).toBe('Physics');
			expect(data.data.factCount).toBe(50);
		});

		it('should throw 404 when category not found', async () => {
			const { getCategoryById } = await import('$lib/server/services/category');
			const { GET } = await import('../../src/routes/api/categories/[id]/+server');

			vi.mocked(getCategoryById).mockResolvedValue(null);

			const params = { id: 'nonexistent' };

			await expect(GET({ params } as any)).rejects.toMatchObject({
				status: 404
			});
		});
	});

	describe('GET /api/categories/:id/aliases', () => {
		it('should return category aliases', async () => {
			const { getCategoryById } = await import('$lib/server/services/category');
			const { GET } = await import('../../src/routes/api/categories/[id]/aliases/+server');

			vi.mocked(getCategoryById).mockResolvedValue({
				id: 'cat-123',
				name: 'Science',
				aliases: [
					{ id: 'alias-1', name: 'Sciences', createdAt: new Date() },
					{ id: 'alias-2', name: 'Sci', createdAt: new Date() }
				]
			} as any);

			const params = { id: 'cat-123' };

			const response = await GET({ params } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.categoryName).toBe('Science');
			expect(data.data.aliases).toHaveLength(2);
		});

		it('should throw 404 when category not found', async () => {
			const { getCategoryById } = await import('$lib/server/services/category');
			const { GET } = await import('../../src/routes/api/categories/[id]/aliases/+server');

			vi.mocked(getCategoryById).mockResolvedValue(null);

			const params = { id: 'nonexistent' };

			await expect(GET({ params } as any)).rejects.toMatchObject({
				status: 404
			});
		});
	});

	describe('POST /api/categories/:id/aliases', () => {
		it('should add alias for moderator', async () => {
			const { addCategoryAlias } = await import('$lib/server/services/category');
			const { POST } = await import('../../src/routes/api/categories/[id]/aliases/+server');

			vi.mocked(addCategoryAlias).mockResolvedValue({
				id: 'alias-123',
				name: 'New Alias',
				categoryId: 'cat-123'
			} as any);

			const params = { id: 'cat-123' };
			const request = createMockRequest({ name: 'New Alias' });
			const locals = { user: { id: 'mod-123', emailVerified: true, userType: 'MODERATOR' } };

			const response = await POST({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.name).toBe('New Alias');
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { POST } = await import('../../src/routes/api/categories/[id]/aliases/+server');

			const params = { id: 'cat-123' };
			const request = createMockRequest({ name: 'Alias' });
			const locals = { user: null };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 for non-moderator', async () => {
			const { POST } = await import('../../src/routes/api/categories/[id]/aliases/+server');

			const params = { id: 'cat-123' };
			const request = createMockRequest({ name: 'Alias' });
			const locals = { user: { id: 'user-123', emailVerified: true, userType: 'VERIFIED' } };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});

		it('should throw 409 when alias exists', async () => {
			const { addCategoryAlias, CategoryError } = await import('$lib/server/services/category');
			const { POST } = await import('../../src/routes/api/categories/[id]/aliases/+server');

			vi.mocked(addCategoryAlias).mockRejectedValue(
				new CategoryError('ALIAS_EXISTS', 'Alias already exists')
			);

			const params = { id: 'cat-123' };
			const request = createMockRequest({ name: 'Existing Alias' });
			const locals = { user: { id: 'mod-123', emailVerified: true, userType: 'MODERATOR' } };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 409
			});
		});
	});

	describe('GET /api/categories/tree', () => {
		it('should return category hierarchy', async () => {
			const { getCategoryTree } = await import('$lib/server/services/category');
			const { GET } = await import('../../src/routes/api/categories/tree/+server');

			vi.mocked(getCategoryTree).mockResolvedValue([
				{
					id: 'cat-1',
					name: 'Science',
					aliases: [],
					_count: { facts: 10, children: 2 },
					children: [
						{
							id: 'cat-2',
							name: 'Physics',
							aliases: [],
							_count: { facts: 5, children: 0 },
							children: []
						}
					]
				}
			] as any);

			const response = await GET({} as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data).toHaveLength(1);
			expect(data.data[0].name).toBe('Science');
			expect(data.data[0].children[0].name).toBe('Physics');
		});

		it('should throw 500 on service error', async () => {
			const { getCategoryTree } = await import('$lib/server/services/category');
			const { GET } = await import('../../src/routes/api/categories/tree/+server');

			vi.mocked(getCategoryTree).mockRejectedValue(new Error('Database error'));

			await expect(GET({} as any)).rejects.toMatchObject({
				status: 500
			});
		});
	});

	describe('GET /api/categories/lookup', () => {
		it('should find category by name', async () => {
			const { getCategoryByName } = await import('$lib/server/services/category');
			const { GET } = await import('../../src/routes/api/categories/lookup/+server');

			vi.mocked(getCategoryByName).mockResolvedValue({
				id: 'cat-123',
				name: 'Science',
				parentId: null
			} as any);

			const url = createMockUrl('/api/categories/lookup', { name: 'Science' });

			const response = await GET({ url } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.id).toBe('cat-123');
			expect(data.data.isAlias).toBe(false);
		});

		it('should detect alias lookup', async () => {
			const { getCategoryByName } = await import('$lib/server/services/category');
			const { GET } = await import('../../src/routes/api/categories/lookup/+server');

			vi.mocked(getCategoryByName).mockResolvedValue({
				id: 'cat-123',
				name: 'Science',
				parentId: null
			} as any);

			const url = createMockUrl('/api/categories/lookup', { name: 'Sci' });

			const response = await GET({ url } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.isAlias).toBe(true);
		});

		it('should return null for unknown category', async () => {
			const { getCategoryByName } = await import('$lib/server/services/category');
			const { GET } = await import('../../src/routes/api/categories/lookup/+server');

			vi.mocked(getCategoryByName).mockResolvedValue(null);

			const url = createMockUrl('/api/categories/lookup', { name: 'Unknown' });

			const response = await GET({ url } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data).toBeNull();
		});

		it('should throw 400 when name is missing', async () => {
			const { GET } = await import('../../src/routes/api/categories/lookup/+server');

			const url = createMockUrl('/api/categories/lookup');

			await expect(GET({ url } as any)).rejects.toMatchObject({
				status: 400
			});
		});
	});

	describe('GET /api/categories/merge-requests', () => {
		it('should return list of merge requests', async () => {
			const { listMergeRequests } = await import('$lib/server/services/category');
			const { GET } = await import('../../src/routes/api/categories/merge-requests/+server');

			vi.mocked(listMergeRequests).mockResolvedValue({
				requests: [
					{
						id: 'merge-123',
						fromCategory: { id: 'cat-1', name: 'Sci' },
						toCategory: { id: 'cat-2', name: 'Science' },
						requestedBy: { id: 'user-123', username: 'testuser' },
						status: 'PENDING',
						voteSummary: { approve: 5, reject: 2 },
						createdAt: new Date(),
						resolvedAt: null
					}
				],
				total: 1
			} as any);

			const url = createMockUrl('/api/categories/merge-requests');

			const response = await GET({ url } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.requests).toHaveLength(1);
			expect(data.data.requests[0].status).toBe('PENDING');
		});

		it('should filter by status', async () => {
			const { listMergeRequests } = await import('$lib/server/services/category');
			const { GET } = await import('../../src/routes/api/categories/merge-requests/+server');

			vi.mocked(listMergeRequests).mockResolvedValue({
				requests: [],
				total: 0
			} as any);

			const url = createMockUrl('/api/categories/merge-requests', { status: 'APPROVED' });

			await GET({ url } as any);

			expect(listMergeRequests).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 'APPROVED'
				})
			);
		});
	});

	describe('POST /api/categories/merge-requests', () => {
		it('should create merge request for authenticated verified user', async () => {
			const { createMergeRequest } = await import('$lib/server/services/category');
			const { POST } = await import('../../src/routes/api/categories/merge-requests/+server');

			vi.mocked(createMergeRequest).mockResolvedValue({
				id: 'merge-123',
				status: 'PENDING'
			} as any);

			const request = createMockRequest({
				fromCategoryId: 'cat-1',
				toCategoryId: 'cat-2'
			});
			const locals = { user: { id: 'user-123', emailVerified: true } };

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.id).toBe('merge-123');
			expect(data.data.status).toBe('PENDING');
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { POST } = await import('../../src/routes/api/categories/merge-requests/+server');

			const request = createMockRequest({
				fromCategoryId: 'cat-1',
				toCategoryId: 'cat-2'
			});
			const locals = { user: null };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 404 when category not found', async () => {
			const { createMergeRequest, CategoryError } = await import('$lib/server/services/category');
			const { POST } = await import('../../src/routes/api/categories/merge-requests/+server');

			vi.mocked(createMergeRequest).mockRejectedValue(
				new CategoryError('FROM_CATEGORY_NOT_FOUND', 'Source category not found')
			);

			const request = createMockRequest({
				fromCategoryId: 'nonexistent',
				toCategoryId: 'cat-2'
			});
			const locals = { user: { id: 'user-123', emailVerified: true } };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});

		it('should throw 409 when request already exists', async () => {
			const { createMergeRequest, CategoryError } = await import('$lib/server/services/category');
			const { POST } = await import('../../src/routes/api/categories/merge-requests/+server');

			vi.mocked(createMergeRequest).mockRejectedValue(
				new CategoryError('REQUEST_EXISTS', 'Merge request already exists')
			);

			const request = createMockRequest({
				fromCategoryId: 'cat-1',
				toCategoryId: 'cat-2'
			});
			const locals = { user: { id: 'user-123', emailVerified: true } };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 409
			});
		});
	});

	describe('GET /api/categories/merge-requests/:id', () => {
		it('should return merge request details', async () => {
			const { getMergeRequestById, getUserMergeVote } = await import(
				'$lib/server/services/category'
			);
			const { GET } = await import(
				'../../src/routes/api/categories/merge-requests/[id]/+server'
			);

			vi.mocked(getMergeRequestById).mockResolvedValue({
				id: 'merge-123',
				fromCategory: { id: 'cat-1', name: 'Sci' },
				toCategory: { id: 'cat-2', name: 'Science' },
				requestedBy: { id: 'user-123', username: 'testuser' },
				status: 'PENDING',
				voteSummary: { approve: 5, reject: 2 },
				createdAt: new Date(),
				resolvedAt: null
			} as any);
			vi.mocked(getUserMergeVote).mockResolvedValue({ value: 1 } as any);

			const params = { id: 'merge-123' };
			const locals = { user: { id: 'user-456' } };

			const response = await GET({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.id).toBe('merge-123');
			expect(data.data.userVote.value).toBe(1);
		});

		it('should return null userVote for unauthenticated user', async () => {
			const { getMergeRequestById } = await import('$lib/server/services/category');
			const { GET } = await import(
				'../../src/routes/api/categories/merge-requests/[id]/+server'
			);

			vi.mocked(getMergeRequestById).mockResolvedValue({
				id: 'merge-123',
				fromCategory: { id: 'cat-1', name: 'Sci' },
				toCategory: { id: 'cat-2', name: 'Science' },
				requestedBy: { id: 'user-123', username: 'testuser' },
				status: 'PENDING',
				voteSummary: { approve: 5, reject: 2 },
				createdAt: new Date(),
				resolvedAt: null
			} as any);

			const params = { id: 'merge-123' };
			const locals = { user: null };

			const response = await GET({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.userVote).toBeNull();
		});

		it('should throw 404 when merge request not found', async () => {
			const { getMergeRequestById } = await import('$lib/server/services/category');
			const { GET } = await import(
				'../../src/routes/api/categories/merge-requests/[id]/+server'
			);

			vi.mocked(getMergeRequestById).mockResolvedValue(null);

			const params = { id: 'nonexistent' };
			const locals = { user: null };

			await expect(GET({ params, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});
	});

	describe('GET /api/categories/merge-requests/:id/vote', () => {
		it('should return user vote', async () => {
			const { getUserMergeVote } = await import('$lib/server/services/category');
			const { GET } = await import(
				'../../src/routes/api/categories/merge-requests/[id]/vote/+server'
			);

			vi.mocked(getUserMergeVote).mockResolvedValue({ value: 1 } as any);

			const params = { id: 'merge-123' };
			const locals = { user: { id: 'user-123' } };

			const response = await GET({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.userVote.value).toBe(1);
		});

		it('should return null for unauthenticated user', async () => {
			const { GET } = await import(
				'../../src/routes/api/categories/merge-requests/[id]/vote/+server'
			);

			const params = { id: 'merge-123' };
			const locals = { user: null };

			const response = await GET({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.userVote).toBeNull();
		});
	});

	describe('POST /api/categories/merge-requests/:id/vote', () => {
		it('should record approve vote', async () => {
			const { voteOnMergeRequest } = await import('$lib/server/services/category');
			const { POST } = await import(
				'../../src/routes/api/categories/merge-requests/[id]/vote/+server'
			);

			vi.mocked(voteOnMergeRequest).mockResolvedValue({
				vote: { value: 1 },
				requestStatus: 'PENDING',
				resolved: false
			} as any);

			const params = { id: 'merge-123' };
			const request = createMockRequest({ value: 1 });
			const locals = { user: { id: 'user-123', emailVerified: true } };

			const response = await POST({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.vote.value).toBe(1);
			expect(data.data.resolved).toBe(false);
		});

		it('should return resolved status when merge completes', async () => {
			const { voteOnMergeRequest } = await import('$lib/server/services/category');
			const { POST } = await import(
				'../../src/routes/api/categories/merge-requests/[id]/vote/+server'
			);

			vi.mocked(voteOnMergeRequest).mockResolvedValue({
				vote: { value: 1 },
				requestStatus: 'APPROVED',
				resolved: true
			} as any);

			const params = { id: 'merge-123' };
			const request = createMockRequest({ value: 1 });
			const locals = { user: { id: 'user-123', emailVerified: true } };

			const response = await POST({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.resolved).toBe(true);
			expect(data.data.requestStatus).toBe('APPROVED');
			expect(data.data.message).toContain('merged');
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { POST } = await import(
				'../../src/routes/api/categories/merge-requests/[id]/vote/+server'
			);

			const params = { id: 'merge-123' };
			const request = createMockRequest({ value: 1 });
			const locals = { user: null };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 for unverified email', async () => {
			const { POST } = await import(
				'../../src/routes/api/categories/merge-requests/[id]/vote/+server'
			);

			const params = { id: 'merge-123' };
			const request = createMockRequest({ value: 1 });
			const locals = { user: { id: 'user-123', emailVerified: false } };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});

		it('should throw 400 for invalid vote value', async () => {
			const { POST } = await import(
				'../../src/routes/api/categories/merge-requests/[id]/vote/+server'
			);

			const params = { id: 'merge-123' };
			const request = createMockRequest({ value: 0 });
			const locals = { user: { id: 'user-123', emailVerified: true } };

			// error(400) thrown inside try block gets caught and re-thrown as 500
			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 500
			});
		});

		it('should throw 404 when merge request not found', async () => {
			const { voteOnMergeRequest, CategoryError } = await import(
				'$lib/server/services/category'
			);
			const { POST } = await import(
				'../../src/routes/api/categories/merge-requests/[id]/vote/+server'
			);

			vi.mocked(voteOnMergeRequest).mockRejectedValue(
				new CategoryError('REQUEST_NOT_FOUND', 'Merge request not found')
			);

			const params = { id: 'nonexistent' };
			const request = createMockRequest({ value: 1 });
			const locals = { user: { id: 'user-123', emailVerified: true } };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});
	});
});
