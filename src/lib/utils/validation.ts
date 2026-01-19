import { z } from 'zod';

// Get configuration from environment (with defaults)
const PASSWORD_MIN_LENGTH = parseInt(process.env.PASSWORD_MIN_LENGTH || '8', 10);
const PASSWORD_REQUIRE_NUMBER = process.env.PASSWORD_REQUIRE_NUMBER !== 'false';
const PASSWORD_REQUIRE_SPECIAL = process.env.PASSWORD_REQUIRE_SPECIAL !== 'false';
const FACT_TITLE_MAX_LENGTH = parseInt(process.env.FACT_TITLE_MAX_LENGTH || '200', 10);
const FACT_BODY_MAX_LENGTH = parseInt(process.env.FACT_BODY_MAX_LENGTH || '5000', 10);

/**
 * Validates password against requirements
 */
export function validatePassword(password: string): { valid: boolean; errors: string[] } {
	const errors: string[] = [];

	if (password.length < PASSWORD_MIN_LENGTH) {
		errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
	}

	if (PASSWORD_REQUIRE_NUMBER && !/\d/.test(password)) {
		errors.push('Password must contain at least one number');
	}

	if (PASSWORD_REQUIRE_SPECIAL && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
		errors.push('Password must contain at least one special character');
	}

	return {
		valid: errors.length === 0,
		errors
	};
}

/**
 * Validates email format
 */
export function validateEmail(email: string): boolean {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
}

/**
 * Validates name (first or last)
 */
export function validateName(name: string): { valid: boolean; error?: string } {
	if (!name || name.trim().length === 0) {
		return { valid: false, error: 'Name is required' };
	}

	if (name.trim().length < 2) {
		return { valid: false, error: 'Name must be at least 2 characters' };
	}

	if (name.trim().length > 100) {
		return { valid: false, error: 'Name must be less than 100 characters' };
	}

	// Only allow letters, spaces, hyphens, and apostrophes
	if (!/^[a-zA-Z\s\-']+$/.test(name.trim())) {
		return { valid: false, error: 'Name can only contain letters, spaces, hyphens, and apostrophes' };
	}

	return { valid: true };
}

// Zod schemas for validation
export const registrationSchema = z.object({
	email: z.string().email('Invalid email address'),
	firstName: z
		.string()
		.min(2, 'First name must be at least 2 characters')
		.max(100, 'First name must be less than 100 characters')
		.regex(/^[a-zA-Z\s\-']+$/, 'First name can only contain letters, spaces, hyphens, and apostrophes'),
	lastName: z
		.string()
		.min(2, 'Last name must be at least 2 characters')
		.max(100, 'Last name must be less than 100 characters')
		.regex(/^[a-zA-Z\s\-']+$/, 'Last name can only contain letters, spaces, hyphens, and apostrophes'),
	password: z
		.string()
		.min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
		.refine(
			(val) => !PASSWORD_REQUIRE_NUMBER || /\d/.test(val),
			'Password must contain at least one number'
		)
		.refine(
			(val) => !PASSWORD_REQUIRE_SPECIAL || /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(val),
			'Password must contain at least one special character'
		),
	captchaToken: z.string().optional()
});

export const loginSchema = z.object({
	email: z.string().email('Invalid email address'),
	password: z.string().min(1, 'Password is required'),
	rememberMe: z.boolean().optional().default(false)
});

export const passwordResetRequestSchema = z.object({
	email: z.string().email('Invalid email address')
});

export const passwordResetSchema = z.object({
	token: z.string().min(1, 'Token is required'),
	password: z
		.string()
		.min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
		.refine(
			(val) => !PASSWORD_REQUIRE_NUMBER || /\d/.test(val),
			'Password must contain at least one number'
		)
		.refine(
			(val) => !PASSWORD_REQUIRE_SPECIAL || /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(val),
			'Password must contain at least one special character'
		)
});

export const factSchema = z.object({
	title: z
		.string()
		.min(10, 'Title must be at least 10 characters')
		.max(FACT_TITLE_MAX_LENGTH, `Title must be less than ${FACT_TITLE_MAX_LENGTH} characters`),
	body: z
		.string()
		.min(50, 'Body must be at least 50 characters')
		.max(FACT_BODY_MAX_LENGTH, `Body must be less than ${FACT_BODY_MAX_LENGTH} characters`),
	categoryId: z.string().optional(),
	sources: z.array(
		z.object({
			url: z.string().url('Invalid source URL'),
			title: z.string().min(1, 'Source title is required'),
			type: z.enum(['PEER_REVIEWED', 'OFFICIAL', 'NEWS', 'COMPANY', 'BLOG', 'OTHER'])
		})
	).min(1, 'At least one source is required')
});

export type RegistrationInput = z.infer<typeof registrationSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;
export type FactInput = z.infer<typeof factSchema>;
