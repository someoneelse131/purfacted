import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Lucia auth
const mockCreateSession = vi.fn();
const mockCreateSessionCookie = vi.fn();
const mockInvalidateSession = vi.fn();
const mockValidateSession = vi.fn();

vi.mock('../auth', () => ({
	lucia: {
		createSession: mockCreateSession,
		createSessionCookie: mockCreateSessionCookie,
		invalidateSession: mockInvalidateSession,
		validateSession: mockValidateSession,
		sessionCookieName: 'auth_session',
		createBlankSessionCookie: vi.fn().mockReturnValue({ serialize: () => 'blank_cookie' })
	},
	luciaRememberMe: {
		createSession: mockCreateSession,
		createSessionCookie: mockCreateSessionCookie
	}
}));

// Mock database
vi.mock('../db', () => ({
	db: {
		user: {
			findUnique: vi.fn(),
			update: vi.fn()
		}
	}
}));

// Mock crypto
vi.mock('$lib/utils/crypto', () => ({
	verifyPassword: vi.fn()
}));

// Mock rate limiter
vi.mock('../rateLimit', () => ({
	checkLoginRateLimit: vi.fn(),
	resetLoginRateLimit: vi.fn()
}));

// Mock user service
vi.mock('./user', () => ({
	updateLastLogin: vi.fn(),
	isUserBanned: vi.fn()
}));

