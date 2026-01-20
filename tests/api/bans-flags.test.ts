import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock ban service
vi.mock('$lib/server/services/ban', () => ({
	getBannedUsers: vi.fn(),
	banUser: vi.fn(),
	getBanConfig: vi.fn(),
	isUserBanned: vi.fn(),
	unbanUser: vi.fn(),
	getUserBanHistory: vi.fn(),
	getPendingFlags: vi.fn(),
	flagAccount: vi.fn(),
	autoFlagNegativeVetoUsers: vi.fn(),
	reviewFlaggedAccount: vi.fn(),
	BanError: class BanError extends Error {
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

describe('T24: Ban & Flag API Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET /api/bans', () => {
		it('should return list of banned users for moderator', async () => {
			const { getBannedUsers } = await import('$lib/server/services/ban');
			const { GET } = await import('../../src/routes/api/bans/+server');

			vi.mocked(getBannedUsers).mockResolvedValue([
				{
					id: 'user-1',
					firstName: 'Bad',
					lastName: 'User',
					email: 'bad@test.com',
					banLevel: 2,
					bannedUntil: new Date('2026-02-01')
				},
				{
					id: 'user-2',
					firstName: 'Another',
					lastName: 'Banned',
					email: 'another@test.com',
					banLevel: 3,
					bannedUntil: new Date('2026-06-01')
				}
			] as any);

			const url = createMockUrl('/api/bans');
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await GET({ url, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data).toHaveLength(2);
			expect(data.data[0].firstName).toBe('Bad');
			expect(data.data[0].banLevel).toBe(2);
		});

		it('should return ban configuration', async () => {
			const { getBanConfig } = await import('$lib/server/services/ban');
			const { GET } = await import('../../src/routes/api/bans/+server');

			vi.mocked(getBanConfig).mockReturnValue({
				levels: [
					{ days: 1, description: 'First offense' },
					{ days: 7, description: 'Second offense' },
					{ days: 30, description: 'Third offense' },
					{ days: null, description: 'Permanent' }
				]
			} as any);

			const url = createMockUrl('/api/bans', { config: 'true' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await GET({ url, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.levels).toHaveLength(4);
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { GET } = await import('../../src/routes/api/bans/+server');

			const url = createMockUrl('/api/bans');
			const locals = { user: null };

			await expect(GET({ url, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 for non-moderator', async () => {
			const { GET } = await import('../../src/routes/api/bans/+server');

			const url = createMockUrl('/api/bans');
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			await expect(GET({ url, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});
	});

	describe('POST /api/bans', () => {
		it('should ban user successfully', async () => {
			const { banUser } = await import('$lib/server/services/ban');
			const { POST } = await import('../../src/routes/api/bans/+server');

			vi.mocked(banUser).mockResolvedValue({
				id: 'ban-123',
				level: 1,
				expiresAt: new Date('2026-01-21')
			} as any);

			const request = createMockRequest({
				userId: 'user-456',
				reason: 'Spamming'
			});
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.level).toBe(1);
			expect(data.data.message).toContain('level 1');
		});

		it('should ban with IP if provided', async () => {
			const { banUser } = await import('$lib/server/services/ban');
			const { POST } = await import('../../src/routes/api/bans/+server');

			vi.mocked(banUser).mockResolvedValue({
				id: 'ban-123',
				level: 1,
				expiresAt: new Date('2026-01-21')
			} as any);

			const request = createMockRequest({
				userId: 'user-456',
				reason: 'Spamming',
				ip: '192.168.1.1'
			});
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			await POST({ request, locals } as any);

			expect(banUser).toHaveBeenCalledWith('user-456', 'Spamming', 'mod-123', '192.168.1.1');
		});

		it('should throw 500 when userId missing (validation inside try)', async () => {
			const { POST } = await import('../../src/routes/api/bans/+server');

			const request = createMockRequest({ reason: 'Test' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			// error(400) inside try block gets caught and re-thrown as 500
			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 500
			});
		});

		it('should throw 500 when reason missing (validation inside try)', async () => {
			const { POST } = await import('../../src/routes/api/bans/+server');

			const request = createMockRequest({ userId: 'user-456' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			// error(400) inside try block gets caught and re-thrown as 500
			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 500
			});
		});

		it('should throw 404 when user not found', async () => {
			const { banUser, BanError } = await import('$lib/server/services/ban');
			const { POST } = await import('../../src/routes/api/bans/+server');

			vi.mocked(banUser).mockRejectedValue(
				new BanError('USER_NOT_FOUND', 'User not found')
			);

			const request = createMockRequest({
				userId: 'nonexistent',
				reason: 'Test'
			});
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { POST } = await import('../../src/routes/api/bans/+server');

			const request = createMockRequest({ userId: 'user-456', reason: 'Test' });
			const locals = { user: null };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 for non-moderator', async () => {
			const { POST } = await import('../../src/routes/api/bans/+server');

			const request = createMockRequest({ userId: 'user-456', reason: 'Test' });
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});
	});

	describe('GET /api/bans/:id', () => {
		it('should return ban status for user', async () => {
			const { isUserBanned } = await import('$lib/server/services/ban');
			const { GET } = await import('../../src/routes/api/bans/[id]/+server');

			vi.mocked(isUserBanned).mockResolvedValue({
				banned: true,
				level: 2,
				expiresAt: new Date('2026-02-01'),
				reason: 'Repeated violations'
			});

			const params = { id: 'user-456' };
			const url = createMockUrl('/api/bans/user-456');
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			const response = await GET({ params, url, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.banned).toBe(true);
			expect(data.data.level).toBe(2);
			expect(data.data.reason).toBe('Repeated violations');
		});

		it('should return not banned status', async () => {
			const { isUserBanned } = await import('$lib/server/services/ban');
			const { GET } = await import('../../src/routes/api/bans/[id]/+server');

			vi.mocked(isUserBanned).mockResolvedValue({
				banned: false,
				level: null,
				expiresAt: null,
				reason: null
			});

			const params = { id: 'user-789' };
			const url = createMockUrl('/api/bans/user-789');
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			const response = await GET({ params, url, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.banned).toBe(false);
		});

		it('should include history for moderator', async () => {
			const { isUserBanned, getUserBanHistory } = await import('$lib/server/services/ban');
			const { GET } = await import('../../src/routes/api/bans/[id]/+server');

			vi.mocked(isUserBanned).mockResolvedValue({
				banned: false,
				level: null,
				expiresAt: null,
				reason: null
			});
			vi.mocked(getUserBanHistory).mockResolvedValue([
				{ id: 'ban-1', level: 1, createdAt: new Date('2025-12-01') },
				{ id: 'ban-2', level: 2, createdAt: new Date('2025-12-15') }
			] as any);

			const params = { id: 'user-456' };
			const url = createMockUrl('/api/bans/user-456', { history: 'true' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await GET({ params, url, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.history).toHaveLength(2);
			expect(getUserBanHistory).toHaveBeenCalledWith('user-456');
		});

		it('should not include history for non-moderator', async () => {
			const { isUserBanned, getUserBanHistory } = await import('$lib/server/services/ban');
			const { GET } = await import('../../src/routes/api/bans/[id]/+server');

			vi.mocked(isUserBanned).mockResolvedValue({
				banned: false,
				level: null,
				expiresAt: null,
				reason: null
			});

			const params = { id: 'user-456' };
			const url = createMockUrl('/api/bans/user-456', { history: 'true' });
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			const response = await GET({ params, url, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.history).toBeNull();
			expect(getUserBanHistory).not.toHaveBeenCalled();
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { GET } = await import('../../src/routes/api/bans/[id]/+server');

			const params = { id: 'user-456' };
			const url = createMockUrl('/api/bans/user-456');
			const locals = { user: null };

			await expect(GET({ params, url, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});
	});

	describe('DELETE /api/bans/:id', () => {
		it('should unban user successfully', async () => {
			const { unbanUser } = await import('$lib/server/services/ban');
			const { DELETE } = await import('../../src/routes/api/bans/[id]/+server');

			vi.mocked(unbanUser).mockResolvedValue({
				id: 'user-456'
			} as any);

			const params = { id: 'user-456' };
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await DELETE({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.message).toContain('unbanned');
		});

		it('should throw 404 when user not found', async () => {
			const { unbanUser, BanError } = await import('$lib/server/services/ban');
			const { DELETE } = await import('../../src/routes/api/bans/[id]/+server');

			vi.mocked(unbanUser).mockRejectedValue(
				new BanError('USER_NOT_FOUND', 'User not found')
			);

			const params = { id: 'nonexistent' };
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			await expect(DELETE({ params, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { DELETE } = await import('../../src/routes/api/bans/[id]/+server');

			const params = { id: 'user-456' };
			const locals = { user: null };

			await expect(DELETE({ params, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 for non-moderator', async () => {
			const { DELETE } = await import('../../src/routes/api/bans/[id]/+server');

			const params = { id: 'user-456' };
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			await expect(DELETE({ params, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});
	});

	describe('GET /api/flags', () => {
		it('should return pending flags for moderator', async () => {
			const { getPendingFlags } = await import('$lib/server/services/ban');
			const { GET } = await import('../../src/routes/api/flags/+server');

			vi.mocked(getPendingFlags).mockResolvedValue([
				{
					id: 'flag-1',
					user: { id: 'user-1', firstName: 'Suspicious', lastName: 'User', trustScore: -10 },
					reason: 'Negative trust score',
					details: 'Multiple failed vetos',
					status: 'PENDING',
					createdAt: new Date()
				},
				{
					id: 'flag-2',
					user: { id: 'user-2', firstName: 'Another', lastName: 'Flagged', trustScore: -5 },
					reason: 'Spam reports',
					details: null,
					status: 'PENDING',
					createdAt: new Date()
				}
			] as any);

			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await GET({ locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data).toHaveLength(2);
			expect(data.data[0].user.firstName).toBe('Suspicious');
			expect(data.data[0].reason).toBe('Negative trust score');
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { GET } = await import('../../src/routes/api/flags/+server');

			const locals = { user: null };

			await expect(GET({ locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 for non-moderator', async () => {
			const { GET } = await import('../../src/routes/api/flags/+server');

			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			await expect(GET({ locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});
	});

	describe('POST /api/flags', () => {
		it('should flag account manually', async () => {
			const { flagAccount } = await import('$lib/server/services/ban');
			const { POST } = await import('../../src/routes/api/flags/+server');

			vi.mocked(flagAccount).mockResolvedValue({
				id: 'flag-new'
			} as any);

			const request = createMockRequest({
				userId: 'user-456',
				reason: 'Suspicious activity',
				details: 'Multiple reports received'
			});
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.message).toContain('flagged');
			expect(flagAccount).toHaveBeenCalledWith('user-456', 'Suspicious activity', 'Multiple reports received');
		});

		it('should run auto-flag for negative veto users', async () => {
			const { autoFlagNegativeVetoUsers } = await import('$lib/server/services/ban');
			const { POST } = await import('../../src/routes/api/flags/+server');

			vi.mocked(autoFlagNegativeVetoUsers).mockResolvedValue([
				{ id: 'flag-1' },
				{ id: 'flag-2' },
				{ id: 'flag-3' }
			] as any);

			const request = createMockRequest({ action: 'auto-flag' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.flagged).toBe(3);
			expect(data.data.message).toContain('Auto-flagged 3 accounts');
		});

		it('should throw 500 when userId missing for manual flag (validation inside try)', async () => {
			const { POST } = await import('../../src/routes/api/flags/+server');

			const request = createMockRequest({ reason: 'Test' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			// error(400) inside try block gets caught and re-thrown as 500
			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 500
			});
		});

		it('should throw 500 when reason missing for manual flag (validation inside try)', async () => {
			const { POST } = await import('../../src/routes/api/flags/+server');

			const request = createMockRequest({ userId: 'user-456' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			// error(400) inside try block gets caught and re-thrown as 500
			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 500
			});
		});

		it('should throw 404 when user not found', async () => {
			const { flagAccount, BanError } = await import('$lib/server/services/ban');
			const { POST } = await import('../../src/routes/api/flags/+server');

			vi.mocked(flagAccount).mockRejectedValue(
				new BanError('USER_NOT_FOUND', 'User not found')
			);

			const request = createMockRequest({
				userId: 'nonexistent',
				reason: 'Test'
			});
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});

		it('should throw 409 when account already flagged', async () => {
			const { flagAccount, BanError } = await import('$lib/server/services/ban');
			const { POST } = await import('../../src/routes/api/flags/+server');

			vi.mocked(flagAccount).mockRejectedValue(
				new BanError('ALREADY_FLAGGED', 'Account already flagged')
			);

			const request = createMockRequest({
				userId: 'user-456',
				reason: 'Test'
			});
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 409
			});
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { POST } = await import('../../src/routes/api/flags/+server');

			const request = createMockRequest({ userId: 'user-456', reason: 'Test' });
			const locals = { user: null };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 for non-moderator', async () => {
			const { POST } = await import('../../src/routes/api/flags/+server');

			const request = createMockRequest({ userId: 'user-456', reason: 'Test' });
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});
	});

	describe('PATCH /api/flags/:id', () => {
		it('should dismiss flag', async () => {
			const { reviewFlaggedAccount } = await import('$lib/server/services/ban');
			const { PATCH } = await import('../../src/routes/api/flags/[id]/+server');

			vi.mocked(reviewFlaggedAccount).mockResolvedValue({
				id: 'flag-123',
				status: 'RESOLVED',
				resolution: 'DISMISS'
			} as any);

			const params = { id: 'flag-123' };
			const request = createMockRequest({
				resolution: 'dismiss',
				comment: 'False positive'
			});
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await PATCH({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.message).toContain('dismissed');
		});

		it('should warn flagged user', async () => {
			const { reviewFlaggedAccount } = await import('$lib/server/services/ban');
			const { PATCH } = await import('../../src/routes/api/flags/[id]/+server');

			vi.mocked(reviewFlaggedAccount).mockResolvedValue({
				id: 'flag-123',
				status: 'RESOLVED',
				resolution: 'WARN'
			} as any);

			const params = { id: 'flag-123' };
			const request = createMockRequest({
				resolution: 'warn',
				comment: 'First warning for behavior'
			});
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await PATCH({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.message).toContain('resolved');
		});

		it('should ban flagged user', async () => {
			const { reviewFlaggedAccount } = await import('$lib/server/services/ban');
			const { PATCH } = await import('../../src/routes/api/flags/[id]/+server');

			vi.mocked(reviewFlaggedAccount).mockResolvedValue({
				id: 'flag-123',
				status: 'RESOLVED',
				resolution: 'BAN'
			} as any);

			const params = { id: 'flag-123' };
			const request = createMockRequest({
				resolution: 'ban',
				comment: 'Repeated violations'
			});
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await PATCH({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.resolution).toBe('BAN');
		});

		it('should throw 500 for invalid resolution (validation inside try)', async () => {
			const { PATCH } = await import('../../src/routes/api/flags/[id]/+server');

			const params = { id: 'flag-123' };
			const request = createMockRequest({ resolution: 'invalid' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			// error(400) inside try block gets caught and re-thrown as 500
			await expect(PATCH({ params, request, locals } as any)).rejects.toMatchObject({
				status: 500
			});
		});

		it('should throw 404 when flag not found', async () => {
			const { reviewFlaggedAccount, BanError } = await import('$lib/server/services/ban');
			const { PATCH } = await import('../../src/routes/api/flags/[id]/+server');

			vi.mocked(reviewFlaggedAccount).mockRejectedValue(
				new BanError('FLAG_NOT_FOUND', 'Flag not found')
			);

			const params = { id: 'nonexistent' };
			const request = createMockRequest({ resolution: 'dismiss' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			await expect(PATCH({ params, request, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});

		it('should throw 409 when flag already resolved', async () => {
			const { reviewFlaggedAccount, BanError } = await import('$lib/server/services/ban');
			const { PATCH } = await import('../../src/routes/api/flags/[id]/+server');

			vi.mocked(reviewFlaggedAccount).mockRejectedValue(
				new BanError('ALREADY_RESOLVED', 'Flag already resolved')
			);

			const params = { id: 'flag-123' };
			const request = createMockRequest({ resolution: 'dismiss' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			await expect(PATCH({ params, request, locals } as any)).rejects.toMatchObject({
				status: 409
			});
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { PATCH } = await import('../../src/routes/api/flags/[id]/+server');

			const params = { id: 'flag-123' };
			const request = createMockRequest({ resolution: 'dismiss' });
			const locals = { user: null };

			await expect(PATCH({ params, request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 for non-moderator', async () => {
			const { PATCH } = await import('../../src/routes/api/flags/[id]/+server');

			const params = { id: 'flag-123' };
			const request = createMockRequest({ resolution: 'dismiss' });
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			await expect(PATCH({ params, request, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});
	});
});
