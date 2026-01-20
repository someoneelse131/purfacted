import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock moderator service
vi.mock('$lib/server/services/moderator', () => ({
	getAllModerators: vi.fn(),
	getModeratorStats: vi.fn(),
	getEligibleCandidates: vi.fn(),
	getInactiveModerators: vi.fn(),
	runAutoElection: vi.fn(),
	handleInactiveModerators: vi.fn(),
	getModeratorConfig: vi.fn(),
	appointModerator: vi.fn(),
	demoteModerator: vi.fn(),
	handleReturningModerator: vi.fn(),
	isEligibleForModerator: vi.fn(),
	ModeratorError: class ModeratorError extends Error {
		code: string;
		constructor(code: string, message: string) {
			super(message);
			this.code = code;
		}
	}
}));

// Mock moderation service
vi.mock('$lib/server/services/moderation', () => ({
	getQueueItems: vi.fn(),
	getQueueStats: vi.fn(),
	addToQueue: vi.fn(),
	getQueueItem: vi.fn(),
	claimQueueItem: vi.fn(),
	releaseQueueItem: vi.fn(),
	resolveQueueItem: vi.fn(),
	dismissQueueItem: vi.fn(),
	ModerationError: class ModerationError extends Error {
		code: string;
		constructor(code: string, message: string) {
			super(message);
			this.code = code;
		}
	}
}));

