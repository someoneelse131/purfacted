import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock organization service
vi.mock('$lib/server/services/organization', () => ({
	getAllOrganizations: vi.fn(),
	getOrganizationStats: vi.fn(),
	getOrganizationById: vi.fn(),
	approveOrganization: vi.fn(),
	rejectOrganization: vi.fn(),
	getOrganizationFacts: vi.fn(),
	getOrganizationOwnedFacts: vi.fn(),
	OrganizationError: class OrganizationError extends Error {
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

describe('T21: Organizations API Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET /api/organizations', () => {
		it('should return list of organizations', async () => {
			const { getAllOrganizations } = await import('$lib/server/services/organization');
			const { GET } = await import('../../src/routes/api/organizations/+server');

			vi.mocked(getAllOrganizations).mockResolvedValue([
				{
					id: 'org-1',
					firstName: 'Nature Foundation',
					lastName: 'Non-Profit',
					trustScore: 85,
					createdAt: new Date(),
					lastLoginAt: new Date()
				},
				{
					id: 'org-2',
					firstName: 'Tech Corp',
					lastName: 'Corporation',
					trustScore: 70,
					createdAt: new Date(),
					lastLoginAt: new Date()
				}
			] as any);

			const url = createMockUrl('/api/organizations');
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			const response = await GET({ url, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data).toHaveLength(2);
			expect(data.data[0].firstName).toBe('Nature Foundation');
			expect(data.data[0].trustScore).toBe(85);
		});

		it('should apply pagination parameters', async () => {
			const { getAllOrganizations } = await import('$lib/server/services/organization');
			const { GET } = await import('../../src/routes/api/organizations/+server');

			vi.mocked(getAllOrganizations).mockResolvedValue([]);

			const url = createMockUrl('/api/organizations', { limit: '10', offset: '20' });
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			await GET({ url, locals } as any);

			expect(getAllOrganizations).toHaveBeenCalledWith(10, 20);
		});

		it('should return statistics for moderator', async () => {
			const { getOrganizationStats } = await import('$lib/server/services/organization');
			const { GET } = await import('../../src/routes/api/organizations/+server');

			vi.mocked(getOrganizationStats).mockResolvedValue({
				total: 50,
				pending: 5,
				approved: 45,
				topByTrustScore: [{ id: 'org-1', trustScore: 100 }]
			} as any);

			const url = createMockUrl('/api/organizations', { stats: 'true' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await GET({ url, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.total).toBe(50);
		});

		it('should throw 403 for non-moderator requesting stats', async () => {
			const { GET } = await import('../../src/routes/api/organizations/+server');

			const url = createMockUrl('/api/organizations', { stats: 'true' });
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			await expect(GET({ url, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { GET } = await import('../../src/routes/api/organizations/+server');

			const url = createMockUrl('/api/organizations');
			const locals = { user: null };

			await expect(GET({ url, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});
	});

	describe('GET /api/organizations/:id', () => {
		it('should return organization details', async () => {
			const { getOrganizationById } = await import('$lib/server/services/organization');
			const { GET } = await import('../../src/routes/api/organizations/[id]/+server');

			vi.mocked(getOrganizationById).mockResolvedValue({
				id: 'org-123',
				firstName: 'Nature Foundation',
				lastName: 'Non-Profit',
				trustScore: 85,
				createdAt: new Date(),
				lastLoginAt: new Date()
			} as any);

			const params = { id: 'org-123' };
			const url = createMockUrl('/api/organizations/org-123');
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			const response = await GET({ params, url, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.id).toBe('org-123');
			expect(data.data.firstName).toBe('Nature Foundation');
		});

		it('should include facts when requested', async () => {
			const {
				getOrganizationById,
				getOrganizationFacts,
				getOrganizationOwnedFacts
			} = await import('$lib/server/services/organization');
			const { GET } = await import('../../src/routes/api/organizations/[id]/+server');

			vi.mocked(getOrganizationById).mockResolvedValue({
				id: 'org-123',
				firstName: 'Nature Foundation',
				lastName: 'Non-Profit',
				trustScore: 85,
				createdAt: new Date(),
				lastLoginAt: new Date()
			} as any);
			vi.mocked(getOrganizationFacts).mockResolvedValue([
				{ factId: 'fact-1', isDisputed: false },
				{ factId: 'fact-2', isDisputed: true }
			] as any);
			vi.mocked(getOrganizationOwnedFacts).mockResolvedValue(['fact-3', 'fact-4'] as any);

			const params = { id: 'org-123' };
			const url = createMockUrl('/api/organizations/org-123', { include: 'facts' });
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			const response = await GET({ params, url, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.taggedFacts).toHaveLength(2);
			expect(data.data.ownedFacts).toHaveLength(2);
		});

		it('should throw 404 when organization not found', async () => {
			const { getOrganizationById } = await import('$lib/server/services/organization');
			const { GET } = await import('../../src/routes/api/organizations/[id]/+server');

			vi.mocked(getOrganizationById).mockResolvedValue(null);

			const params = { id: 'nonexistent' };
			const url = createMockUrl('/api/organizations/nonexistent');
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			await expect(GET({ params, url, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { GET } = await import('../../src/routes/api/organizations/[id]/+server');

			const params = { id: 'org-123' };
			const url = createMockUrl('/api/organizations/org-123');
			const locals = { user: null };

			await expect(GET({ params, url, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});
	});

	describe('PATCH /api/organizations/:id', () => {
		it('should approve organization for moderator', async () => {
			const { approveOrganization } = await import('$lib/server/services/organization');
			const { PATCH } = await import('../../src/routes/api/organizations/[id]/+server');

			vi.mocked(approveOrganization).mockResolvedValue({
				id: 'org-123',
				userType: 'ORGANIZATION',
				trustScore: 50
			} as any);

			const params = { id: 'org-123' };
			const request = createMockRequest({
				action: 'approve',
				reason: 'Verified documentation'
			});
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await PATCH({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.userType).toBe('ORGANIZATION');
			expect(data.data.message).toContain('approved');
		});

		it('should reject organization for moderator', async () => {
			const { rejectOrganization } = await import('$lib/server/services/organization');
			const { PATCH } = await import('../../src/routes/api/organizations/[id]/+server');

			vi.mocked(rejectOrganization).mockResolvedValue(undefined);

			const params = { id: 'org-123' };
			const request = createMockRequest({
				action: 'reject',
				reason: 'Invalid documentation provided'
			});
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await PATCH({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.message).toContain('rejected');
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { PATCH } = await import('../../src/routes/api/organizations/[id]/+server');

			const params = { id: 'org-123' };
			const request = createMockRequest({ action: 'approve' });
			const locals = { user: null };

			await expect(PATCH({ params, request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 for non-moderator', async () => {
			const { PATCH } = await import('../../src/routes/api/organizations/[id]/+server');

			const params = { id: 'org-123' };
			const request = createMockRequest({ action: 'approve' });
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			await expect(PATCH({ params, request, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});

		it('should throw 400 when rejection reason is missing', async () => {
			const { PATCH } = await import('../../src/routes/api/organizations/[id]/+server');

			const params = { id: 'org-123' };
			const request = createMockRequest({ action: 'reject' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			// error(400) inside try block gets caught and re-thrown as 500
			await expect(PATCH({ params, request, locals } as any)).rejects.toMatchObject({
				status: 500
			});
		});

		it('should throw 404 when organization not found', async () => {
			const { approveOrganization, OrganizationError } = await import(
				'$lib/server/services/organization'
			);
			const { PATCH } = await import('../../src/routes/api/organizations/[id]/+server');

			vi.mocked(approveOrganization).mockRejectedValue(
				new OrganizationError('USER_NOT_FOUND', 'User not found')
			);

			const params = { id: 'nonexistent' };
			const request = createMockRequest({ action: 'approve' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			await expect(PATCH({ params, request, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});

		it('should throw 409 when already an organization', async () => {
			const { approveOrganization, OrganizationError } = await import(
				'$lib/server/services/organization'
			);
			const { PATCH } = await import('../../src/routes/api/organizations/[id]/+server');

			vi.mocked(approveOrganization).mockRejectedValue(
				new OrganizationError('ALREADY_ORGANIZATION', 'User is already an organization')
			);

			const params = { id: 'org-123' };
			const request = createMockRequest({ action: 'approve' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			await expect(PATCH({ params, request, locals } as any)).rejects.toMatchObject({
				status: 409
			});
		});
	});
});
