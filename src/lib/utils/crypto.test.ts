import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, generateToken, generateUrlSafeToken, sha256 } from './crypto';

describe('Crypto Utilities', () => {
	describe('hashPassword', () => {
		it('should return a hash in the correct format', async () => {
			const hash = await hashPassword('testPassword');
			expect(hash).toMatch(/^[a-f0-9]+:[a-f0-9]+$/);
		});

		it('should produce different hashes for the same password', async () => {
			const hash1 = await hashPassword('testPassword');
			const hash2 = await hashPassword('testPassword');
			expect(hash1).not.toBe(hash2);
		});
	});

	describe('verifyPassword', () => {
		it('should verify correct password', async () => {
			const hash = await hashPassword('testPassword');
			const isValid = await verifyPassword('testPassword', hash);
			expect(isValid).toBe(true);
		});

		it('should reject incorrect password', async () => {
			const hash = await hashPassword('testPassword');
			const isValid = await verifyPassword('wrongPassword', hash);
			expect(isValid).toBe(false);
		});

		it('should return false for invalid hash format', async () => {
			const isValid = await verifyPassword('testPassword', 'invalid-hash');
			expect(isValid).toBe(false);
		});
	});

	describe('generateToken', () => {
		it('should generate a hex token of specified length', () => {
			const token = generateToken(16);
			expect(token).toHaveLength(32); // 16 bytes = 32 hex chars
		});

		it('should generate unique tokens', () => {
			const token1 = generateToken();
			const token2 = generateToken();
			expect(token1).not.toBe(token2);
		});

		it('should use default length of 32 bytes (64 hex chars)', () => {
			const token = generateToken();
			expect(token).toHaveLength(64);
		});
	});

	describe('generateUrlSafeToken', () => {
		it('should generate a URL-safe base64 token', () => {
			const token = generateUrlSafeToken();
			// URL-safe base64 should not contain +, /, or =
			expect(token).not.toMatch(/[+/=]/);
		});

		it('should generate unique tokens', () => {
			const token1 = generateUrlSafeToken();
			const token2 = generateUrlSafeToken();
			expect(token1).not.toBe(token2);
		});
	});

	describe('sha256', () => {
		it('should produce consistent hash for same input', () => {
			const hash1 = sha256('test');
			const hash2 = sha256('test');
			expect(hash1).toBe(hash2);
		});

		it('should produce different hash for different input', () => {
			const hash1 = sha256('test1');
			const hash2 = sha256('test2');
			expect(hash1).not.toBe(hash2);
		});

		it('should produce 64 character hex hash', () => {
			const hash = sha256('test');
			expect(hash).toHaveLength(64);
			expect(hash).toMatch(/^[a-f0-9]+$/);
		});
	});
});
