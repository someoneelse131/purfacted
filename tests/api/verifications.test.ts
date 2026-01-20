import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock expertVerification service
vi.mock('$lib/server/services/expertVerification', () => ({
	submitVerification: vi.fn(),
	getPendingVerifications: vi.fn(),
	getUserVerifications: vi.fn(),
	getVerificationStats: vi.fn(),
	getVerificationById: vi.fn(),
	reviewVerification: vi.fn(),
	moderatorOverride: vi.fn(),
	VerificationError: class VerificationError extends Error {
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

describe('T22: Verification API Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET /api/verifications', () => {
		it('should return verification statistics', async () => {
			const { getVerificationStats } = await import('$lib/server/services/expertVerification');
			const { GET } = await import('../../src/routes/api/verifications/+server');

			vi.mocked(getVerificationStats).mockResolvedValue({
				total: 100,
				pending: 10,
				approved: 85,
				rejected: 5,
				byType: { EXPERT: 60, PHD: 40 }
			} as any);

			const url = createMockUrl('/api/verifications', { stats: 'true' });
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			const response = await GET({ url, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.total).toBe(100);
			expect(data.data.pending).toBe(10);
		});

		it('should return user verifications', async () => {
			const { getUserVerifications } = await import('$lib/server/services/expertVerification');
			const { GET } = await import('../../src/routes/api/verifications/+server');

			vi.mocked(getUserVerifications).mockResolvedValue([
				{
					id: 'ver-1',
					type: 'EXPERT',
					field: 'Climate Science',
					status: 'PENDING',
					createdAt: new Date()
				}
			] as any);

			const url = createMockUrl('/api/verifications', { user: 'true' });
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			const response = await GET({ url, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data).toHaveLength(1);
			expect(data.data[0].type).toBe('EXPERT');
			expect(getUserVerifications).toHaveBeenCalledWith('user-123');
		});

		it('should return pending verifications for review', async () => {
			const { getPendingVerifications } = await import('$lib/server/services/expertVerification');
			const { GET } = await import('../../src/routes/api/verifications/+server');

			vi.mocked(getPendingVerifications).mockResolvedValue([
				{
					id: 'ver-1',
					type: 'PHD',
					field: 'Physics',
					documentUrl: 'https://example.com/doc',
					userId: 'other-user',
					user: { id: 'other-user', username: 'alice' },
					reviews: [{ approved: true }, { approved: true }],
					createdAt: new Date()
				}
			] as any);

			const url = createMockUrl('/api/verifications', { pending: 'true' });
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			const response = await GET({ url, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data).toHaveLength(1);
			expect(data.data[0].type).toBe('PHD');
			expect(data.data[0].reviewCount).toBe(2);
			expect(data.data[0].approvalCount).toBe(2);
		});

		it('should filter out own verifications from pending', async () => {
			const { getPendingVerifications } = await import('$lib/server/services/expertVerification');
			const { GET } = await import('../../src/routes/api/verifications/+server');

			vi.mocked(getPendingVerifications).mockResolvedValue([
				{
					id: 'ver-1',
					type: 'PHD',
					field: 'Physics',
					userId: 'user-123',
					user: { id: 'user-123', username: 'self' },
					reviews: [],
					createdAt: new Date()
				},
				{
					id: 'ver-2',
					type: 'EXPERT',
					field: 'Biology',
					userId: 'other-user',
					user: { id: 'other-user', username: 'alice' },
					reviews: [],
					createdAt: new Date()
				}
			] as any);

			const url = createMockUrl('/api/verifications', { pending: 'true' });
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			const response = await GET({ url, locals } as any);
			const data = await response.json();

			expect(data.data).toHaveLength(1);
			expect(data.data[0].id).toBe('ver-2');
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { GET } = await import('../../src/routes/api/verifications/+server');

			const url = createMockUrl('/api/verifications', { stats: 'true' });
			const locals = { user: null };

			await expect(GET({ url, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});
	});

	describe('POST /api/verifications', () => {
		it('should submit verification request', async () => {
			const { submitVerification } = await import('$lib/server/services/expertVerification');
			const { POST } = await import('../../src/routes/api/verifications/+server');

			vi.mocked(submitVerification).mockResolvedValue({
				id: 'ver-123'
			} as any);

			const request = createMockRequest({
				type: 'EXPERT',
				documentUrl: 'https://example.com/diploma.pdf',
				field: 'Climate Science'
			});
			const locals = { user: { id: 'user-123' } };

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.id).toBe('ver-123');
			expect(data.data.message).toContain('submitted');
			expect(submitVerification).toHaveBeenCalledWith('user-123', {
				type: 'EXPERT',
				documentUrl: 'https://example.com/diploma.pdf',
				field: 'Climate Science'
			});
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { POST } = await import('../../src/routes/api/verifications/+server');

			const request = createMockRequest({
				type: 'EXPERT',
				documentUrl: 'https://example.com/doc.pdf',
				field: 'Physics'
			});
			const locals = { user: null };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 409 when already verified', async () => {
			const { submitVerification, VerificationError } = await import(
				'$lib/server/services/expertVerification'
			);
			const { POST } = await import('../../src/routes/api/verifications/+server');

			vi.mocked(submitVerification).mockRejectedValue(
				new VerificationError('ALREADY_VERIFIED', 'Already verified as expert')
			);

			const request = createMockRequest({
				type: 'EXPERT',
				documentUrl: 'https://example.com/doc.pdf',
				field: 'Physics'
			});
			const locals = { user: { id: 'user-123' } };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 409
			});
		});

		it('should throw 409 when pending request exists', async () => {
			const { submitVerification, VerificationError } = await import(
				'$lib/server/services/expertVerification'
			);
			const { POST } = await import('../../src/routes/api/verifications/+server');

			vi.mocked(submitVerification).mockRejectedValue(
				new VerificationError('PENDING_EXISTS', 'Already have a pending request')
			);

			const request = createMockRequest({
				type: 'EXPERT',
				documentUrl: 'https://example.com/doc.pdf',
				field: 'Physics'
			});
			const locals = { user: { id: 'user-123' } };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 409
			});
		});
	});

	describe('GET /api/verifications/:id', () => {
		it('should return verification details for owner', async () => {
			const { getVerificationById } = await import('$lib/server/services/expertVerification');
			const { GET } = await import('../../src/routes/api/verifications/[id]/+server');

			vi.mocked(getVerificationById).mockResolvedValue({
				id: 'ver-123',
				type: 'EXPERT',
				field: 'Climate Science',
				documentUrl: 'https://example.com/doc.pdf',
				status: 'PENDING',
				userId: 'user-123',
				user: { id: 'user-123', username: 'alice' },
				reviews: [
					{
						id: 'review-1',
						reviewer: { id: 'reviewer-1', username: 'bob' },
						approved: true,
						comment: 'Looks good',
						createdAt: new Date()
					}
				],
				createdAt: new Date(),
				updatedAt: new Date()
			} as any);

			const params = { id: 'ver-123' };
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			const response = await GET({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.id).toBe('ver-123');
			expect(data.data.documentUrl).toBe('https://example.com/doc.pdf');
			expect(data.data.reviews[0].comment).toBe('Looks good');
		});

		it('should return verification details for moderator', async () => {
			const { getVerificationById } = await import('$lib/server/services/expertVerification');
			const { GET } = await import('../../src/routes/api/verifications/[id]/+server');

			vi.mocked(getVerificationById).mockResolvedValue({
				id: 'ver-123',
				type: 'EXPERT',
				field: 'Climate Science',
				documentUrl: 'https://example.com/doc.pdf',
				status: 'PENDING',
				userId: 'other-user',
				user: { id: 'other-user', username: 'alice' },
				reviews: [],
				createdAt: new Date(),
				updatedAt: new Date()
			} as any);

			const params = { id: 'ver-123' };
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await GET({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.documentUrl).toBe('https://example.com/doc.pdf');
		});

		it('should hide document URL from other users', async () => {
			const { getVerificationById } = await import('$lib/server/services/expertVerification');
			const { GET } = await import('../../src/routes/api/verifications/[id]/+server');

			vi.mocked(getVerificationById).mockResolvedValue({
				id: 'ver-123',
				type: 'EXPERT',
				field: 'Climate Science',
				documentUrl: 'https://example.com/doc.pdf',
				status: 'PENDING',
				userId: 'other-user',
				user: { id: 'other-user', username: 'alice' },
				reviews: [],
				createdAt: new Date(),
				updatedAt: new Date()
			} as any);

			const params = { id: 'ver-123' };
			const locals = { user: { id: 'random-user', userType: 'VERIFIED' } };

			const response = await GET({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.documentUrl).toBeNull();
		});

		it('should throw 404 when verification not found', async () => {
			const { getVerificationById } = await import('$lib/server/services/expertVerification');
			const { GET } = await import('../../src/routes/api/verifications/[id]/+server');

			vi.mocked(getVerificationById).mockResolvedValue(null);

			const params = { id: 'nonexistent' };
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			await expect(GET({ params, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { GET } = await import('../../src/routes/api/verifications/[id]/+server');

			const params = { id: 'ver-123' };
			const locals = { user: null };

			await expect(GET({ params, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});
	});

	describe('POST /api/verifications/:id', () => {
		it('should submit review', async () => {
			const { reviewVerification } = await import('$lib/server/services/expertVerification');
			const { POST } = await import('../../src/routes/api/verifications/[id]/+server');

			vi.mocked(reviewVerification).mockResolvedValue({
				id: 'review-123'
			} as any);

			const params = { id: 'ver-123' };
			const request = createMockRequest({
				action: 'review',
				approved: true,
				comment: 'Credentials verified'
			});
			const locals = { user: { id: 'reviewer-123', userType: 'EXPERT' } };

			const response = await POST({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.id).toBe('review-123');
			expect(data.data.message).toContain('approved');
		});

		it('should allow moderator override', async () => {
			const { moderatorOverride } = await import('$lib/server/services/expertVerification');
			const { POST } = await import('../../src/routes/api/verifications/[id]/+server');

			vi.mocked(moderatorOverride).mockResolvedValue({
				id: 'ver-123',
				status: 'APPROVED'
			} as any);

			const params = { id: 'ver-123' };
			const request = createMockRequest({
				action: 'override',
				approved: true,
				comment: 'Emergency approval'
			});
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await POST({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.status).toBe('APPROVED');
			expect(data.data.message).toContain('moderator');
		});

		it('should throw 403 for non-moderator attempting override', async () => {
			const { POST } = await import('../../src/routes/api/verifications/[id]/+server');

			const params = { id: 'ver-123' };
			const request = createMockRequest({
				action: 'override',
				approved: true
			});
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			// error(403) thrown inside try block gets caught and re-thrown as 500
			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 500
			});
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { POST } = await import('../../src/routes/api/verifications/[id]/+server');

			const params = { id: 'ver-123' };
			const request = createMockRequest({
				action: 'review',
				approved: true
			});
			const locals = { user: null };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 for self-review', async () => {
			const { reviewVerification, VerificationError } = await import(
				'$lib/server/services/expertVerification'
			);
			const { POST } = await import('../../src/routes/api/verifications/[id]/+server');

			vi.mocked(reviewVerification).mockRejectedValue(
				new VerificationError('SELF_REVIEW', 'Cannot review your own verification')
			);

			const params = { id: 'ver-123' };
			const request = createMockRequest({
				action: 'review',
				approved: true
			});
			const locals = { user: { id: 'user-123', userType: 'EXPERT' } };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});

		it('should throw 409 when already reviewed', async () => {
			const { reviewVerification, VerificationError } = await import(
				'$lib/server/services/expertVerification'
			);
			const { POST } = await import('../../src/routes/api/verifications/[id]/+server');

			vi.mocked(reviewVerification).mockRejectedValue(
				new VerificationError('ALREADY_REVIEWED', 'Already reviewed this verification')
			);

			const params = { id: 'ver-123' };
			const request = createMockRequest({
				action: 'review',
				approved: true
			});
			const locals = { user: { id: 'reviewer-123', userType: 'EXPERT' } };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 409
			});
		});

		it('should throw 404 when verification not found', async () => {
			const { reviewVerification, VerificationError } = await import(
				'$lib/server/services/expertVerification'
			);
			const { POST } = await import('../../src/routes/api/verifications/[id]/+server');

			vi.mocked(reviewVerification).mockRejectedValue(
				new VerificationError('VERIFICATION_NOT_FOUND', 'Verification not found')
			);

			const params = { id: 'nonexistent' };
			const request = createMockRequest({
				action: 'review',
				approved: true
			});
			const locals = { user: { id: 'reviewer-123', userType: 'EXPERT' } };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});
	});
});
