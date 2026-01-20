import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock user service
vi.mock('$lib/server/services/user', () => ({
	registerUser: vi.fn(),
	verifyEmail: vi.fn(),
	getUserByEmail: vi.fn()
}));

// Mock auth service
vi.mock('$lib/server/services/auth', () => ({
	login: vi.fn(),
	logout: vi.fn(),
	createBlankSessionCookie: vi.fn().mockReturnValue('blank_cookie'),
	getSessionCookieName: vi.fn().mockReturnValue('auth_session')
}));

// Mock password service
vi.mock('$lib/server/services/password', () => ({
	requestPasswordReset: vi.fn(),
	resetPassword: vi.fn(),
	changePassword: vi.fn()
}));

// Mock mail service
vi.mock('$lib/server/mail', () => ({
	sendVerificationEmail: vi.fn().mockResolvedValue(true),
	sendPasswordResetEmail: vi.fn().mockResolvedValue(true)
}));

// Mock validation
vi.mock('$lib/utils/validation', () => ({
	loginSchema: {
		safeParse: vi.fn((data: any) => {
			if (!data.email || !data.password) {
				return { success: false, error: { flatten: () => ({ fieldErrors: {} }) } };
			}
			return { success: true, data };
		})
	},
	passwordResetRequestSchema: {
		safeParse: vi.fn((data: any) => {
			if (!data.email || !data.email.includes('@')) {
				return { success: false };
			}
			return { success: true, data };
		})
	},
	passwordResetSchema: {
		safeParse: vi.fn((data: any) => {
			if (!data.token || !data.password) {
				return { success: false, error: { flatten: () => ({ fieldErrors: {} }) } };
			}
			return { success: true, data };
		})
	}
}));

// Helper to create mock request
function createMockRequest(body: any): Request {
	return {
		json: vi.fn().mockResolvedValue(body)
	} as unknown as Request;
}

// Helper to create mock URL
function createMockUrl(params: Record<string, string>): URL {
	const url = new URL('http://localhost:3000/api/auth/verify');
	Object.entries(params).forEach(([key, value]) => {
		url.searchParams.set(key, value);
	});
	return url;
}

