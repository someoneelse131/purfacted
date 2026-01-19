import { db } from '../db';
import { hashPassword, generateUrlSafeToken } from '$lib/utils/crypto';
import { validateNotDisposable } from '$lib/utils/disposableEmail';
import { registrationSchema, type RegistrationInput } from '$lib/utils/validation';
import type { User, EmailVerification } from '@prisma/client';

const TRUST_NEW_USER_START = parseInt(process.env.TRUST_NEW_USER_START || '10', 10);
const EMAIL_VERIFICATION_EXPIRY_HOURS = parseInt(process.env.EMAIL_VERIFICATION_EXPIRY_HOURS || '24', 10);

export interface RegistrationResult {
	user: User;
	verificationToken: string;
}

export interface UserServiceError {
	code: 'VALIDATION_ERROR' | 'EMAIL_EXISTS' | 'DISPOSABLE_EMAIL' | 'UNKNOWN_ERROR';
	message: string;
	details?: Record<string, string[]>;
}

/**
 * Registers a new user
 */
export async function registerUser(input: RegistrationInput): Promise<RegistrationResult> {
	// Validate input
	const validation = registrationSchema.safeParse(input);
	if (!validation.success) {
		const error: UserServiceError = {
			code: 'VALIDATION_ERROR',
			message: 'Validation failed',
			details: validation.error.flatten().fieldErrors as Record<string, string[]>
		};
		throw error;
	}

	const { email, firstName, lastName, password } = validation.data;

	// Check for disposable email
	await validateNotDisposable(email);

	// Check if email already exists
	const existingUser = await db.user.findUnique({
		where: { email: email.toLowerCase() }
	});

	if (existingUser) {
		const error: UserServiceError = {
			code: 'EMAIL_EXISTS',
			message: 'An account with this email already exists'
		};
		throw error;
	}

	// Hash password
	const passwordHash = await hashPassword(password);

	// Create user
	const user = await db.user.create({
		data: {
			email: email.toLowerCase(),
			firstName: firstName.trim(),
			lastName: lastName.trim(),
			passwordHash,
			trustScore: TRUST_NEW_USER_START,
			emailVerified: false
		}
	});

	// Create email verification token
	const verificationToken = generateUrlSafeToken(32);
	const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000);

	await db.emailVerification.create({
		data: {
			token: verificationToken,
			userId: user.id,
			expiresAt
		}
	});

	return { user, verificationToken };
}

/**
 * Verifies a user's email address
 */
export async function verifyEmail(token: string): Promise<User | null> {
	const verification = await db.emailVerification.findUnique({
		where: { token },
		include: { user: true }
	});

	if (!verification) {
		return null;
	}

	if (verification.expiresAt < new Date()) {
		// Token expired, delete it
		await db.emailVerification.delete({ where: { id: verification.id } });
		return null;
	}

	// Update user as verified
	const user = await db.user.update({
		where: { id: verification.userId },
		data: { emailVerified: true }
	});

	// Delete the verification token
	await db.emailVerification.delete({ where: { id: verification.id } });

	return user;
}

/**
 * Gets a user by ID
 */
export async function getUserById(id: string): Promise<User | null> {
	return db.user.findUnique({ where: { id } });
}

/**
 * Gets a user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
	return db.user.findUnique({ where: { email: email.toLowerCase() } });
}

/**
 * Updates user's last login time
 */
export async function updateLastLogin(userId: string): Promise<void> {
	await db.user.update({
		where: { id: userId },
		data: { lastLoginAt: new Date() }
	});
}

/**
 * Checks if a user is banned
 */
export function isUserBanned(user: User): boolean {
	if (user.banLevel === 0 || !user.bannedUntil) {
		return false;
	}

	// Check if ban is permanent (level 3) or still active
	if (user.banLevel >= 3) {
		return true;
	}

	return user.bannedUntil > new Date();
}
