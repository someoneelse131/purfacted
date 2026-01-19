import { db } from '../db';
import { generateUrlSafeToken } from '$lib/utils/crypto';
import { validateName, validateEmail } from '$lib/utils/validation';
import { sendVerificationEmail } from '../mail';
import type { User, NotificationPreference, NotificationType } from '@prisma/client';

const EMAIL_VERIFICATION_EXPIRY_HOURS = parseInt(process.env.EMAIL_VERIFICATION_EXPIRY_HOURS || '24', 10);

export interface ProfileServiceError {
	code: 'USER_NOT_FOUND' | 'VALIDATION_ERROR' | 'EMAIL_EXISTS' | 'SAME_EMAIL';
	message: string;
}

export interface ProfileUpdateInput {
	firstName?: string;
	lastName?: string;
}

export interface NotificationPreferenceInput {
	type: NotificationType;
	email: boolean;
	inApp: boolean;
}

/**
 * Get user profile by ID
 */
export async function getProfile(userId: string): Promise<User | null> {
	return db.user.findFirst({
		where: {
			id: userId,
			deletedAt: null
		}
	});
}

/**
 * Update user profile (name only - email change is separate)
 */
export async function updateProfile(userId: string, input: ProfileUpdateInput): Promise<User> {
	const user = await db.user.findFirst({
		where: { id: userId, deletedAt: null }
	});

	if (!user) {
		const error: ProfileServiceError = {
			code: 'USER_NOT_FOUND',
			message: 'User not found'
		};
		throw error;
	}

	// Validate inputs if provided
	if (input.firstName) {
		const firstNameValidation = validateName(input.firstName);
		if (!firstNameValidation.valid) {
			const error: ProfileServiceError = {
				code: 'VALIDATION_ERROR',
				message: firstNameValidation.error || 'Invalid first name'
			};
			throw error;
		}
	}

	if (input.lastName) {
		const lastNameValidation = validateName(input.lastName);
		if (!lastNameValidation.valid) {
			const error: ProfileServiceError = {
				code: 'VALIDATION_ERROR',
				message: lastNameValidation.error || 'Invalid last name'
			};
			throw error;
		}
	}

	return db.user.update({
		where: { id: userId },
		data: {
			...(input.firstName && { firstName: input.firstName.trim() }),
			...(input.lastName && { lastName: input.lastName.trim() })
		}
	});
}

/**
 * Request email change (sends verification email to new address)
 */
export async function requestEmailChange(userId: string, newEmail: string): Promise<void> {
	const user = await db.user.findFirst({
		where: { id: userId, deletedAt: null }
	});

	if (!user) {
		const error: ProfileServiceError = {
			code: 'USER_NOT_FOUND',
			message: 'User not found'
		};
		throw error;
	}

	// Validate email
	if (!validateEmail(newEmail)) {
		const error: ProfileServiceError = {
			code: 'VALIDATION_ERROR',
			message: 'Invalid email address'
		};
		throw error;
	}

	const normalizedEmail = newEmail.toLowerCase();

	// Check if same as current email
	if (normalizedEmail === user.email) {
		const error: ProfileServiceError = {
			code: 'SAME_EMAIL',
			message: 'New email is the same as your current email'
		};
		throw error;
	}

	// Check if email already exists
	const existingUser = await db.user.findUnique({
		where: { email: normalizedEmail }
	});

	if (existingUser) {
		const error: ProfileServiceError = {
			code: 'EMAIL_EXISTS',
			message: 'This email address is already in use'
		};
		throw error;
	}

	// Store pending email and create verification token
	const verificationToken = generateUrlSafeToken(32);
	const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000);

	await db.user.update({
		where: { id: userId },
		data: { pendingEmail: normalizedEmail }
	});

	// Delete any existing email verifications for this user
	await db.emailVerification.deleteMany({
		where: { userId }
	});

	// Create new verification record
	await db.emailVerification.create({
		data: {
			token: verificationToken,
			userId,
			expiresAt
		}
	});

	// Send verification email to new address
	await sendVerificationEmail(normalizedEmail, user.firstName, verificationToken);
}

/**
 * Confirm email change (called when user clicks verification link)
 */
export async function confirmEmailChange(token: string): Promise<User | null> {
	const verification = await db.emailVerification.findUnique({
		where: { token },
		include: { user: true }
	});

	if (!verification || verification.expiresAt < new Date()) {
		if (verification) {
			await db.emailVerification.delete({ where: { id: verification.id } });
		}
		return null;
	}

	const { user } = verification;

	// Check if user has a pending email
	if (!user.pendingEmail) {
		await db.emailVerification.delete({ where: { id: verification.id } });
		return null;
	}

	// Update email and clear pending
	const updatedUser = await db.user.update({
		where: { id: user.id },
		data: {
			email: user.pendingEmail,
			pendingEmail: null
		}
	});

	// Delete verification token
	await db.emailVerification.delete({ where: { id: verification.id } });

	return updatedUser;
}

/**
 * Soft delete user account
 */
export async function deleteAccount(userId: string): Promise<void> {
	const user = await db.user.findFirst({
		where: { id: userId, deletedAt: null }
	});

	if (!user) {
		const error: ProfileServiceError = {
			code: 'USER_NOT_FOUND',
			message: 'User not found'
		};
		throw error;
	}

	// Soft delete: set deletedAt timestamp
	await db.user.update({
		where: { id: userId },
		data: { deletedAt: new Date() }
	});

	// Invalidate all sessions
	await db.session.deleteMany({
		where: { userId }
	});
}

/**
 * Get notification preferences for a user
 */
export async function getNotificationPreferences(userId: string): Promise<NotificationPreference[]> {
	return db.notificationPreference.findMany({
		where: { userId }
	});
}

/**
 * Update notification preferences
 */
export async function updateNotificationPreference(
	userId: string,
	preference: NotificationPreferenceInput
): Promise<NotificationPreference> {
	return db.notificationPreference.upsert({
		where: {
			userId_type: {
				userId,
				type: preference.type
			}
		},
		create: {
			userId,
			type: preference.type,
			email: preference.email,
			inApp: preference.inApp
		},
		update: {
			email: preference.email,
			inApp: preference.inApp
		}
	});
}

/**
 * Set all notification preferences at once
 */
export async function setAllNotificationPreferences(
	userId: string,
	emailEnabled: boolean,
	inAppEnabled: boolean
): Promise<void> {
	const notificationTypes: NotificationType[] = [
		'TRUST_CHANGE',
		'FACT_REPLY',
		'FACT_DISPUTED',
		'VETO_RECEIVED',
		'VERIFICATION_RESULT',
		'ORG_COMMENT',
		'DEBATE_REQUEST',
		'DEBATE_PUBLISHED',
		'MODERATOR_STATUS',
		'FACT_STATUS'
	];

	for (const type of notificationTypes) {
		await updateNotificationPreference(userId, {
			type,
			email: emailEnabled,
			inApp: inAppEnabled
		});
	}
}
