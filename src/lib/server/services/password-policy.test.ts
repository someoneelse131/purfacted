import { describe, expect, it } from 'vitest';
import { checkPassword, passwordConfirmationError } from './password-policy';

const POLICY = { minLength: 10, minScore: 3 };

describe('passwordConfirmationError', () => {
	it('returns null when the confirmation matches', () => {
		expect(passwordConfirmationError('correct horse battery', 'correct horse battery')).toBeNull();
	});

	it('returns an error when the confirmation differs', () => {
		expect(passwordConfirmationError('correct horse battery', 'correct horse')).toBe(
			'Passwords do not match.'
		);
	});

	it('is case- and whitespace-sensitive (exact match required)', () => {
		expect(passwordConfirmationError('Secret123', 'secret123')).not.toBeNull();
		expect(passwordConfirmationError('pw ', 'pw')).not.toBeNull();
	});
});

describe('password policy', () => {
	it('rejects passwords below the minimum length', () => {
		const result = checkPassword('Short1!', POLICY);
		expect(result.ok).toBe(false);
		expect(result.error).toContain('10');
	});

	it('rejects long but guessable passwords', () => {
		expect(checkPassword('password12345', POLICY).ok).toBe(false);
		expect(checkPassword('qwertyuiop123', POLICY).ok).toBe(false);
	});

	it('rejects passwords built from user inputs', () => {
		const result = checkPassword('alice@example.com', POLICY, ['alice', 'alice@example.com']);
		expect(result.ok).toBe(false);
	});

	it('accepts strong passwords', () => {
		expect(checkPassword('correct horse battery staple', POLICY).ok).toBe(true);
		expect(checkPassword('kJ8#mQ2!pXv9zL', POLICY).ok).toBe(true);
	});
});
