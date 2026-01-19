import { describe, it, expect } from 'vitest';
import { validatePassword, validateEmail, validateName, registrationSchema } from './validation';

describe('R3: Authentication - Registration Validation', () => {
	describe('validatePassword', () => {
		it('should accept a valid password', () => {
			const result = validatePassword('Password1!');
			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it('should reject password shorter than 8 characters', () => {
			const result = validatePassword('Pass1!');
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Password must be at least 8 characters');
		});

		it('should reject password without number', () => {
			const result = validatePassword('Password!');
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Password must contain at least one number');
		});

		it('should reject password without special character', () => {
			const result = validatePassword('Password1');
			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Password must contain at least one special character');
		});

		it('should return multiple errors for multiple violations', () => {
			const result = validatePassword('pass');
			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(1);
		});
	});

	describe('validateEmail', () => {
		it('should accept valid email', () => {
			expect(validateEmail('test@example.com')).toBe(true);
		});

		it('should accept email with subdomain', () => {
			expect(validateEmail('test@mail.example.com')).toBe(true);
		});

		it('should reject email without @', () => {
			expect(validateEmail('testexample.com')).toBe(false);
		});

		it('should reject email without domain', () => {
			expect(validateEmail('test@')).toBe(false);
		});

		it('should reject email with spaces', () => {
			expect(validateEmail('test @example.com')).toBe(false);
		});
	});

	describe('validateName', () => {
		it('should accept valid name', () => {
			const result = validateName('John');
			expect(result.valid).toBe(true);
		});

		it('should accept name with hyphen', () => {
			const result = validateName('Mary-Jane');
			expect(result.valid).toBe(true);
		});

		it('should accept name with apostrophe', () => {
			const result = validateName("O'Connor");
			expect(result.valid).toBe(true);
		});

		it('should reject empty name', () => {
			const result = validateName('');
			expect(result.valid).toBe(false);
		});

		it('should reject name with numbers', () => {
			const result = validateName('John123');
			expect(result.valid).toBe(false);
		});

		it('should reject name shorter than 2 characters', () => {
			const result = validateName('J');
			expect(result.valid).toBe(false);
		});
	});

	describe('registrationSchema', () => {
		it('should validate correct registration data', () => {
			const result = registrationSchema.safeParse({
				email: 'test@example.com',
				firstName: 'John',
				lastName: 'Doe',
				password: 'Password1!'
			});
			expect(result.success).toBe(true);
		});

		it('should reject invalid email', () => {
			const result = registrationSchema.safeParse({
				email: 'invalid-email',
				firstName: 'John',
				lastName: 'Doe',
				password: 'Password1!'
			});
			expect(result.success).toBe(false);
		});

		it('should reject short first name', () => {
			const result = registrationSchema.safeParse({
				email: 'test@example.com',
				firstName: 'J',
				lastName: 'Doe',
				password: 'Password1!'
			});
			expect(result.success).toBe(false);
		});

		it('should reject weak password', () => {
			const result = registrationSchema.safeParse({
				email: 'test@example.com',
				firstName: 'John',
				lastName: 'Doe',
				password: 'weak'
			});
			expect(result.success).toBe(false);
		});
	});
});
