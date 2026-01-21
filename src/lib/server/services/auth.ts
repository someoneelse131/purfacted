import { lucia, luciaRememberMe, type User, type Session } from '../auth';
import { db } from '../db';
import { verifyPassword } from '$lib/utils/crypto';
import { checkLoginRateLimit, resetLoginRateLimit } from '../rateLimit';
import { updateLastLogin, isUserBanned } from './user';

export interface LoginResult {
	user: User;
	session: Session;
	sessionCookie: string;
}

export interface AuthServiceError {
	code: 'INVALID_CREDENTIALS' | 'EMAIL_NOT_VERIFIED' | 'RATE_LIMITED' | 'USER_BANNED' | 'UNKNOWN_ERROR';
	message: string;
	retryAfterSeconds?: number;
}

/**
 * Authenticates a user and creates a session
 */
export async function login(
	email: string,
	password: string,
	rememberMe: boolean = false,
	ipAddress?: string
): Promise<LoginResult> {
	// Rate limit check using email or IP
	const rateLimitKey = ipAddress || email.toLowerCase();
	const rateLimitResult = await checkLoginRateLimit(rateLimitKey);

	if (!rateLimitResult.allowed) {
		const error: AuthServiceError = {
			code: 'RATE_LIMITED',
			message: `Too many login attempts. Please try again in ${Math.ceil(rateLimitResult.resetInSeconds / 60)} minutes.`,
			retryAfterSeconds: rateLimitResult.resetInSeconds
		};
		throw error;
	}

	// Find user
	const user = await db.user.findUnique({
		where: { email: email.toLowerCase() }
	});

	if (!user) {
		const error: AuthServiceError = {
			code: 'INVALID_CREDENTIALS',
			message: 'Invalid email or password'
		};
		throw error;
	}

	// Check password
	const validPassword = await verifyPassword(password, user.passwordHash);

	if (!validPassword) {
		const error: AuthServiceError = {
			code: 'INVALID_CREDENTIALS',
			message: 'Invalid email or password'
		};
		throw error;
	}

	// Check if email is verified
	if (!user.emailVerified) {
		const error: AuthServiceError = {
			code: 'EMAIL_NOT_VERIFIED',
			message: 'Please verify your email address before logging in'
		};
		throw error;
	}

	// Check if user is banned
	if (isUserBanned(user)) {
		const error: AuthServiceError = {
			code: 'USER_BANNED',
			message: user.banLevel >= 3
				? 'Your account has been permanently banned'
				: `Your account is temporarily banned until ${user.bannedUntil?.toLocaleDateString()}`
		};
		throw error;
	}

	// Reset rate limit on successful login
	await resetLoginRateLimit(rateLimitKey);

	// Create session with appropriate auth instance
	const authInstance = rememberMe ? luciaRememberMe : lucia;
	const session = await authInstance.createSession(user.id, {});
	const sessionCookie = authInstance.createSessionCookie(session.id).serialize();

	// Update last login time
	await updateLastLogin(user.id);

	// Return user object compatible with Lucia's User type
	const luciaUser: User = {
		id: user.id,
		email: user.email,
		firstName: user.firstName,
		lastName: user.lastName,
		emailVerified: user.emailVerified,
		userType: user.userType,
		trustScore: user.trustScore,
		banLevel: user.banLevel,
		bannedUntil: user.bannedUntil
	};

	return {
		user: luciaUser,
		session,
		sessionCookie
	};
}

/**
 * Logs out a user by invalidating their session
 */
export async function logout(sessionId: string): Promise<void> {
	await lucia.invalidateSession(sessionId);
}

/**
 * Validates a session and returns the user
 */
export async function validateSession(sessionId: string): Promise<{ user: User; session: Session } | null> {
	return lucia.validateSession(sessionId);
}

/**
 * Gets the session cookie name
 */
export function getSessionCookieName(): string {
	return lucia.sessionCookieName;
}

/**
 * Creates a blank session cookie (for logout)
 */
export function createBlankSessionCookie(): string {
	return lucia.createBlankSessionCookie().serialize();
}
