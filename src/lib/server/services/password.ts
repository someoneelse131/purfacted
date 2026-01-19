import { db } from '../db';
import { hashPassword, verifyPassword, generateUrlSafeToken } from '$lib/utils/crypto';
import { validatePassword } from '$lib/utils/validation';
import { checkRateLimit } from '../rateLimit';

const PASSWORD_RESET_EXPIRY_HOURS = parseInt(process.env.PASSWORD_RESET_EXPIRY_HOURS || '1', 10);
const PASSWORD_RESET_MAX_REQUESTS_PER_HOUR = parseInt(process.env.PASSWORD_RESET_MAX_REQUESTS_PER_HOUR || '3', 10);

export interface PasswordServiceError {
	code: 'USER_NOT_FOUND' | 'INVALID_TOKEN' | 'TOKEN_EXPIRED' | 'RATE_LIMITED' | 'INVALID_PASSWORD' | 'SAME_PASSWORD' | 'WRONG_CURRENT_PASSWORD' | 'VALIDATION_ERROR';
	message: string;
	retryAfterSeconds?: number;
}

/**
 * Initiates a password reset request
 */
export async function requestPasswordReset(email: string): Promise<string | null> {
	// Rate limit check
	const rateLimitResult = await checkRateLimit(
		email.toLowerCase(),
		'password_reset',
		PASSWORD_RESET_MAX_REQUESTS_PER_HOUR,
		3600 // 1 hour
	);

	if (!rateLimitResult.allowed) {
		const error: PasswordServiceError = {
			code: 'RATE_LIMITED',
			message: `Too many password reset requests. Please try again in ${Math.ceil(rateLimitResult.resetInSeconds / 60)} minutes.`,
			retryAfterSeconds: rateLimitResult.resetInSeconds
		};
		throw error;
	}

	// Find user
	const user = await db.user.findUnique({
		where: { email: email.toLowerCase() }
	});

	// Don't reveal if user exists or not for security
	if (!user) {
		return null;
	}

	// Delete any existing reset tokens for this user
	await db.passwordReset.deleteMany({
		where: { userId: user.id }
	});

	// Create new reset token
	const token = generateUrlSafeToken(32);
	const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_HOURS * 60 * 60 * 1000);

	await db.passwordReset.create({
		data: {
			token,
			userId: user.id,
			expiresAt
		}
	});

	return token;
}

/**
 * Resets password using a reset token
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
	// Validate password
	const passwordValidation = validatePassword(newPassword);
	if (!passwordValidation.valid) {
		const error: PasswordServiceError = {
			code: 'VALIDATION_ERROR',
			message: passwordValidation.errors.join('. ')
		};
		throw error;
	}

	// Find reset token
	const resetRecord = await db.passwordReset.findUnique({
		where: { token },
		include: { user: true }
	});

	if (!resetRecord) {
		const error: PasswordServiceError = {
			code: 'INVALID_TOKEN',
			message: 'Invalid or expired reset token'
		};
		throw error;
	}

	// Check if token has expired
	if (resetRecord.expiresAt < new Date()) {
		// Delete expired token
		await db.passwordReset.delete({ where: { id: resetRecord.id } });

		const error: PasswordServiceError = {
			code: 'TOKEN_EXPIRED',
			message: 'Password reset link has expired. Please request a new one.'
		};
		throw error;
	}

	// Check if new password is same as current
	const isSamePassword = await verifyPassword(newPassword, resetRecord.user.passwordHash);
	if (isSamePassword) {
		const error: PasswordServiceError = {
			code: 'SAME_PASSWORD',
			message: 'New password must be different from your current password'
		};
		throw error;
	}

	// Hash new password
	const newPasswordHash = await hashPassword(newPassword);

	// Update password
	await db.user.update({
		where: { id: resetRecord.userId },
		data: { passwordHash: newPasswordHash }
	});

	// Delete the reset token
	await db.passwordReset.delete({ where: { id: resetRecord.id } });

	// Invalidate all existing sessions for this user
	await db.session.deleteMany({
		where: { userId: resetRecord.userId }
	});
}

/**
 * Changes password for a logged-in user
 */
export async function changePassword(
	userId: string,
	currentPassword: string,
	newPassword: string
): Promise<void> {
	// Get user
	const user = await db.user.findUnique({
		where: { id: userId }
	});

	if (!user) {
		const error: PasswordServiceError = {
			code: 'USER_NOT_FOUND',
			message: 'User not found'
		};
		throw error;
	}

	// Verify current password
	const isValidCurrentPassword = await verifyPassword(currentPassword, user.passwordHash);
	if (!isValidCurrentPassword) {
		const error: PasswordServiceError = {
			code: 'WRONG_CURRENT_PASSWORD',
			message: 'Current password is incorrect'
		};
		throw error;
	}

	// Validate new password
	const passwordValidation = validatePassword(newPassword);
	if (!passwordValidation.valid) {
		const error: PasswordServiceError = {
			code: 'VALIDATION_ERROR',
			message: passwordValidation.errors.join('. ')
		};
		throw error;
	}

	// Check if new password is same as current
	if (currentPassword === newPassword) {
		const error: PasswordServiceError = {
			code: 'SAME_PASSWORD',
			message: 'New password must be different from your current password'
		};
		throw error;
	}

	// Hash and update password
	const newPasswordHash = await hashPassword(newPassword);

	await db.user.update({
		where: { id: userId },
		data: { passwordHash: newPasswordHash }
	});
}
