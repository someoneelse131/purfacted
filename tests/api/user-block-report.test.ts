import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock userBlock service
vi.mock('$lib/server/services/userBlock', () => ({
	blockUser: vi.fn(),
	unblockUser: vi.fn(),
	isUserBlocked: vi.fn(),
	getBlockedUsers: vi.fn(),
	UserBlockError: class UserBlockError extends Error {
		code: string;
		constructor(code: string, message: string) {
			super(message);
			this.code = code;
		}
	}
}));

// Mock report service
vi.mock('$lib/server/services/report', () => ({
	createReport: vi.fn(),
	getReports: vi.fn(),
	getUserReports: vi.fn(),
	getReportById: vi.fn(),
	assignReport: vi.fn(),
	resolveReport: vi.fn(),
	REPORT_REASONS: ['SPAM', 'HARASSMENT', 'MISINFORMATION', 'OTHER'],
	ReportError: class ReportError extends Error {
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

describe('T20: User Block & Report API Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('User Block API', () => {
		describe('GET /api/users/:id/block', () => {
			it('should return block status', async () => {
				const { isUserBlocked } = await import('$lib/server/services/userBlock');
				const { GET } = await import('../../src/routes/api/users/[id]/block/+server');

				vi.mocked(isUserBlocked).mockResolvedValue(true);

				const params = { id: 'user-456' };
				const locals = { user: { id: 'user-123' } };

				const response = await GET({ params, locals } as any);
				const data = await response.json();

				expect(data.success).toBe(true);
				expect(data.data.isBlocked).toBe(true);
				expect(isUserBlocked).toHaveBeenCalledWith('user-123', 'user-456');
			});

			it('should return false when not blocked', async () => {
				const { isUserBlocked } = await import('$lib/server/services/userBlock');
				const { GET } = await import('../../src/routes/api/users/[id]/block/+server');

				vi.mocked(isUserBlocked).mockResolvedValue(false);

				const params = { id: 'user-456' };
				const locals = { user: { id: 'user-123' } };

				const response = await GET({ params, locals } as any);
				const data = await response.json();

				expect(data.success).toBe(true);
				expect(data.data.isBlocked).toBe(false);
			});

			it('should throw 401 for unauthenticated user', async () => {
				const { GET } = await import('../../src/routes/api/users/[id]/block/+server');

				const params = { id: 'user-456' };
				const locals = { user: null };

				await expect(GET({ params, locals } as any)).rejects.toMatchObject({
					status: 401
				});
			});
		});

		describe('POST /api/users/:id/block', () => {
			it('should block user', async () => {
				const { blockUser } = await import('$lib/server/services/userBlock');
				const { POST } = await import('../../src/routes/api/users/[id]/block/+server');

				vi.mocked(blockUser).mockResolvedValue(undefined);

				const params = { id: 'user-456' };
				const locals = { user: { id: 'user-123' } };

				const response = await POST({ params, locals } as any);
				const data = await response.json();

				expect(data.success).toBe(true);
				expect(data.data.message).toContain('blocked');
				expect(blockUser).toHaveBeenCalledWith('user-123', 'user-456');
			});

			it('should throw 401 for unauthenticated user', async () => {
				const { POST } = await import('../../src/routes/api/users/[id]/block/+server');

				const params = { id: 'user-456' };
				const locals = { user: null };

				await expect(POST({ params, locals } as any)).rejects.toMatchObject({
					status: 401
				});
			});

			it('should throw 404 when user not found', async () => {
				const { blockUser, UserBlockError } = await import('$lib/server/services/userBlock');
				const { POST } = await import('../../src/routes/api/users/[id]/block/+server');

				vi.mocked(blockUser).mockRejectedValue(
					new UserBlockError('USER_NOT_FOUND', 'User not found')
				);

				const params = { id: 'nonexistent' };
				const locals = { user: { id: 'user-123' } };

				await expect(POST({ params, locals } as any)).rejects.toMatchObject({
					status: 404
				});
			});

			it('should throw 409 when already blocked', async () => {
				const { blockUser, UserBlockError } = await import('$lib/server/services/userBlock');
				const { POST } = await import('../../src/routes/api/users/[id]/block/+server');

				vi.mocked(blockUser).mockRejectedValue(
					new UserBlockError('ALREADY_BLOCKED', 'User is already blocked')
				);

				const params = { id: 'user-456' };
				const locals = { user: { id: 'user-123' } };

				await expect(POST({ params, locals } as any)).rejects.toMatchObject({
					status: 409
				});
			});
		});

		describe('DELETE /api/users/:id/block', () => {
			it('should unblock user', async () => {
				const { unblockUser } = await import('$lib/server/services/userBlock');
				const { DELETE } = await import('../../src/routes/api/users/[id]/block/+server');

				vi.mocked(unblockUser).mockResolvedValue(undefined);

				const params = { id: 'user-456' };
				const locals = { user: { id: 'user-123' } };

				const response = await DELETE({ params, locals } as any);
				const data = await response.json();

				expect(data.success).toBe(true);
				expect(data.data.message).toContain('unblocked');
				expect(unblockUser).toHaveBeenCalledWith('user-123', 'user-456');
			});

			it('should throw 401 for unauthenticated user', async () => {
				const { DELETE } = await import('../../src/routes/api/users/[id]/block/+server');

				const params = { id: 'user-456' };
				const locals = { user: null };

				await expect(DELETE({ params, locals } as any)).rejects.toMatchObject({
					status: 401
				});
			});

			it('should throw 404 when not blocked', async () => {
				const { unblockUser, UserBlockError } = await import('$lib/server/services/userBlock');
				const { DELETE } = await import('../../src/routes/api/users/[id]/block/+server');

				vi.mocked(unblockUser).mockRejectedValue(
					new UserBlockError('NOT_BLOCKED', 'User is not blocked')
				);

				const params = { id: 'user-456' };
				const locals = { user: { id: 'user-123' } };

				await expect(DELETE({ params, locals } as any)).rejects.toMatchObject({
					status: 404
				});
			});
		});

		describe('GET /api/user/blocked', () => {
			it('should return blocked users list', async () => {
				const { getBlockedUsers } = await import('$lib/server/services/userBlock');
				const { GET } = await import('../../src/routes/api/user/blocked/+server');

				vi.mocked(getBlockedUsers).mockResolvedValue([
					{
						id: 'user-456',
						firstName: 'Bob',
						lastName: 'Smith',
						blockedAt: new Date()
					},
					{
						id: 'user-789',
						firstName: 'Charlie',
						lastName: 'Brown',
						blockedAt: new Date()
					}
				] as any);

				const locals = { user: { id: 'user-123' } };

				const response = await GET({ locals } as any);
				const data = await response.json();

				expect(data.success).toBe(true);
				expect(data.data.blockedUsers).toHaveLength(2);
				expect(data.data.count).toBe(2);
			});

			it('should throw 401 for unauthenticated user', async () => {
				const { GET } = await import('../../src/routes/api/user/blocked/+server');

				const locals = { user: null };

				await expect(GET({ locals } as any)).rejects.toMatchObject({
					status: 401
				});
			});
		});
	});

	describe('Report API', () => {
		describe('GET /api/reports', () => {
			it('should return user reports for non-moderator', async () => {
				const { getUserReports } = await import('$lib/server/services/report');
				const { GET } = await import('../../src/routes/api/reports/+server');

				vi.mocked(getUserReports).mockResolvedValue([
					{
						id: 'report-1',
						contentType: 'FACT',
						contentId: 'fact-123',
						reason: 'MISINFORMATION',
						status: 'PENDING',
						resolution: null,
						createdAt: new Date(),
						resolvedAt: null
					}
				] as any);

				const url = createMockUrl('/api/reports');
				const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

				const response = await GET({ url, locals } as any);
				const data = await response.json();

				expect(data.success).toBe(true);
				expect(data.data.reports).toHaveLength(1);
				expect(getUserReports).toHaveBeenCalledWith('user-123');
			});

			it('should return all reports for moderator', async () => {
				const { getReports } = await import('$lib/server/services/report');
				const { GET } = await import('../../src/routes/api/reports/+server');

				vi.mocked(getReports).mockResolvedValue({
					reports: [
						{
							id: 'report-1',
							reporter: { id: 'user-1', username: 'alice' },
							contentType: 'FACT',
							contentId: 'fact-123',
							reason: 'SPAM',
							details: 'This is spam',
							status: 'PENDING',
							reviewedBy: null,
							resolution: null,
							createdAt: new Date(),
							resolvedAt: null
						}
					],
					total: 1
				} as any);

				const url = createMockUrl('/api/reports');
				const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

				const response = await GET({ url, locals } as any);
				const data = await response.json();

				expect(data.success).toBe(true);
				expect(data.data.reports).toHaveLength(1);
				expect(data.data.reports[0].reporter).toBeDefined();
			});

			it('should filter reports by status for moderator', async () => {
				const { getReports } = await import('$lib/server/services/report');
				const { GET } = await import('../../src/routes/api/reports/+server');

				vi.mocked(getReports).mockResolvedValue({
					reports: [],
					total: 0
				} as any);

				const url = createMockUrl('/api/reports', { status: 'PENDING' });
				const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

				await GET({ url, locals } as any);

				expect(getReports).toHaveBeenCalledWith(
					expect.objectContaining({
						status: 'PENDING'
					})
				);
			});

			it('should throw 401 for unauthenticated user', async () => {
				const { GET } = await import('../../src/routes/api/reports/+server');

				const url = createMockUrl('/api/reports');
				const locals = { user: null };

				await expect(GET({ url, locals } as any)).rejects.toMatchObject({
					status: 401
				});
			});
		});

		describe('POST /api/reports', () => {
			it('should create report for authenticated verified user', async () => {
				const { createReport } = await import('$lib/server/services/report');
				const { POST } = await import('../../src/routes/api/reports/+server');

				vi.mocked(createReport).mockResolvedValue({
					id: 'report-123',
					status: 'PENDING'
				} as any);

				const request = createMockRequest({
					contentType: 'FACT',
					contentId: 'fact-123',
					reason: 'MISINFORMATION',
					details: 'This fact is false'
				});
				const locals = { user: { id: 'user-123', emailVerified: true } };

				const response = await POST({ request, locals } as any);
				const data = await response.json();

				expect(data.success).toBe(true);
				expect(data.data.id).toBe('report-123');
				expect(data.data.message).toContain('submitted');
			});

			it('should throw 401 for unauthenticated user', async () => {
				const { POST } = await import('../../src/routes/api/reports/+server');

				const request = createMockRequest({
					contentType: 'FACT',
					contentId: 'fact-123',
					reason: 'SPAM'
				});
				const locals = { user: null };

				await expect(POST({ request, locals } as any)).rejects.toMatchObject({
					status: 401
				});
			});

			it('should throw 403 for unverified email', async () => {
				const { POST } = await import('../../src/routes/api/reports/+server');

				const request = createMockRequest({
					contentType: 'FACT',
					contentId: 'fact-123',
					reason: 'SPAM'
				});
				const locals = { user: { id: 'user-123', emailVerified: false } };

				await expect(POST({ request, locals } as any)).rejects.toMatchObject({
					status: 403
				});
			});

			it('should throw 404 when content not found', async () => {
				const { createReport, ReportError } = await import('$lib/server/services/report');
				const { POST } = await import('../../src/routes/api/reports/+server');

				vi.mocked(createReport).mockRejectedValue(
					new ReportError('CONTENT_NOT_FOUND', 'Content not found')
				);

				const request = createMockRequest({
					contentType: 'FACT',
					contentId: 'nonexistent',
					reason: 'SPAM'
				});
				const locals = { user: { id: 'user-123', emailVerified: true } };

				await expect(POST({ request, locals } as any)).rejects.toMatchObject({
					status: 404
				});
			});

			it('should throw 409 when already reported', async () => {
				const { createReport, ReportError } = await import('$lib/server/services/report');
				const { POST } = await import('../../src/routes/api/reports/+server');

				vi.mocked(createReport).mockRejectedValue(
					new ReportError('ALREADY_REPORTED', 'You have already reported this content')
				);

				const request = createMockRequest({
					contentType: 'FACT',
					contentId: 'fact-123',
					reason: 'SPAM'
				});
				const locals = { user: { id: 'user-123', emailVerified: true } };

				await expect(POST({ request, locals } as any)).rejects.toMatchObject({
					status: 409
				});
			});
		});

		describe('GET /api/reports/:id', () => {
			it('should return report details for moderator', async () => {
				const { getReportById } = await import('$lib/server/services/report');
				const { GET } = await import('../../src/routes/api/reports/[id]/+server');

				vi.mocked(getReportById).mockResolvedValue({
					id: 'report-123',
					reporter: { id: 'user-1', username: 'alice' },
					contentType: 'FACT',
					contentId: 'fact-123',
					reason: 'SPAM',
					details: 'This is spam',
					status: 'PENDING',
					reviewedBy: null,
					resolution: null,
					createdAt: new Date(),
					resolvedAt: null
				} as any);

				const params = { id: 'report-123' };
				const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

				const response = await GET({ params, locals } as any);
				const data = await response.json();

				expect(data.success).toBe(true);
				expect(data.data.id).toBe('report-123');
				expect(data.data.details).toBe('This is spam');
			});

			it('should throw 401 for unauthenticated user', async () => {
				const { GET } = await import('../../src/routes/api/reports/[id]/+server');

				const params = { id: 'report-123' };
				const locals = { user: null };

				await expect(GET({ params, locals } as any)).rejects.toMatchObject({
					status: 401
				});
			});

			it('should throw 403 for non-moderator', async () => {
				const { GET } = await import('../../src/routes/api/reports/[id]/+server');

				const params = { id: 'report-123' };
				const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

				await expect(GET({ params, locals } as any)).rejects.toMatchObject({
					status: 403
				});
			});

			it('should throw 404 when report not found', async () => {
				const { getReportById } = await import('$lib/server/services/report');
				const { GET } = await import('../../src/routes/api/reports/[id]/+server');

				vi.mocked(getReportById).mockResolvedValue(null);

				const params = { id: 'nonexistent' };
				const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

				await expect(GET({ params, locals } as any)).rejects.toMatchObject({
					status: 404
				});
			});
		});

		describe('PATCH /api/reports/:id', () => {
			it('should assign report to moderator', async () => {
				const { assignReport } = await import('$lib/server/services/report');
				const { PATCH } = await import('../../src/routes/api/reports/[id]/+server');

				vi.mocked(assignReport).mockResolvedValue({
					id: 'report-123',
					status: 'IN_REVIEW'
				} as any);

				const params = { id: 'report-123' };
				const request = createMockRequest({ action: 'assign' });
				const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

				const response = await PATCH({ params, request, locals } as any);
				const data = await response.json();

				expect(data.success).toBe(true);
				expect(data.data.message).toContain('assigned');
			});

			it('should resolve report', async () => {
				const { resolveReport } = await import('$lib/server/services/report');
				const { PATCH } = await import('../../src/routes/api/reports/[id]/+server');

				vi.mocked(resolveReport).mockResolvedValue({
					id: 'report-123',
					status: 'RESOLVED'
				} as any);

				const params = { id: 'report-123' };
				const request = createMockRequest({
					action: 'resolve',
					resolution: 'Content was removed'
				});
				const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

				const response = await PATCH({ params, request, locals } as any);
				const data = await response.json();

				expect(data.success).toBe(true);
				expect(data.data.message).toContain('resolved');
			});

			it('should dismiss report', async () => {
				const { resolveReport } = await import('$lib/server/services/report');
				const { PATCH } = await import('../../src/routes/api/reports/[id]/+server');

				vi.mocked(resolveReport).mockResolvedValue({
					id: 'report-123',
					status: 'DISMISSED'
				} as any);

				const params = { id: 'report-123' };
				const request = createMockRequest({
					action: 'dismiss',
					resolution: 'No violation found'
				});
				const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

				const response = await PATCH({ params, request, locals } as any);
				const data = await response.json();

				expect(data.success).toBe(true);
				expect(data.data.message).toContain('dismissed');
			});

			it('should throw 401 for unauthenticated user', async () => {
				const { PATCH } = await import('../../src/routes/api/reports/[id]/+server');

				const params = { id: 'report-123' };
				const request = createMockRequest({ action: 'assign' });
				const locals = { user: null };

				await expect(PATCH({ params, request, locals } as any)).rejects.toMatchObject({
					status: 401
				});
			});

			it('should throw 403 for non-moderator', async () => {
				const { PATCH } = await import('../../src/routes/api/reports/[id]/+server');

				const params = { id: 'report-123' };
				const request = createMockRequest({ action: 'assign' });
				const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

				await expect(PATCH({ params, request, locals } as any)).rejects.toMatchObject({
					status: 403
				});
			});

			it('should throw 404 when report not found', async () => {
				const { assignReport, ReportError } = await import('$lib/server/services/report');
				const { PATCH } = await import('../../src/routes/api/reports/[id]/+server');

				vi.mocked(assignReport).mockRejectedValue(
					new ReportError('REPORT_NOT_FOUND', 'Report not found')
				);

				const params = { id: 'nonexistent' };
				const request = createMockRequest({ action: 'assign' });
				const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

				await expect(PATCH({ params, request, locals } as any)).rejects.toMatchObject({
					status: 404
				});
			});
		});
	});
});