describe('T10: Auth API Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('POST /api/auth/register', () => {
		it('should register a new user successfully', async () => {
			const { registerUser } = await import('$lib/server/services/user');
			const { POST } = await import('../../src/routes/api/auth/register/+server');

			vi.mocked(registerUser).mockResolvedValue({
				user: {
					id: 'user-123',
					email: 'test@example.com',
					firstName: 'John',
					lastName: 'Doe'
				},
				verificationToken: 'token-123'
			} as any);

			const request = createMockRequest({
				email: 'test@example.com',
				firstName: 'John',
				lastName: 'Doe',
				password: 'SecurePass123!'
			});

			const response = await POST({ request } as any);
			const data = await response.json();

			expect(response.status).toBe(201);
			expect(data.success).toBe(true);
			expect(data.user.email).toBe('test@example.com');
		});

		it('should return 400 for validation error', async () => {
			const { registerUser } = await import('$lib/server/services/user');
			const { POST } = await import('../../src/routes/api/auth/register/+server');

			vi.mocked(registerUser).mockRejectedValue({
				code: 'VALIDATION_ERROR',
				message: 'Validation failed',
				details: { email: ['Invalid email'] }
			});

			const request = createMockRequest({
				email: 'invalid',
				firstName: 'John',
				lastName: 'Doe',
				password: 'weak'
			});

			const response = await POST({ request } as any);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.success).toBe(false);
		});

		it('should return 409 for existing email', async () => {
			const { registerUser } = await import('$lib/server/services/user');
			const { POST } = await import('../../src/routes/api/auth/register/+server');

			vi.mocked(registerUser).mockRejectedValue({
				code: 'EMAIL_EXISTS',
				message: 'An account with this email already exists'
			});

			const request = createMockRequest({
				email: 'existing@example.com',
				firstName: 'John',
				lastName: 'Doe',
				password: 'SecurePass123!'
			});

			const response = await POST({ request } as any);
			const data = await response.json();

			expect(response.status).toBe(409);
			expect(data.success).toBe(false);
			expect(data.error).toContain('already exists');
		});

		it('should return 400 for disposable email', async () => {
			const { registerUser } = await import('$lib/server/services/user');
			const { POST } = await import('../../src/routes/api/auth/register/+server');

			vi.mocked(registerUser).mockRejectedValue({
				code: 'DISPOSABLE_EMAIL',
				message: 'Disposable email addresses are not allowed'
			});

			const request = createMockRequest({
				email: 'test@tempmail.com',
				firstName: 'John',
				lastName: 'Doe',
				password: 'SecurePass123!'
			});

			const response = await POST({ request } as any);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.success).toBe(false);
		});
	});

	describe('POST /api/auth/login', () => {
		it('should login successfully with valid credentials', async () => {
			const { login } = await import('$lib/server/services/auth');
			const { POST } = await import('../../src/routes/api/auth/login/+server');

			vi.mocked(login).mockResolvedValue({
				user: {
					id: 'user-123',
					email: 'test@example.com',
					firstName: 'John',
					lastName: 'Doe',
					userType: 'VERIFIED',
					trustScore: 50
				},
				session: { id: 'session-123' },
				sessionCookie: 'cookie_value'
			} as any);

			const request = createMockRequest({
				email: 'test@example.com',
				password: 'SecurePass123!',
				rememberMe: false
			});

			const response = await POST({
				request,
				getClientAddress: () => '192.168.1.1'
			} as any);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.user.email).toBe('test@example.com');
			expect(response.headers.get('Set-Cookie')).toBe('cookie_value');
		});

		it('should return 400 for invalid input', async () => {
			const { POST } = await import('../../src/routes/api/auth/login/+server');

			const request = createMockRequest({
				email: '',
				password: ''
			});

			const response = await POST({
				request,
				getClientAddress: () => '192.168.1.1'
			} as any);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.success).toBe(false);
		});

		it('should return 401 for invalid credentials', async () => {
			const { login } = await import('$lib/server/services/auth');
			const { POST } = await import('../../src/routes/api/auth/login/+server');

			vi.mocked(login).mockRejectedValue({
				code: 'INVALID_CREDENTIALS',
				message: 'Invalid email or password'
			});

			const request = createMockRequest({
				email: 'test@example.com',
				password: 'wrongpassword'
			});

			const response = await POST({
				request,
				getClientAddress: () => '192.168.1.1'
			} as any);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.success).toBe(false);
		});

		it('should return 403 for unverified email', async () => {
			const { login } = await import('$lib/server/services/auth');
			const { POST } = await import('../../src/routes/api/auth/login/+server');

			vi.mocked(login).mockRejectedValue({
				code: 'EMAIL_NOT_VERIFIED',
				message: 'Please verify your email address before logging in'
			});

			const request = createMockRequest({
				email: 'test@example.com',
				password: 'SecurePass123!'
			});

			const response = await POST({
				request,
				getClientAddress: () => '192.168.1.1'
			} as any);
			const data = await response.json();

			expect(response.status).toBe(403);
			expect(data.code).toBe('EMAIL_NOT_VERIFIED');
		});

		it('should return 403 for banned user', async () => {
			const { login } = await import('$lib/server/services/auth');
			const { POST } = await import('../../src/routes/api/auth/login/+server');

			vi.mocked(login).mockRejectedValue({
				code: 'USER_BANNED',
				message: 'Your account has been banned'
			});

			const request = createMockRequest({
				email: 'banned@example.com',
				password: 'SecurePass123!'
			});

			const response = await POST({
				request,
				getClientAddress: () => '192.168.1.1'
			} as any);
			const data = await response.json();

			expect(response.status).toBe(403);
			expect(data.code).toBe('USER_BANNED');
		});

		it('should return 429 when rate limited', async () => {
			const { login } = await import('$lib/server/services/auth');
			const { POST } = await import('../../src/routes/api/auth/login/+server');

			vi.mocked(login).mockRejectedValue({
				code: 'RATE_LIMITED',
				message: 'Too many login attempts',
				retryAfterSeconds: 600
			});

			const request = createMockRequest({
				email: 'test@example.com',
				password: 'SecurePass123!'
			});

			const response = await POST({
				request,
				getClientAddress: () => '192.168.1.1'
			} as any);
			const data = await response.json();

			expect(response.status).toBe(429);
			expect(data.retryAfterSeconds).toBe(600);
			expect(response.headers.get('Retry-After')).toBe('600');
		});
	});

	describe('POST /api/auth/logout', () => {
		it('should logout successfully', async () => {
			const { logout } = await import('$lib/server/services/auth');
			const { POST } = await import('../../src/routes/api/auth/logout/+server');

			vi.mocked(logout).mockResolvedValue(undefined);

			const cookies = {
				get: vi.fn().mockReturnValue('session-123')
			};
			const locals = {
				user: { id: 'user-123' },
				session: { id: 'session-123' }
			};

			const response = await POST({ cookies, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.message).toBe('Logged out successfully');
			expect(logout).toHaveBeenCalledWith('session-123');
			expect(locals.user).toBeNull();
			expect(locals.session).toBeNull();
		});

		it('should handle logout without session', async () => {
			const { logout } = await import('$lib/server/services/auth');
			const { POST } = await import('../../src/routes/api/auth/logout/+server');

			const cookies = {
				get: vi.fn().mockReturnValue(null)
			};
			const locals = {
				user: null,
				session: null
			};

			const response = await POST({ cookies, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(logout).not.toHaveBeenCalled();
		});
	});

	describe('POST /api/auth/verify', () => {
		it('should verify email with valid token', async () => {
			const { verifyEmail } = await import('$lib/server/services/user');
			const { POST } = await import('../../src/routes/api/auth/verify/+server');

			vi.mocked(verifyEmail).mockResolvedValue({
				id: 'user-123',
				email: 'test@example.com',
				emailVerified: true
			} as any);

			const request = createMockRequest({ token: 'valid-token' });

			const response = await POST({ request } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.message).toContain('verified successfully');
		});

		it('should return 400 for missing token', async () => {
			const { POST } = await import('../../src/routes/api/auth/verify/+server');

			const request = createMockRequest({});

			const response = await POST({ request } as any);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain('token is required');
		});

		it('should return 400 for invalid token', async () => {
			const { verifyEmail } = await import('$lib/server/services/user');
			const { POST } = await import('../../src/routes/api/auth/verify/+server');

			vi.mocked(verifyEmail).mockResolvedValue(null);

			const request = createMockRequest({ token: 'invalid-token' });

			const response = await POST({ request } as any);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain('Invalid or expired');
		});
	});

	describe('GET /api/auth/verify', () => {
		it('should verify email via GET with valid token', async () => {
			const { verifyEmail } = await import('$lib/server/services/user');
			const { GET } = await import('../../src/routes/api/auth/verify/+server');

			vi.mocked(verifyEmail).mockResolvedValue({
				id: 'user-123',
				emailVerified: true
			} as any);

			const url = createMockUrl({ token: 'valid-token' });

			const response = await GET({ url } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
		});

		it('should return 400 for missing token in query', async () => {
			const { GET } = await import('../../src/routes/api/auth/verify/+server');

			const url = createMockUrl({});

			const response = await GET({ url } as any);
			const data = await response.json();

			expect(response.status).toBe(400);
		});
	});

	describe('POST /api/auth/forgot-password', () => {
		it('should send password reset email', async () => {
			const { requestPasswordReset } = await import('$lib/server/services/password');
			const { getUserByEmail } = await import('$lib/server/services/user');
			const { sendPasswordResetEmail } = await import('$lib/server/mail');
			const { POST } = await import('../../src/routes/api/auth/forgot-password/+server');

			vi.mocked(requestPasswordReset).mockResolvedValue('reset-token-123');
			vi.mocked(getUserByEmail).mockResolvedValue({
				id: 'user-123',
				email: 'test@example.com',
				firstName: 'John'
			} as any);

			const request = createMockRequest({ email: 'test@example.com' });

			const response = await POST({ request } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(sendPasswordResetEmail).toHaveBeenCalledWith('test@example.com', 'John', 'reset-token-123');
		});

		it('should return success even for non-existent email', async () => {
			const { requestPasswordReset } = await import('$lib/server/services/password');
			const { POST } = await import('../../src/routes/api/auth/forgot-password/+server');

			vi.mocked(requestPasswordReset).mockResolvedValue(null);

			const request = createMockRequest({ email: 'nonexistent@example.com' });

			const response = await POST({ request } as any);
			const data = await response.json();

			// Should not reveal if email exists
			expect(data.success).toBe(true);
		});

		it('should return 400 for invalid email format', async () => {
			const { POST } = await import('../../src/routes/api/auth/forgot-password/+server');

			const request = createMockRequest({ email: 'invalid-email' });

			const response = await POST({ request } as any);
			const data = await response.json();

			expect(response.status).toBe(400);
		});

		it('should return 429 when rate limited', async () => {
			const { requestPasswordReset } = await import('$lib/server/services/password');
			const { POST } = await import('../../src/routes/api/auth/forgot-password/+server');

			vi.mocked(requestPasswordReset).mockRejectedValue({
				code: 'RATE_LIMITED',
				message: 'Too many password reset attempts',
				retryAfterSeconds: 300
			});

			const request = createMockRequest({ email: 'test@example.com' });

			const response = await POST({ request } as any);
			const data = await response.json();

			expect(response.status).toBe(429);
		});
	});

	describe('POST /api/auth/reset-password', () => {
		it('should reset password with valid token', async () => {
			const { resetPassword } = await import('$lib/server/services/password');
			const { POST } = await import('../../src/routes/api/auth/reset-password/+server');

			vi.mocked(resetPassword).mockResolvedValue({
				id: 'user-123'
			} as any);

			const request = createMockRequest({
				token: 'valid-token',
				password: 'NewSecurePass123!'
			});

			const response = await POST({ request } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.message).toContain('reset successfully');
		});

		it('should return 400 for invalid input', async () => {
			const { POST } = await import('../../src/routes/api/auth/reset-password/+server');

			const request = createMockRequest({
				token: '',
				password: ''
			});

			const response = await POST({ request } as any);
			const data = await response.json();

			expect(response.status).toBe(400);
		});

		it('should return 400 for invalid token', async () => {
			const { resetPassword } = await import('$lib/server/services/password');
			const { POST } = await import('../../src/routes/api/auth/reset-password/+server');

			vi.mocked(resetPassword).mockRejectedValue({
				code: 'INVALID_TOKEN',
				message: 'Invalid reset token'
			});

			const request = createMockRequest({
				token: 'invalid-token',
				password: 'NewSecurePass123!'
			});

			const response = await POST({ request } as any);
			const data = await response.json();

			expect(response.status).toBe(400);
		});

		it('should return 400 for expired token', async () => {
			const { resetPassword } = await import('$lib/server/services/password');
			const { POST } = await import('../../src/routes/api/auth/reset-password/+server');

			vi.mocked(resetPassword).mockRejectedValue({
				code: 'TOKEN_EXPIRED',
				message: 'Reset token has expired'
			});

			const request = createMockRequest({
				token: 'expired-token',
				password: 'NewSecurePass123!'
			});

			const response = await POST({ request } as any);
			const data = await response.json();

			expect(response.status).toBe(400);
		});

		it('should return 400 for same password', async () => {
			const { resetPassword } = await import('$lib/server/services/password');
			const { POST } = await import('../../src/routes/api/auth/reset-password/+server');

			vi.mocked(resetPassword).mockRejectedValue({
				code: 'SAME_PASSWORD',
				message: 'New password must be different from current password'
			});

			const request = createMockRequest({
				token: 'valid-token',
				password: 'SamePassword123!'
			});

			const response = await POST({ request } as any);
			const data = await response.json();

			expect(response.status).toBe(400);
		});
	});

	describe('POST /api/auth/change-password', () => {
		it('should change password for authenticated user', async () => {
			const { changePassword } = await import('$lib/server/services/password');
			const { POST } = await import('../../src/routes/api/auth/change-password/+server');

			vi.mocked(changePassword).mockResolvedValue({
				id: 'user-123'
			} as any);

			const request = createMockRequest({
				currentPassword: 'OldPass123!',
				newPassword: 'NewPass123!'
			});
			const locals = {
				user: { id: 'user-123' },
				session: { id: 'session-123' }
			};

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(changePassword).toHaveBeenCalledWith('user-123', 'OldPass123!', 'NewPass123!');
		});

		it('should return 401 for unauthenticated user', async () => {
			const { POST } = await import('../../src/routes/api/auth/change-password/+server');

			const request = createMockRequest({
				currentPassword: 'OldPass123!',
				newPassword: 'NewPass123!'
			});
			const locals = {
				user: null,
				session: null
			};

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(response.status).toBe(401);
		});

		it('should return 400 for missing passwords', async () => {
			const { POST } = await import('../../src/routes/api/auth/change-password/+server');

			const request = createMockRequest({});
			const locals = {
				user: { id: 'user-123' },
				session: { id: 'session-123' }
			};

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(response.status).toBe(400);
		});

		it('should return 400 for wrong current password', async () => {
			const { changePassword } = await import('$lib/server/services/password');
			const { POST } = await import('../../src/routes/api/auth/change-password/+server');

			vi.mocked(changePassword).mockRejectedValue({
				code: 'WRONG_CURRENT_PASSWORD',
				message: 'Current password is incorrect'
			});

			const request = createMockRequest({
				currentPassword: 'WrongPass123!',
				newPassword: 'NewPass123!'
			});
			const locals = {
				user: { id: 'user-123' },
				session: { id: 'session-123' }
			};

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(response.status).toBe(400);
		});

		it('should return 400 for same new password', async () => {
			const { changePassword } = await import('$lib/server/services/password');
			const { POST } = await import('../../src/routes/api/auth/change-password/+server');

			vi.mocked(changePassword).mockRejectedValue({
				code: 'SAME_PASSWORD',
				message: 'New password must be different from current password'
			});

			const request = createMockRequest({
				currentPassword: 'OldPass123!',
				newPassword: 'OldPass123!'
			});
			const locals = {
				user: { id: 'user-123' },
				session: { id: 'session-123' }
			};

			const response = await POST({ request, locals } as any);
			const data = await response.json();

			expect(response.status).toBe(400);
		});
	});
});
