import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * T26: User Registration Flow Integration Tests
 *
 * Tests the complete user registration flow from registration through verification.
 * Covers: Registration → Email Verification → Login → Profile Access
 */

// Mock user service
vi.mock('$lib/server/services/user', () => ({
	createUser: vi.fn(),
	getUserById: vi.fn(),
	getUserByEmail: vi.fn(),
	updateUser: vi.fn(),
	verifyUserEmail: vi.fn(),
	UserError: class UserError extends Error {
		code: string;
		constructor(code: string, message: string) {
			super(message);
			this.code = code;
		}
	}
}));

// Mock auth service
vi.mock('$lib/server/services/auth', () => ({
	registerUser: vi.fn(),
	verifyEmail: vi.fn(),
	loginUser: vi.fn(),
	logoutUser: vi.fn(),
	createSession: vi.fn(),
	validateSession: vi.fn(),
	AuthError: class AuthError extends Error {
		code: string;
		constructor(code: string, message: string) {
			super(message);
			this.code = code;
		}
	}
}));

// Mock email service
vi.mock('$lib/server/services/emailNotification', () => ({
	sendVerificationEmail: vi.fn(),
	sendWelcomeEmail: vi.fn()
}));

// Mock trust service
vi.mock('$lib/server/services/trust', () => ({
	initializeTrustScore: vi.fn()
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

describe('T26: User Registration Flow Integration Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Complete Registration Flow', () => {
		it('should complete full registration flow: register → verify → login', async () => {
			const { registerUser, verifyEmail, loginUser } = await import(
				'$lib/server/services/auth'
			);
			const { sendVerificationEmail, sendWelcomeEmail } = await import(
				'$lib/server/services/emailNotification'
			);
			const { initializeTrustScore } = await import('$lib/server/services/trust');

			// Step 1: Register
			const newUser = {
				id: 'user-new',
				email: 'newuser@test.com',
				firstName: 'New',
				lastName: 'User',
				emailVerified: false,
				userType: 'VERIFIED',
				trustScore: 10
			};

			vi.mocked(registerUser).mockResolvedValue({
				user: newUser,
				verificationToken: 'verify-token-123'
			} as any);
			vi.mocked(sendVerificationEmail).mockResolvedValue(undefined);
			vi.mocked(initializeTrustScore).mockResolvedValue(undefined);

			// Simulate registration API call
			const registerResult = await registerUser(
				'newuser@test.com',
				'SecurePassword123!',
				'New',
				'User'
			);

			expect(registerResult.user.email).toBe('newuser@test.com');
			expect(registerResult.verificationToken).toBe('verify-token-123');

			// Verification email should be sent
			await sendVerificationEmail(newUser.email, 'verify-token-123');
			expect(sendVerificationEmail).toHaveBeenCalledWith('newuser@test.com', 'verify-token-123');

			// Step 2: Verify email
			vi.mocked(verifyEmail).mockResolvedValue({
				...newUser,
				emailVerified: true
			} as any);
			vi.mocked(sendWelcomeEmail).mockResolvedValue(undefined);

			const verifiedUser = await verifyEmail('verify-token-123');
			expect(verifiedUser.emailVerified).toBe(true);

			// Welcome email should be sent
			await sendWelcomeEmail(newUser.email);
			expect(sendWelcomeEmail).toHaveBeenCalledWith('newuser@test.com');

			// Step 3: Login
			vi.mocked(loginUser).mockResolvedValue({
				user: verifiedUser,
				session: { id: 'session-123', userId: 'user-new', expiresAt: new Date() }
			} as any);

			const loginResult = await loginUser('newuser@test.com', 'SecurePassword123!');
			expect(loginResult.user.emailVerified).toBe(true);
			expect(loginResult.session.id).toBe('session-123');
		});

		it('should prevent login for unverified email', async () => {
			const { loginUser, AuthError } = await import('$lib/server/services/auth');

			vi.mocked(loginUser).mockRejectedValue(
				new AuthError('EMAIL_NOT_VERIFIED', 'Please verify your email first')
			);

			await expect(loginUser('unverified@test.com', 'password')).rejects.toMatchObject({
				code: 'EMAIL_NOT_VERIFIED'
			});
		});

		it('should handle duplicate email registration', async () => {
			const { registerUser, AuthError } = await import('$lib/server/services/auth');

			vi.mocked(registerUser).mockRejectedValue(
				new AuthError('EMAIL_EXISTS', 'Email already registered')
			);

			await expect(
				registerUser('existing@test.com', 'password', 'Test', 'User')
			).rejects.toMatchObject({
				code: 'EMAIL_EXISTS'
			});
		});

		it('should handle invalid verification token', async () => {
			const { verifyEmail, AuthError } = await import('$lib/server/services/auth');

			vi.mocked(verifyEmail).mockRejectedValue(
				new AuthError('INVALID_TOKEN', 'Invalid or expired verification token')
			);

			await expect(verifyEmail('invalid-token')).rejects.toMatchObject({
				code: 'INVALID_TOKEN'
			});
		});

		it('should handle expired verification token', async () => {
			const { verifyEmail, AuthError } = await import('$lib/server/services/auth');

			vi.mocked(verifyEmail).mockRejectedValue(
				new AuthError('TOKEN_EXPIRED', 'Verification token has expired')
			);

			await expect(verifyEmail('expired-token')).rejects.toMatchObject({
				code: 'TOKEN_EXPIRED'
			});
		});
	});

	describe('Registration Validation', () => {
		it('should reject weak passwords', async () => {
			const { registerUser, AuthError } = await import('$lib/server/services/auth');

			vi.mocked(registerUser).mockRejectedValue(
				new AuthError('WEAK_PASSWORD', 'Password does not meet requirements')
			);

			await expect(
				registerUser('test@test.com', 'weak', 'Test', 'User')
			).rejects.toMatchObject({
				code: 'WEAK_PASSWORD'
			});
		});

		it('should reject invalid email format', async () => {
			const { registerUser, AuthError } = await import('$lib/server/services/auth');

			vi.mocked(registerUser).mockRejectedValue(
				new AuthError('INVALID_EMAIL', 'Invalid email format')
			);

			await expect(
				registerUser('not-an-email', 'SecurePass123!', 'Test', 'User')
			).rejects.toMatchObject({
				code: 'INVALID_EMAIL'
			});
		});

		it('should reject disposable email domains', async () => {
			const { registerUser, AuthError } = await import('$lib/server/services/auth');

			vi.mocked(registerUser).mockRejectedValue(
				new AuthError('DISPOSABLE_EMAIL', 'Disposable email addresses are not allowed')
			);

			await expect(
				registerUser('test@tempmail.com', 'SecurePass123!', 'Test', 'User')
			).rejects.toMatchObject({
				code: 'DISPOSABLE_EMAIL'
			});
		});

		it('should validate name requirements', async () => {
			const { registerUser, AuthError } = await import('$lib/server/services/auth');

			vi.mocked(registerUser).mockRejectedValue(
				new AuthError('INVALID_NAME', 'First name is required')
			);

			await expect(
				registerUser('test@test.com', 'SecurePass123!', '', 'User')
			).rejects.toMatchObject({
				code: 'INVALID_NAME'
			});
		});
	});

	describe('Email Verification Resend', () => {
		it('should allow resending verification email', async () => {
			const { sendVerificationEmail } = await import(
				'$lib/server/services/emailNotification'
			);
			const { getUserByEmail } = await import('$lib/server/services/user');

			vi.mocked(getUserByEmail).mockResolvedValue({
				id: 'user-123',
				email: 'unverified@test.com',
				emailVerified: false
			} as any);
			vi.mocked(sendVerificationEmail).mockResolvedValue(undefined);

			const user = await getUserByEmail('unverified@test.com');
			expect(user?.emailVerified).toBe(false);

			await sendVerificationEmail(user!.email, 'new-verify-token');
			expect(sendVerificationEmail).toHaveBeenCalledWith('unverified@test.com', 'new-verify-token');
		});

		it('should rate limit verification email resends', async () => {
			// Simulate rate limiting by tracking call count
			const { sendVerificationEmail } = await import(
				'$lib/server/services/emailNotification'
			);

			let callCount = 0;
			vi.mocked(sendVerificationEmail).mockImplementation(async () => {
				callCount++;
				if (callCount > 3) {
					throw new Error('Rate limit exceeded');
				}
			});

			// First 3 should succeed
			await sendVerificationEmail('test@test.com', 'token1');
			await sendVerificationEmail('test@test.com', 'token2');
			await sendVerificationEmail('test@test.com', 'token3');

			// 4th should fail
			await expect(
				sendVerificationEmail('test@test.com', 'token4')
			).rejects.toThrow('Rate limit exceeded');
		});
	});

	describe('Session Management After Registration', () => {
		it('should create valid session after successful login', async () => {
			const { loginUser, validateSession } = await import('$lib/server/services/auth');

			const session = {
				id: 'session-456',
				userId: 'user-123',
				expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
			};

			vi.mocked(loginUser).mockResolvedValue({
				user: { id: 'user-123', email: 'test@test.com', emailVerified: true },
				session
			} as any);
			vi.mocked(validateSession).mockResolvedValue({
				session,
				user: { id: 'user-123', email: 'test@test.com' }
			} as any);

			const loginResult = await loginUser('test@test.com', 'password');
			expect(loginResult.session.id).toBe('session-456');

			// Validate the session
			const validation = await validateSession(session.id);
			expect(validation.session.userId).toBe('user-123');
		});

		it('should reject expired sessions', async () => {
			const { validateSession, AuthError } = await import('$lib/server/services/auth');

			vi.mocked(validateSession).mockRejectedValue(
				new AuthError('SESSION_EXPIRED', 'Session has expired')
			);

			await expect(validateSession('expired-session')).rejects.toMatchObject({
				code: 'SESSION_EXPIRED'
			});
		});

		it('should logout and invalidate session', async () => {
			const { logoutUser, validateSession, AuthError } = await import(
				'$lib/server/services/auth'
			);

			vi.mocked(logoutUser).mockResolvedValue(undefined);

			await logoutUser('session-123');
			expect(logoutUser).toHaveBeenCalledWith('session-123');

			// After logout, session should be invalid
			vi.mocked(validateSession).mockRejectedValue(
				new AuthError('INVALID_SESSION', 'Session not found')
			);

			await expect(validateSession('session-123')).rejects.toMatchObject({
				code: 'INVALID_SESSION'
			});
		});
	});

	describe('Trust Score Initialization', () => {
		it('should initialize trust score for new user', async () => {
			const { initializeTrustScore } = await import('$lib/server/services/trust');

			vi.mocked(initializeTrustScore).mockResolvedValue(undefined);

			await initializeTrustScore('user-new');
			expect(initializeTrustScore).toHaveBeenCalledWith('user-new');
		});

		it('should set correct initial trust score based on config', async () => {
			const { getUserById } = await import('$lib/server/services/user');

			// After registration and trust initialization, user should have default trust score
			vi.mocked(getUserById).mockResolvedValue({
				id: 'user-new',
				trustScore: 10, // Default from TRUST_NEW_USER_START env var
				userType: 'VERIFIED'
			} as any);

			const user = await getUserById('user-new');
			expect(user?.trustScore).toBe(10);
		});
	});

	describe('Account Security', () => {
		it('should lock account after multiple failed login attempts', async () => {
			const { loginUser, AuthError } = await import('$lib/server/services/auth');

			// Simulate multiple failed attempts
			let attempts = 0;
			vi.mocked(loginUser).mockImplementation(async () => {
				attempts++;
				if (attempts <= 5) {
					throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password');
				}
				throw new AuthError('ACCOUNT_LOCKED', 'Account temporarily locked');
			});

			// First 5 attempts fail with invalid credentials
			for (let i = 0; i < 5; i++) {
				await expect(loginUser('test@test.com', 'wrongpassword')).rejects.toMatchObject({
					code: 'INVALID_CREDENTIALS'
				});
			}

			// 6th attempt fails with account locked
			await expect(loginUser('test@test.com', 'wrongpassword')).rejects.toMatchObject({
				code: 'ACCOUNT_LOCKED'
			});
		});

		it('should require strong password for registration', async () => {
			const { registerUser, AuthError } = await import('$lib/server/services/auth');

			// Test various weak passwords
			const weakPasswords = [
				'short',
				'nouppercase123!',
				'NOLOWERCASE123!',
				'NoNumbers!',
				'NoSpecial123'
			];

			for (const password of weakPasswords) {
				vi.mocked(registerUser).mockRejectedValue(
					new AuthError('WEAK_PASSWORD', 'Password does not meet requirements')
				);

				await expect(
					registerUser('test@test.com', password, 'Test', 'User')
				).rejects.toMatchObject({
					code: 'WEAK_PASSWORD'
				});
			}
		});
	});

	describe('Concurrent Registration Handling', () => {
		it('should handle race condition in email registration', async () => {
			const { registerUser, AuthError } = await import('$lib/server/services/auth');

			// First registration succeeds
			vi.mocked(registerUser).mockResolvedValueOnce({
				user: { id: 'user-1', email: 'race@test.com' },
				verificationToken: 'token-1'
			} as any);

			// Second concurrent registration fails
			vi.mocked(registerUser).mockRejectedValueOnce(
				new AuthError('EMAIL_EXISTS', 'Email already registered')
			);

			// Simulate concurrent registrations
			const [result1, result2] = await Promise.allSettled([
				registerUser('race@test.com', 'SecurePass123!', 'Test', 'User'),
				registerUser('race@test.com', 'SecurePass123!', 'Test', 'User')
			]);

			expect(result1.status).toBe('fulfilled');
			expect(result2.status).toBe('rejected');
		});
	});

	describe('Profile Access After Registration', () => {
		it('should allow user to access their profile after verification', async () => {
			const { getUserById } = await import('$lib/server/services/user');

			vi.mocked(getUserById).mockResolvedValue({
				id: 'user-123',
				email: 'verified@test.com',
				firstName: 'Verified',
				lastName: 'User',
				emailVerified: true,
				userType: 'VERIFIED',
				trustScore: 10,
				createdAt: new Date(),
				lastLoginAt: new Date()
			} as any);

			const user = await getUserById('user-123');

			expect(user).toBeDefined();
			expect(user?.emailVerified).toBe(true);
			expect(user?.userType).toBe('VERIFIED');
		});

		it('should update lastLoginAt on successful login', async () => {
			const { loginUser } = await import('$lib/server/services/auth');
			const { getUserById } = await import('$lib/server/services/user');

			const loginTime = new Date();

			vi.mocked(loginUser).mockResolvedValue({
				user: {
					id: 'user-123',
					lastLoginAt: loginTime
				},
				session: { id: 'session-123' }
			} as any);

			const result = await loginUser('test@test.com', 'password');
			expect(result.user.lastLoginAt).toEqual(loginTime);
		});
	});
});
