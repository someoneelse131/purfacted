import { describe, expect, it } from 'vitest';
import { checkPassword } from './password-policy';

const POLICY = { minLength: 10, minScore: 3 };

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