describe('T7: Auth Service', () => {
	beforeEach(() => {
		vi.clearAllMocks();

		// Default mock implementations
		mockCreateSession.mockResolvedValue({
			id: 'session-123',
			userId: 'user-123',
			expiresAt: new Date(Date.now() + 86400000)
		});
		mockCreateSessionCookie.mockReturnValue({
			serialize: () => 'session_cookie_value'
		});
	});

	describe('login', () => {
		const mockUser = {
			id: 'user-123',
			email: 'test@example.com',
			firstName: 'John',
			lastName: 'Doe',
			passwordHash: 'hashed_password',
			emailVerified: true,
			userType: 'VERIFIED',
			trustScore: 10,
			banLevel: 0,
			bannedUntil: null
		};

		it('should login successfully with valid credentials', async () => {
			const { db } = await import('../db');
			const { verifyPassword } = await import('$lib/utils/crypto');
			const { checkLoginRateLimit, resetLoginRateLimit } = await import('../rateLimit');
			const { isUserBanned, updateLastLogin } = await import('./user');
			const { login } = await import('./auth');

			vi.mocked(checkLoginRateLimit).mockResolvedValue({
				allowed: true,
				remaining: 4,
				resetInSeconds: 900
			});
			vi.mocked(db.user.findUnique).mockResolvedValue(mockUser as any);
			vi.mocked(verifyPassword).mockResolvedValue(true);
			vi.mocked(isUserBanned).mockReturnValue(false);

			const result = await login('test@example.com', 'SecurePass123!');

			expect(result.user.email).toBe('test@example.com');
			expect(result.session).toBeDefined();
			expect(result.sessionCookie).toBe('session_cookie_value');
			expect(updateLastLogin).toHaveBeenCalledWith('user-123');
			expect(resetLoginRateLimit).toHaveBeenCalled();
		});

		it('should lowercase email for lookup', async () => {
			const { db } = await import('../db');
			const { verifyPassword } = await import('$lib/utils/crypto');
			const { checkLoginRateLimit } = await import('../rateLimit');
			const { isUserBanned } = await import('./user');
			const { login } = await import('./auth');

			vi.mocked(checkLoginRateLimit).mockResolvedValue({
				allowed: true,
				remaining: 4,
				resetInSeconds: 900
			});
			vi.mocked(db.user.findUnique).mockResolvedValue(mockUser as any);
			vi.mocked(verifyPassword).mockResolvedValue(true);
			vi.mocked(isUserBanned).mockReturnValue(false);

			await login('TEST@EXAMPLE.COM', 'SecurePass123!');

			expect(db.user.findUnique).toHaveBeenCalledWith({
				where: { email: 'test@example.com' }
			});
		});

		it('should throw error for invalid email (user not found)', async () => {
			const { db } = await import('../db');
			const { checkLoginRateLimit } = await import('../rateLimit');
			const { login } = await import('./auth');

			vi.mocked(checkLoginRateLimit).mockResolvedValue({
				allowed: true,
				remaining: 4,
				resetInSeconds: 900
			});
			vi.mocked(db.user.findUnique).mockResolvedValue(null);

			await expect(
				login('nonexistent@example.com', 'password')
			).rejects.toMatchObject({
				code: 'INVALID_CREDENTIALS',
				message: 'Invalid email or password'
			});
		});

		it('should throw error for invalid password', async () => {
			const { db } = await import('../db');
			const { verifyPassword } = await import('$lib/utils/crypto');
			const { checkLoginRateLimit } = await import('../rateLimit');
			const { login } = await import('./auth');

			vi.mocked(checkLoginRateLimit).mockResolvedValue({
				allowed: true,
				remaining: 4,
				resetInSeconds: 900
			});
			vi.mocked(db.user.findUnique).mockResolvedValue(mockUser as any);
			vi.mocked(verifyPassword).mockResolvedValue(false);

			await expect(
				login('test@example.com', 'wrongpassword')
			).rejects.toMatchObject({
				code: 'INVALID_CREDENTIALS',
				message: 'Invalid email or password'
			});
		});

		it('should throw error for unverified email', async () => {
			const { db } = await import('../db');
			const { verifyPassword } = await import('$lib/utils/crypto');
			const { checkLoginRateLimit } = await import('../rateLimit');
			const { login } = await import('./auth');

			vi.mocked(checkLoginRateLimit).mockResolvedValue({
				allowed: true,
				remaining: 4,
				resetInSeconds: 900
			});
			vi.mocked(db.user.findUnique).mockResolvedValue({
				...mockUser,
				emailVerified: false
			} as any);
			vi.mocked(verifyPassword).mockResolvedValue(true);

			await expect(
				login('test@example.com', 'SecurePass123!')
			).rejects.toMatchObject({
				code: 'EMAIL_NOT_VERIFIED',
				message: 'Please verify your email address before logging in'
			});
		});

		it('should throw error for banned user', async () => {
			const { db } = await import('../db');
			const { verifyPassword } = await import('$lib/utils/crypto');
			const { checkLoginRateLimit } = await import('../rateLimit');
			const { isUserBanned } = await import('./user');
			const { login } = await import('./auth');

			vi.mocked(checkLoginRateLimit).mockResolvedValue({
				allowed: true,
				remaining: 4,
				resetInSeconds: 900
			});
			vi.mocked(db.user.findUnique).mockResolvedValue({
				...mockUser,
				banLevel: 1,
				bannedUntil: new Date(Date.now() + 86400000)
			} as any);
			vi.mocked(verifyPassword).mockResolvedValue(true);
			vi.mocked(isUserBanned).mockReturnValue(true);

			await expect(
				login('test@example.com', 'SecurePass123!')
			).rejects.toMatchObject({
				code: 'USER_BANNED'
			});
		});

		it('should throw error for permanently banned user', async () => {
			const { db } = await import('../db');
			const { verifyPassword } = await import('$lib/utils/crypto');
			const { checkLoginRateLimit } = await import('../rateLimit');
			const { isUserBanned } = await import('./user');
			const { login } = await import('./auth');

			vi.mocked(checkLoginRateLimit).mockResolvedValue({
				allowed: true,
				remaining: 4,
				resetInSeconds: 900
			});
			vi.mocked(db.user.findUnique).mockResolvedValue({
				...mockUser,
				banLevel: 3,
				bannedUntil: new Date(Date.now() + 86400000 * 365 * 100)
			} as any);
			vi.mocked(verifyPassword).mockResolvedValue(true);
			vi.mocked(isUserBanned).mockReturnValue(true);

			await expect(
				login('test@example.com', 'SecurePass123!')
			).rejects.toMatchObject({
				code: 'USER_BANNED',
				message: expect.stringContaining('permanently banned')
			});
		});

		it('should throw error when rate limited', async () => {
			const { checkLoginRateLimit } = await import('../rateLimit');
			const { login } = await import('./auth');

			vi.mocked(checkLoginRateLimit).mockResolvedValue({
				allowed: false,
				remaining: 0,
				resetInSeconds: 600
			});

			await expect(
				login('test@example.com', 'password')
			).rejects.toMatchObject({
				code: 'RATE_LIMITED',
				retryAfterSeconds: 600
			});
		});

		it('should reset rate limit on successful login', async () => {
			const { db } = await import('../db');
			const { verifyPassword } = await import('$lib/utils/crypto');
			const { checkLoginRateLimit, resetLoginRateLimit } = await import('../rateLimit');
			const { isUserBanned } = await import('./user');
			const { login } = await import('./auth');

			vi.mocked(checkLoginRateLimit).mockResolvedValue({
				allowed: true,
				remaining: 4,
				resetInSeconds: 900
			});
			vi.mocked(db.user.findUnique).mockResolvedValue(mockUser as any);
			vi.mocked(verifyPassword).mockResolvedValue(true);
			vi.mocked(isUserBanned).mockReturnValue(false);

			await login('test@example.com', 'SecurePass123!', false, '192.168.1.1');

			expect(resetLoginRateLimit).toHaveBeenCalledWith('192.168.1.1');
		});

		it('should use email as rate limit key when no IP provided', async () => {
			const { db } = await import('../db');
			const { verifyPassword } = await import('$lib/utils/crypto');
			const { checkLoginRateLimit, resetLoginRateLimit } = await import('../rateLimit');
			const { isUserBanned } = await import('./user');
			const { login } = await import('./auth');

			vi.mocked(checkLoginRateLimit).mockResolvedValue({
				allowed: true,
				remaining: 4,
				resetInSeconds: 900
			});
			vi.mocked(db.user.findUnique).mockResolvedValue(mockUser as any);
			vi.mocked(verifyPassword).mockResolvedValue(true);
			vi.mocked(isUserBanned).mockReturnValue(false);

			await login('test@example.com', 'SecurePass123!');

			expect(checkLoginRateLimit).toHaveBeenCalledWith('test@example.com');
		});
	});

	describe('logout', () => {
		it('should invalidate session', async () => {
			const { logout } = await import('./auth');

			await logout('session-123');

			expect(mockInvalidateSession).toHaveBeenCalledWith('session-123');
		});
	});

	describe('validateSession', () => {
		it('should return user and session for valid session', async () => {
			const { validateSession } = await import('./auth');

			const mockResult = {
				user: { id: 'user-123', email: 'test@example.com' },
				session: { id: 'session-123', userId: 'user-123' }
			};
			mockValidateSession.mockResolvedValue(mockResult);

			const result = await validateSession('session-123');

			expect(result).toEqual(mockResult);
			expect(mockValidateSession).toHaveBeenCalledWith('session-123');
		});

		it('should return null for invalid session', async () => {
			const { validateSession } = await import('./auth');

			mockValidateSession.mockResolvedValue(null);

			const result = await validateSession('invalid-session');

			expect(result).toBeNull();
		});
	});

	describe('getSessionCookieName', () => {
		it('should return correct cookie name', async () => {
			const { getSessionCookieName } = await import('./auth');

			const name = getSessionCookieName();

			expect(name).toBe('auth_session');
		});
	});

	describe('createBlankSessionCookie', () => {
		it('should return blank cookie for logout', async () => {
			const { lucia } = await import('../auth');
			const { createBlankSessionCookie } = await import('./auth');

			// Ensure mock is properly set up
			vi.mocked(lucia.createBlankSessionCookie).mockReturnValue({
				serialize: () => 'blank_cookie'
			} as any);

			const cookie = createBlankSessionCookie();

			expect(cookie).toBe('blank_cookie');
		});
	});
});
