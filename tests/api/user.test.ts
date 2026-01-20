import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock profile service
vi.mock('$lib/server/services/profile', () => ({
	getProfile: vi.fn(),
	updateProfile: vi.fn(),
	deleteAccount: vi.fn(),
	requestEmailChange: vi.fn(),
	getNotificationPreferences: vi.fn(),
	updateNotificationPreference: vi.fn(),
	setAllNotificationPreferences: vi.fn()
}));

// Mock auth service
vi.mock('$lib/server/services/auth', () => ({
	createBlankSessionCookie: vi.fn().mockReturnValue('blank_cookie')
}));

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

// Helper to create mock request
function createMockRequest(body: any): Request {
	return {
		json: vi.fn().mockResolvedValue(body)
	} as unknown as Request;
}

describe('T11: User API Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET /api/user/profile', () => {
		it('should return profile for authenticated user', async () => {
			const { getProfile } = await import('$lib/server/services/profile');
			const { GET } = await import('../../src/routes/api/user/profile/+server');

			vi.mocked(getProfile).mockResolvedValue({
				id: 'user-123',
				email: 'test@example.com',
				firstName: 'John',
				lastName: 'Doe',
				userType: 'VERIFIED',
				trustScore: 50,
				emailVerified: true,
				createdAt: new Date()
			} as any);

			const locals = {
				user: { id: 'user-123' },
				session: { id: 'session-123' }
			};

			const response = await GET({ locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.profile.email).toBe('test@example.com');
			expect(data.profile.firstName).toBe('John');
		});

		it('should return 401 for unauthenticated user', async () => {
			const { GET } = await import('../../src/routes/api/user/profile/+server');

			const locals = {
				user: null,
				session: null
			};

			const response = await GET({ locals } as any);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.success).toBe(false);
		});

		it('should return 404 when profile not found', async () => {
			const { getProfile } = await import('$lib/server/services/profile');
			const { GET } = await import('../../src/routes/api/user/profile/+server');

			vi.mocked(getProfile).mockResolvedValue(null);

			const locals = {
				user: { id: 'user-123' },
				session: { id: 'session-123' }
			};

			const response = await GET({ locals } as any);
			const data = await response.json();

			expect(response.status).toBe(404);
			expect(data.success).toBe(false);
		});
	});

	describe('PATCH /api/user/profile', () => {
		it('should update profile for authenticated user', async () => {
			const { updateProfile } = await import('$lib/server/services/profile');
			const { PATCH } = await import('../../src/routes/api/user/profile/+server');

			vi.mocked(updateProfile).mockResolvedValue({
				id: 'user-123',
				email: 'test@example.com',
				firstName: 'Jane',
				lastName: 'Smith',
				userType: 'VERIFIED',
				trustScore: 50
			} as any);

			const request = createMockRequest({
				firstName: 'Jane',
				lastName: 'Smith'
			});
			const locals = {
				user: { id: 'user-123' },
				session: { id: 'session-123' }
			};

			const response = await PATCH({ request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.profile.firstName).toBe('Jane');
			expect(updateProfile).toHaveBeenCalledWith('user-123', {
				firstName: 'Jane',
				lastName: 'Smith'
			});
		});

		it('should return 401 for unauthenticated user', async () => {
			const { PATCH } = await import('../../src/routes/api/user/profile/+server');

			const request = createMockRequest({ firstName: 'Jane' });
			const locals = {
				user: null,
				session: null
			};

			const response = await PATCH({ request, locals } as any);
			const data = await response.json();

			expect(response.status).toBe(401);
		});

		it('should return 400 for service errors', async () => {
			const { updateProfile } = await import('$lib/server/services/profile');
			const { PATCH } = await import('../../src/routes/api/user/profile/+server');

			vi.mocked(updateProfile).mockRejectedValue({
				code: 'VALIDATION_ERROR',
				message: 'First name is required'
			});

			const request = createMockRequest({ firstName: '' });
			const locals = {
				user: { id: 'user-123' },
				session: { id: 'session-123' }
			};

			const response = await PATCH({ request, locals } as any);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.success).toBe(false);
		});
	});

	describe('POST /api/user/delete', () => {
		it('should delete account for authenticated user', async () => {
			const { deleteAccount } = await import('$lib/server/services/profile');
			const { POST } = await import('../../src/routes/api/user/delete/+server');

			vi.mocked(deleteAccount).mockResolvedValue(undefined);

			const locals = {
				user: { id: 'user-123' },
				session: { id: 'session-123' }
			};

			const response = await POST({ locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.message).toContain('deleted');
			expect(deleteAccount).toHaveBeenCalledWith('user-123');
		});

		it('should return 401 for unauthenticated user', async () => {
			const { POST } = await import('../../src/routes/api/user/delete/+server');

			const locals = {
				user: null,
				session: null
			};

			const response = await POST({ locals } as any);
			const data = await response.json();

			expect(response.status).toBe(401);
		});
	});

	describe('POST /api/user/email', () => {
		it('should request email change for authenticated user', async () => {
			const { requestEmailChange } = await import('$lib/server/services/profile');
			const { POST } = await import('../../src/routes/api/user/email/+server');

			vi.mocked(requestEmailChange).mockResolvedValue(undefined);

			const request = createMockRequest({ email: 'newemail@example.com' });
			const locals = {
				user: { id: 'user-123' },
				session: { id: 'session-123' }
			};

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.message).toContain('Verification email');
			expect(requestEmailChange).toHaveBeenCalledWith('user-123', 'newemail@example.com');
		});

		it('should return 401 for unauthenticated user', async () => {
			const { POST } = await import('../../src/routes/api/user/email/+server');

			const request = createMockRequest({ email: 'newemail@example.com' });
			const locals = {
				user: null,
				session: null
			};

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(response.status).toBe(401);
		});

		it('should return 400 for missing email', async () => {
			const { POST } = await import('../../src/routes/api/user/email/+server');

			const request = createMockRequest({});
			const locals = {
				user: { id: 'user-123' },
				session: { id: 'session-123' }
			};

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(response.status).toBe(400);
		});

		it('should return 409 when email already exists', async () => {
			const { requestEmailChange } = await import('$lib/server/services/profile');
			const { POST } = await import('../../src/routes/api/user/email/+server');

			vi.mocked(requestEmailChange).mockRejectedValue({
				code: 'EMAIL_EXISTS',
				message: 'Email already in use'
			});

			const request = createMockRequest({ email: 'existing@example.com' });
			const locals = {
				user: { id: 'user-123' },
				session: { id: 'session-123' }
			};

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(response.status).toBe(409);
		});
	});

	describe('GET /api/user/notifications', () => {
		it('should return notification preferences for authenticated user', async () => {
			const { getNotificationPreferences } = await import('$lib/server/services/profile');
			const { GET } = await import('../../src/routes/api/user/notifications/+server');

			vi.mocked(getNotificationPreferences).mockResolvedValue([
				{ type: 'VOTE', email: true, inApp: true },
				{ type: 'COMMENT', email: false, inApp: true }
			] as any);

			const locals = {
				user: { id: 'user-123' },
				session: { id: 'session-123' }
			};

			const response = await GET({ locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.preferences).toHaveLength(2);
		});

		it('should return 401 for unauthenticated user', async () => {
			const { GET } = await import('../../src/routes/api/user/notifications/+server');

			const locals = {
				user: null,
				session: null
			};

			const response = await GET({ locals } as any);
			const data = await response.json();

			expect(response.status).toBe(401);
		});
	});

	describe('PATCH /api/user/notifications', () => {
		it('should update individual notification preference', async () => {
			const { updateNotificationPreference } = await import('$lib/server/services/profile');
			const { PATCH } = await import('../../src/routes/api/user/notifications/+server');

			vi.mocked(updateNotificationPreference).mockResolvedValue({
				type: 'VOTE',
				email: false,
				inApp: true
			} as any);

			const request = createMockRequest({
				type: 'VOTE',
				email: false,
				inApp: true
			});
			const locals = {
				user: { id: 'user-123' },
				session: { id: 'session-123' }
			};

			const response = await PATCH({ request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.preference.type).toBe('VOTE');
		});

		it('should update all notification preferences', async () => {
			const { setAllNotificationPreferences } = await import('$lib/server/services/profile');
			const { PATCH } = await import('../../src/routes/api/user/notifications/+server');

			vi.mocked(setAllNotificationPreferences).mockResolvedValue(undefined);

			const request = createMockRequest({
				allEmail: false,
				allInApp: true
			});
			const locals = {
				user: { id: 'user-123' },
				session: { id: 'session-123' }
			};

			const response = await PATCH({ request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(setAllNotificationPreferences).toHaveBeenCalledWith('user-123', false, true);
		});

		it('should return 400 for missing type in individual update', async () => {
			const { PATCH } = await import('../../src/routes/api/user/notifications/+server');

			const request = createMockRequest({
				email: false
			});
			const locals = {
				user: { id: 'user-123' },
				session: { id: 'session-123' }
			};

			const response = await PATCH({ request, locals } as any);
			const data = await response.json();

			expect(response.status).toBe(400);
		});

		it('should return 401 for unauthenticated user', async () => {
			const { PATCH } = await import('../../src/routes/api/user/notifications/+server');

			const request = createMockRequest({ type: 'VOTE' });
			const locals = {
				user: null,
				session: null
			};

			const response = await PATCH({ request, locals } as any);
			const data = await response.json();

			expect(response.status).toBe(401);
		});
	});

	describe('GET /api/user/blocked', () => {
		it('should return blocked users list', async () => {
			const { getBlockedUsers } = await import('$lib/server/services/userBlock');
			const { GET } = await import('../../src/routes/api/user/blocked/+server');

			vi.mocked(getBlockedUsers).mockResolvedValue([
				{ id: 'user-1', firstName: 'John', lastName: 'Doe', blockedAt: new Date() },
				{ id: 'user-2', firstName: 'Jane', lastName: 'Smith', blockedAt: new Date() }
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

	describe('GET /api/users/:id/block', () => {
		it('should return block status', async () => {
			const { isUserBlocked } = await import('$lib/server/services/userBlock');
			const { GET } = await import('../../src/routes/api/users/[id]/block/+server');

			vi.mocked(isUserBlocked).mockResolvedValue(true);

			const params = { id: 'target-user' };
			const locals = { user: { id: 'user-123' } };

			const response = await GET({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.isBlocked).toBe(true);
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { GET } = await import('../../src/routes/api/users/[id]/block/+server');

			const params = { id: 'target-user' };
			const locals = { user: null };

			await expect(GET({ params, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});
	});

	describe('POST /api/users/:id/block', () => {
		it('should block a user successfully', async () => {
			const { blockUser } = await import('$lib/server/services/userBlock');
			const { POST } = await import('../../src/routes/api/users/[id]/block/+server');

			vi.mocked(blockUser).mockResolvedValue(undefined);

			const params = { id: 'target-user' };
			const locals = { user: { id: 'user-123' } };

			const response = await POST({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.message).toContain('blocked');
			expect(blockUser).toHaveBeenCalledWith('user-123', 'target-user');
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { POST } = await import('../../src/routes/api/users/[id]/block/+server');

			const params = { id: 'target-user' };
			const locals = { user: null };

			await expect(POST({ params, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 404 when target user not found', async () => {
			const { blockUser, UserBlockError } = await import('$lib/server/services/userBlock');
			const { POST } = await import('../../src/routes/api/users/[id]/block/+server');

			vi.mocked(blockUser).mockRejectedValue(new UserBlockError('USER_NOT_FOUND', 'User not found'));

			const params = { id: 'nonexistent' };
			const locals = { user: { id: 'user-123' } };

			await expect(POST({ params, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});

		it('should throw 409 when user already blocked', async () => {
			const { blockUser, UserBlockError } = await import('$lib/server/services/userBlock');
			const { POST } = await import('../../src/routes/api/users/[id]/block/+server');

			vi.mocked(blockUser).mockRejectedValue(new UserBlockError('ALREADY_BLOCKED', 'User already blocked'));

			const params = { id: 'target-user' };
			const locals = { user: { id: 'user-123' } };

			await expect(POST({ params, locals } as any)).rejects.toMatchObject({
				status: 409
			});
		});
	});

	describe('DELETE /api/users/:id/block', () => {
		it('should unblock a user successfully', async () => {
			const { unblockUser } = await import('$lib/server/services/userBlock');
			const { DELETE } = await import('../../src/routes/api/users/[id]/block/+server');

			vi.mocked(unblockUser).mockResolvedValue(undefined);

			const params = { id: 'target-user' };
			const locals = { user: { id: 'user-123' } };

			const response = await DELETE({ params, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.data.message).toContain('unblocked');
		});

		it('should throw 401 for unauthenticated user', async () => {
			const { DELETE } = await import('../../src/routes/api/users/[id]/block/+server');

			const params = { id: 'target-user' };
			const locals = { user: null };

			await expect(DELETE({ params, locals } as any)).rejects.toMatchObject({
				status: 401
			});
		});

		it('should throw 404 when user not blocked', async () => {
			const { unblockUser, UserBlockError } = await import('$lib/server/services/userBlock');
			const { DELETE } = await import('../../src/routes/api/users/[id]/block/+server');

			vi.mocked(unblockUser).mockRejectedValue(new UserBlockError('NOT_BLOCKED', 'User is not blocked'));

			const params = { id: 'target-user' };
			const locals = { user: { id: 'user-123' } };

			await expect(DELETE({ params, locals } as any)).rejects.toMatchObject({
				status: 404
			});
		});
	});
});