// Mock moderation actions service
vi.mock('$lib/server/services/moderation.actions', () => ({
	approveContent: vi.fn(),
	rejectContent: vi.fn(),
	warnUser: vi.fn(),
	banUserAction: vi.fn(),
	editContent: vi.fn(),
	overrideVerification: vi.fn(),
	dismissReport: vi.fn(),
	markActionAsWrong: vi.fn(),
	getModerationDashboard: vi.fn(),
	ModerationActionError: class ModerationActionError extends Error {
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

describe('T23: Moderator API Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET /api/moderators', () => {
		it('should return list of moderators', async () => {
			const { getAllModerators } = await import('$lib/server/services/moderator');
			const { GET } = await import('../../src/routes/api/moderators/+server');

			vi.mocked(getAllModerators).mockResolvedValue([
				{
					id: 'mod-1',
					firstName: 'John',
					lastName: 'Mod',
					trustScore: 100,
					lastLoginAt: new Date()
				},
				{
					id: 'mod-2',
					firstName: 'Jane',
					lastName: 'Admin',
					trustScore: 95,
					lastLoginAt: new Date()
				}
			] as any);

			const url = createMockUrl('/api/moderators');
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			const response = await GET({ url, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data).toHaveLength(2);
			expect(data.data[0].firstName).toBe('John');
		});

		it('should return moderator stats', async () => {
			const { getModeratorStats } = await import('$lib/server/services/moderator');
			const { GET } = await import('../../src/routes/api/moderators/+server');

			vi.mocked(getModeratorStats).mockResolvedValue({
				totalModerators: 10,
				activeModerators: 8,
				inactiveModerators: 2
			} as any);

			const url = createMockUrl('/api/moderators', { stats: 'true' });
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			const response = await GET({ url, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.totalModerators).toBe(10);
		});

		it('should return config for moderator', async () => {
			const { getModeratorConfig } = await import('$lib/server/services/moderator');
			const { GET } = await import('../../src/routes/api/moderators/+server');

			vi.mocked(getModeratorConfig).mockReturnValue({
				maxModerators: 20,
				inactivityDays: 30
			} as any);

			const url = createMockUrl('/api/moderators', { config: 'true' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await GET({ url, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.maxModerators).toBe(20);
		});

		it('should throw 403 for non-moderator requesting config', async () => {
			const { GET } = await import('../../src/routes/api/moderators/+server');

			const url = createMockUrl('/api/moderators', { config: 'true' });
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			await expect(GET({ url, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});

		it('should return candidates for moderator', async () => {
			const { getEligibleCandidates } = await import('$lib/server/services/moderator');
			const { GET } = await import('../../src/routes/api/moderators/+server');

			vi.mocked(getEligibleCandidates).mockResolvedValue([
				{ id: 'user-1', firstName: 'Alice', lastName: 'Smith', trustScore: 80, userType: 'VERIFIED' }
			] as any);

			const url = createMockUrl('/api/moderators', { candidates: 'true', limit: '10' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await GET({ url, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data).toHaveLength(1);
			expect(getEligibleCandidates).toHaveBeenCalledWith(10);
		});

		it('should return inactive moderators for moderator', async () => {
			const { getInactiveModerators } = await import('$lib/server/services/moderator');
			const { GET } = await import('../../src/routes/api/moderators/+server');

			vi.mocked(getInactiveModerators).mockResolvedValue([
				{ id: 'mod-1', firstName: 'Bob', lastName: 'Inactive', trustScore: 70, lastLoginAt: new Date() }
			] as any);

			const url = createMockUrl('/api/moderators', { inactive: 'true' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await GET({ url, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data).toHaveLength(1);
			expect(data.data[0].firstName).toBe('Bob');
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { GET } = await import('../../src/routes/api/moderators/+server');

			const url = createMockUrl('/api/moderators');
			const locals = { user: null };

			await expect(GET({ url, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});
	});

	describe('POST /api/moderators', () => {
		it('should run auto-election for moderator', async () => {
			const { runAutoElection } = await import('$lib/server/services/moderator');
			const { POST } = await import('../../src/routes/api/moderators/+server');

			vi.mocked(runAutoElection).mockResolvedValue({
				promoted: [{ id: 'user-1', firstName: 'Alice', lastName: 'Smith' }],
				demoted: [{ id: 'mod-1', firstName: 'Bob', lastName: 'Old' }]
			} as any);

			const request = createMockRequest({ action: 'auto-elect' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.promoted).toHaveLength(1);
			expect(data.data.demoted).toHaveLength(1);
		});

		it('should handle inactive moderators', async () => {
			const { handleInactiveModerators } = await import('$lib/server/services/moderator');
			const { POST } = await import('../../src/routes/api/moderators/+server');

			vi.mocked(handleInactiveModerators).mockResolvedValue({
				demoted: [{ id: 'mod-1', firstName: 'Bob', lastName: 'Inactive' }],
				promoted: [{ id: 'user-1', firstName: 'Alice', lastName: 'New' }]
			} as any);

			const request = createMockRequest({ action: 'handle-inactive' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.demoted).toHaveLength(1);
			expect(data.data.promoted).toHaveLength(1);
		});

		it('should throw 400 for invalid action', async () => {
			const { POST } = await import('../../src/routes/api/moderators/+server');

			const request = createMockRequest({ action: 'invalid' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 400
			});
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { POST } = await import('../../src/routes/api/moderators/+server');

			const request = createMockRequest({ action: 'auto-elect' });
			const locals = { user: null };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 for non-moderator', async () => {
			const { POST } = await import('../../src/routes/api/moderators/+server');

			const request = createMockRequest({ action: 'auto-elect' });
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});
	});

	describe('GET /api/moderators/:id', () => {
		it('should check eligibility for user', async () => {
			const { isEligibleForModerator } = await import('$lib/server/services/moderator');
			const { GET } = await import('../../src/routes/api/moderators/[id]/+server');

			vi.mocked(isEligibleForModerator).mockResolvedValue({
				eligible: true,
				reason: 'Meets all criteria'
			});

			const params = { id: 'user-123' };
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await GET({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.eligible).toBe(true);
			expect(data.data.reason).toBe('Meets all criteria');
		});

		it('should return ineligible status', async () => {
			const { isEligibleForModerator } = await import('$lib/server/services/moderator');
			const { GET } = await import('../../src/routes/api/moderators/[id]/+server');

			vi.mocked(isEligibleForModerator).mockResolvedValue({
				eligible: false,
				reason: 'Trust score too low'
			});

			const params = { id: 'user-456' };
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await GET({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.eligible).toBe(false);
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { GET } = await import('../../src/routes/api/moderators/[id]/+server');

			const params = { id: 'user-123' };
			const locals = { user: null };

			await expect(GET({ params, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});
	});

	describe('POST /api/moderators/:id', () => {
		it('should appoint user as moderator', async () => {
			const { appointModerator } = await import('$lib/server/services/moderator');
			const { POST } = await import('../../src/routes/api/moderators/[id]/+server');

			vi.mocked(appointModerator).mockResolvedValue({
				id: 'user-123',
				firstName: 'Alice',
				lastName: 'New',
				userType: 'MODERATOR'
			} as any);

			const params = { id: 'user-123' };
			const request = createMockRequest({ action: 'appoint' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await POST({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.userType).toBe('MODERATOR');
			expect(data.data.message).toContain('appointed');
		});

		it('should demote moderator', async () => {
			const { demoteModerator } = await import('$lib/server/services/moderator');
			const { POST } = await import('../../src/routes/api/moderators/[id]/+server');

			vi.mocked(demoteModerator).mockResolvedValue({
				id: 'mod-456',
				firstName: 'Bob',
				lastName: 'Old',
				userType: 'VERIFIED'
			} as any);

			const params = { id: 'mod-456' };
			const request = createMockRequest({ action: 'demote' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await POST({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.userType).toBe('VERIFIED');
			expect(data.data.message).toContain('demoted');
		});

		it('should reinstate returning moderator', async () => {
			const { handleReturningModerator } = await import('$lib/server/services/moderator');
			const { POST } = await import('../../src/routes/api/moderators/[id]/+server');

			vi.mocked(handleReturningModerator).mockResolvedValue({
				reinstated: true,
				message: 'User reinstated as moderator'
			});

			const params = { id: 'user-123' };
			const request = createMockRequest({ action: 'reinstate' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await POST({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.reinstated).toBe(true);
		});

		it('should throw 404 when user not found', async () => {
			const { appointModerator, ModeratorError } = await import(
				'$lib/server/services/moderator'
			);
			const { POST } = await import('../../src/routes/api/moderators/[id]/+server');

			vi.mocked(appointModerator).mockRejectedValue(
				new ModeratorError('USER_NOT_FOUND', 'User not found')
			);

			const params = { id: 'nonexistent' };
			const request = createMockRequest({ action: 'appoint' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});

		it('should throw 409 when already moderator', async () => {
			const { appointModerator, ModeratorError } = await import(
				'$lib/server/services/moderator'
			);
			const { POST } = await import('../../src/routes/api/moderators/[id]/+server');

			vi.mocked(appointModerator).mockRejectedValue(
				new ModeratorError('ALREADY_MODERATOR', 'User is already a moderator')
			);

			const params = { id: 'mod-456' };
			const request = createMockRequest({ action: 'appoint' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 409
			});
		});

		it('should throw 400 when org cannot moderate', async () => {
			const { appointModerator, ModeratorError } = await import(
				'$lib/server/services/moderator'
			);
			const { POST } = await import('../../src/routes/api/moderators/[id]/+server');

			vi.mocked(appointModerator).mockRejectedValue(
				new ModeratorError('ORG_CANNOT_MODERATE', 'Organizations cannot be moderators')
			);

			const params = { id: 'org-123' };
			const request = createMockRequest({ action: 'appoint' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 400
			});
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { POST } = await import('../../src/routes/api/moderators/[id]/+server');

			const params = { id: 'user-123' };
			const request = createMockRequest({ action: 'appoint' });
			const locals = { user: null };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 for non-moderator', async () => {
			const { POST } = await import('../../src/routes/api/moderators/[id]/+server');

			const params = { id: 'user-123' };
			const request = createMockRequest({ action: 'appoint' });
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			await expect(POST({ params, request, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});
	});

	describe('GET /api/moderation/queue', () => {
		it('should return queue items for moderator', async () => {
			const { getQueueItems } = await import('$lib/server/services/moderation');
			const { GET } = await import('../../src/routes/api/moderation/queue/+server');

			vi.mocked(getQueueItems).mockResolvedValue([
				{ id: 'queue-1', type: 'REPORTED_CONTENT', status: 'PENDING' },
				{ id: 'queue-2', type: 'EDIT_REQUEST', status: 'IN_PROGRESS' }
			] as any);

			const url = createMockUrl('/api/moderation/queue');
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await GET({ url, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data).toHaveLength(2);
		});

		it('should filter by type', async () => {
			const { getQueueItems } = await import('$lib/server/services/moderation');
			const { GET } = await import('../../src/routes/api/moderation/queue/+server');

			vi.mocked(getQueueItems).mockResolvedValue([]);

			const url = createMockUrl('/api/moderation/queue', { type: 'REPORTED_CONTENT' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			await GET({ url, locals } as any);

			expect(getQueueItems).toHaveBeenCalledWith(
				expect.objectContaining({ type: 'REPORTED_CONTENT' }),
				expect.any(Object)
			);
		});

		it('should filter by status', async () => {
			const { getQueueItems } = await import('$lib/server/services/moderation');
			const { GET } = await import('../../src/routes/api/moderation/queue/+server');

			vi.mocked(getQueueItems).mockResolvedValue([]);

			const url = createMockUrl('/api/moderation/queue', { status: 'PENDING' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			await GET({ url, locals } as any);

			expect(getQueueItems).toHaveBeenCalledWith(
				expect.objectContaining({ status: 'PENDING' }),
				expect.any(Object)
			);
		});

		it('should filter by assigned items', async () => {
			const { getQueueItems } = await import('$lib/server/services/moderation');
			const { GET } = await import('../../src/routes/api/moderation/queue/+server');

			vi.mocked(getQueueItems).mockResolvedValue([]);

			const url = createMockUrl('/api/moderation/queue', { mine: 'true' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			await GET({ url, locals } as any);

			expect(getQueueItems).toHaveBeenCalledWith(
				expect.objectContaining({ assignedToId: 'mod-123' }),
				expect.any(Object)
			);
		});

		it('should return queue stats', async () => {
			const { getQueueStats } = await import('$lib/server/services/moderation');
			const { GET } = await import('../../src/routes/api/moderation/queue/+server');

			vi.mocked(getQueueStats).mockResolvedValue({
				pending: 15,
				inProgress: 5,
				resolved: 100
			} as any);

			const url = createMockUrl('/api/moderation/queue', { stats: 'true' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await GET({ url, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.pending).toBe(15);
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { GET } = await import('../../src/routes/api/moderation/queue/+server');

			const url = createMockUrl('/api/moderation/queue');
			const locals = { user: null };

			await expect(GET({ url, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 for non-moderator', async () => {
			const { GET } = await import('../../src/routes/api/moderation/queue/+server');

			const url = createMockUrl('/api/moderation/queue');
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			await expect(GET({ url, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});
	});

	describe('POST /api/moderation/queue', () => {
		it('should add item to queue', async () => {
			const { addToQueue } = await import('$lib/server/services/moderation');
			const { POST } = await import('../../src/routes/api/moderation/queue/+server');

			vi.mocked(addToQueue).mockResolvedValue({
				id: 'queue-new',
				type: 'REPORTED_CONTENT',
				status: 'PENDING'
			} as any);

			const request = createMockRequest({
				type: 'REPORTED_CONTENT',
				contentId: 'fact-123',
				contentType: 'FACT',
				reason: 'Misinformation'
			});
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.id).toBe('queue-new');
		});

		it('should throw 400 for invalid type', async () => {
			const { POST } = await import('../../src/routes/api/moderation/queue/+server');

			const request = createMockRequest({
				type: 'INVALID_TYPE',
				contentId: 'fact-123',
				contentType: 'FACT'
			});
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			// error(400) inside try block propagates
			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 400
			});
		});

		it('should throw 400 when missing contentId', async () => {
			const { POST } = await import('../../src/routes/api/moderation/queue/+server');

			const request = createMockRequest({
				type: 'REPORTED_CONTENT',
				contentType: 'FACT'
			});
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 400
			});
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { POST } = await import('../../src/routes/api/moderation/queue/+server');

			const request = createMockRequest({ type: 'REPORTED_CONTENT' });
			const locals = { user: null };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 for non-moderator', async () => {
			const { POST } = await import('../../src/routes/api/moderation/queue/+server');

			const request = createMockRequest({ type: 'REPORTED_CONTENT' });
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});
	});

	describe('GET /api/moderation/queue/:id', () => {
		it('should return queue item details', async () => {
			const { getQueueItem } = await import('$lib/server/services/moderation');
			const { GET } = await import('../../src/routes/api/moderation/queue/[id]/+server');

			vi.mocked(getQueueItem).mockResolvedValue({
				id: 'queue-123',
				type: 'REPORTED_CONTENT',
				status: 'PENDING',
				contentId: 'fact-456',
				reason: 'Spam content'
			} as any);

			const params = { id: 'queue-123' };
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await GET({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.id).toBe('queue-123');
			expect(data.data.reason).toBe('Spam content');
		});

		it('should throw 404 when item not found', async () => {
			const { getQueueItem } = await import('$lib/server/services/moderation');
			const { GET } = await import('../../src/routes/api/moderation/queue/[id]/+server');

			vi.mocked(getQueueItem).mockResolvedValue(null);

			const params = { id: 'nonexistent' };
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			await expect(GET({ params, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { GET } = await import('../../src/routes/api/moderation/queue/[id]/+server');

			const params = { id: 'queue-123' };
			const locals = { user: null };

			await expect(GET({ params, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 for non-moderator', async () => {
			const { GET } = await import('../../src/routes/api/moderation/queue/[id]/+server');

			const params = { id: 'queue-123' };
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			await expect(GET({ params, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});
	});

	describe('PATCH /api/moderation/queue/:id', () => {
		it('should claim queue item', async () => {
			const { claimQueueItem } = await import('$lib/server/services/moderation');
			const { PATCH } = await import('../../src/routes/api/moderation/queue/[id]/+server');

			vi.mocked(claimQueueItem).mockResolvedValue({
				id: 'queue-123',
				status: 'IN_PROGRESS',
				assignedToId: 'mod-123'
			} as any);

			const params = { id: 'queue-123' };
			const request = createMockRequest({ action: 'claim' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await PATCH({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.status).toBe('IN_PROGRESS');
			expect(data.message).toContain('claimed');
		});

		it('should release queue item', async () => {
			const { releaseQueueItem } = await import('$lib/server/services/moderation');
			const { PATCH } = await import('../../src/routes/api/moderation/queue/[id]/+server');

			vi.mocked(releaseQueueItem).mockResolvedValue({
				id: 'queue-123',
				status: 'PENDING',
				assignedToId: null
			} as any);

			const params = { id: 'queue-123' };
			const request = createMockRequest({ action: 'release' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await PATCH({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.status).toBe('PENDING');
		});

		it('should resolve queue item', async () => {
			const { resolveQueueItem } = await import('$lib/server/services/moderation');
			const { PATCH } = await import('../../src/routes/api/moderation/queue/[id]/+server');

			vi.mocked(resolveQueueItem).mockResolvedValue({
				id: 'queue-123',
				status: 'RESOLVED',
				resolution: 'Content removed'
			} as any);

			const params = { id: 'queue-123' };
			const request = createMockRequest({ action: 'resolve', resolution: 'Content removed' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await PATCH({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.status).toBe('RESOLVED');
		});

		it('should dismiss queue item', async () => {
			const { dismissQueueItem } = await import('$lib/server/services/moderation');
			const { PATCH } = await import('../../src/routes/api/moderation/queue/[id]/+server');

			vi.mocked(dismissQueueItem).mockResolvedValue({
				id: 'queue-123',
				status: 'DISMISSED'
			} as any);

			const params = { id: 'queue-123' };
			const request = createMockRequest({ action: 'dismiss', reason: 'Not a valid report' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await PATCH({ params, request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.status).toBe('DISMISSED');
		});

		it('should throw 400 when resolution missing for resolve', async () => {
			const { PATCH } = await import('../../src/routes/api/moderation/queue/[id]/+server');

			const params = { id: 'queue-123' };
			const request = createMockRequest({ action: 'resolve' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			// error(400) inside try block propagates
			await expect(PATCH({ params, request, locals } as any)).rejects.toMatchObject({
				status: 400
			});
		});

		it('should throw 404 when item not found', async () => {
			const { claimQueueItem, ModerationError } = await import(
				'$lib/server/services/moderation'
			);
			const { PATCH } = await import('../../src/routes/api/moderation/queue/[id]/+server');

			vi.mocked(claimQueueItem).mockRejectedValue(
				new ModerationError('NOT_FOUND', 'Queue item not found')
			);

			const params = { id: 'nonexistent' };
			const request = createMockRequest({ action: 'claim' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			await expect(PATCH({ params, request, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});

		it('should throw 409 when item already resolved', async () => {
			const { claimQueueItem, ModerationError } = await import(
				'$lib/server/services/moderation'
			);
			const { PATCH } = await import('../../src/routes/api/moderation/queue/[id]/+server');

			vi.mocked(claimQueueItem).mockRejectedValue(
				new ModerationError('ALREADY_RESOLVED', 'Item already resolved')
			);

			const params = { id: 'queue-123' };
			const request = createMockRequest({ action: 'claim' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			await expect(PATCH({ params, request, locals } as any)).rejects.toMatchObject({
				status: 409
			});
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { PATCH } = await import('../../src/routes/api/moderation/queue/[id]/+server');

			const params = { id: 'queue-123' };
			const request = createMockRequest({ action: 'claim' });
			const locals = { user: null };

			await expect(PATCH({ params, request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 for non-moderator', async () => {
			const { PATCH } = await import('../../src/routes/api/moderation/queue/[id]/+server');

			const params = { id: 'queue-123' };
			const request = createMockRequest({ action: 'claim' });
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			await expect(PATCH({ params, request, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});
	});

	describe('GET /api/moderation/actions', () => {
		it('should return dashboard for moderator', async () => {
			const { getModerationDashboard } = await import('$lib/server/services/moderation.actions');
			const { GET } = await import('../../src/routes/api/moderation/actions/+server');

			vi.mocked(getModerationDashboard).mockResolvedValue({
				myAssigned: 5,
				pendingTotal: 20,
				recentActions: []
			} as any);

			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await GET({ locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.myAssigned).toBe(5);
			expect(getModerationDashboard).toHaveBeenCalledWith('mod-123');
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { GET } = await import('../../src/routes/api/moderation/actions/+server');

			const locals = { user: null };

			await expect(GET({ locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 for non-moderator', async () => {
			const { GET } = await import('../../src/routes/api/moderation/actions/+server');

			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			await expect(GET({ locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});
	});

	describe('POST /api/moderation/actions', () => {
		it('should approve content', async () => {
			const { approveContent } = await import('$lib/server/services/moderation.actions');
			const { POST } = await import('../../src/routes/api/moderation/actions/+server');

			vi.mocked(approveContent).mockResolvedValue({
				success: true,
				contentId: 'fact-123'
			} as any);

			const request = createMockRequest({
				action: 'approve',
				queueItemId: 'queue-123',
				notes: 'Verified correct'
			});
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.message).toContain('approve');
		});

		it('should reject content with reason', async () => {
			const { rejectContent } = await import('$lib/server/services/moderation.actions');
			const { POST } = await import('../../src/routes/api/moderation/actions/+server');

			vi.mocked(rejectContent).mockResolvedValue({
				success: true,
				contentId: 'fact-123'
			} as any);

			const request = createMockRequest({
				action: 'reject',
				queueItemId: 'queue-123',
				reason: 'Contains misinformation'
			});
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
		});

		it('should warn user', async () => {
			const { warnUser } = await import('$lib/server/services/moderation.actions');
			const { POST } = await import('../../src/routes/api/moderation/actions/+server');

			vi.mocked(warnUser).mockResolvedValue({
				success: true,
				userId: 'user-456'
			} as any);

			const request = createMockRequest({
				action: 'warn',
				queueItemId: 'queue-123',
				userId: 'user-456',
				reason: 'Repeated spam'
			});
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
		});

		it('should ban user', async () => {
			const { banUserAction } = await import('$lib/server/services/moderation.actions');
			const { POST } = await import('../../src/routes/api/moderation/actions/+server');

			vi.mocked(banUserAction).mockResolvedValue({
				success: true,
				userId: 'user-456'
			} as any);

			const request = createMockRequest({
				action: 'ban',
				queueItemId: 'queue-123',
				userId: 'user-456',
				reason: 'Harassment'
			});
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
		});

		it('should edit content', async () => {
			const { editContent } = await import('$lib/server/services/moderation.actions');
			const { POST } = await import('../../src/routes/api/moderation/actions/+server');

			vi.mocked(editContent).mockResolvedValue({
				success: true,
				contentId: 'fact-123'
			} as any);

			const request = createMockRequest({
				action: 'edit',
				queueItemId: 'queue-123',
				changes: { content: 'Updated content' }
			});
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
		});

		it('should override verification', async () => {
			const { overrideVerification } = await import('$lib/server/services/moderation.actions');
			const { POST } = await import('../../src/routes/api/moderation/actions/+server');

			vi.mocked(overrideVerification).mockResolvedValue({
				success: true,
				verificationId: 'ver-123'
			} as any);

			const request = createMockRequest({
				action: 'override',
				queueItemId: 'queue-123',
				approved: true,
				notes: 'Manual verification'
			});
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
		});

		it('should dismiss report', async () => {
			const { dismissReport } = await import('$lib/server/services/moderation.actions');
			const { POST } = await import('../../src/routes/api/moderation/actions/+server');

			vi.mocked(dismissReport).mockResolvedValue({
				success: true,
				reportId: 'report-123'
			} as any);

			const request = createMockRequest({
				action: 'dismiss',
				queueItemId: 'queue-123',
				reason: 'Invalid report'
			});
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
		});

		it('should mark action as wrong', async () => {
			const { markActionAsWrong } = await import('$lib/server/services/moderation.actions');
			const { POST } = await import('../../src/routes/api/moderation/actions/+server');

			vi.mocked(markActionAsWrong).mockResolvedValue({
				success: true,
				actionId: 'action-123'
			} as any);

			const request = createMockRequest({
				action: 'mark_wrong',
				queueItemId: 'queue-123',
				reason: 'Incorrect assessment'
			});
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
		});

		it('should throw 400 when action missing', async () => {
			const { POST } = await import('../../src/routes/api/moderation/actions/+server');

			const request = createMockRequest({ queueItemId: 'queue-123' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 400
			});
		});

		it('should throw 400 when queueItemId missing', async () => {
			const { POST } = await import('../../src/routes/api/moderation/actions/+server');

			const request = createMockRequest({ action: 'approve' });
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 400
			});
		});

		it('should throw 404 when queue item not found', async () => {
			const { approveContent, ModerationActionError } = await import(
				'$lib/server/services/moderation.actions'
			);
			const { POST } = await import('../../src/routes/api/moderation/actions/+server');

			vi.mocked(approveContent).mockRejectedValue(
				new ModerationActionError('NOT_FOUND', 'Queue item not found')
			);

			const request = createMockRequest({
				action: 'approve',
				queueItemId: 'nonexistent'
			});
			const locals = { user: { id: 'mod-123', userType: 'MODERATOR' } };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { POST } = await import('../../src/routes/api/moderation/actions/+server');

			const request = createMockRequest({ action: 'approve', queueItemId: 'queue-123' });
			const locals = { user: null };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 403 for non-moderator', async () => {
			const { POST } = await import('../../src/routes/api/moderation/actions/+server');

			const request = createMockRequest({ action: 'approve', queueItemId: 'queue-123' });
			const locals = { user: { id: 'user-123', userType: 'VERIFIED' } };

			await expect(POST({ request, locals } as any)).rejects.toMatchObject({
				status: 403
			});
		});
	});
});
