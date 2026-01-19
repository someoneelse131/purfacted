import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isDisposableEmail, validateNotDisposable } from './disposableEmail';

describe('Disposable Email Checker', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn());
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe('isDisposableEmail', () => {
		it('should detect known disposable email domains', async () => {
			const result = await isDisposableEmail('test@mailinator.com');
			expect(result.isDisposable).toBe(true);
			expect(result.source).toBe('fallback');
		});

		it('should detect guerrillamail.com as disposable', async () => {
			const result = await isDisposableEmail('test@guerrillamail.com');
			expect(result.isDisposable).toBe(true);
		});

		it('should return false for valid domain when API succeeds', async () => {
			vi.mocked(fetch).mockResolvedValue({
				ok: true,
				json: async () => ({ disposable: 'false' })
			} as Response);

			const result = await isDisposableEmail('test@gmail.com');
			expect(result.isDisposable).toBe(false);
			expect(result.source).toBe('api');
		});

		it('should detect disposable via API response', async () => {
			vi.mocked(fetch).mockResolvedValue({
				ok: true,
				json: async () => ({ disposable: 'true' })
			} as Response);

			const result = await isDisposableEmail('test@someunknowndisposable.com');
			expect(result.isDisposable).toBe(true);
			expect(result.source).toBe('api');
		});

		it('should use fallback when API fails', async () => {
			vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

			const result = await isDisposableEmail('test@unknowndomain.com');
			expect(result.isDisposable).toBe(false);
			expect(result.source).toBe('fallback');
			expect(result.error).toBeDefined();
		});

		it('should handle invalid email format', async () => {
			const result = await isDisposableEmail('invalid-email');
			expect(result.source).toBe('fallback');
		});
	});

	describe('validateNotDisposable', () => {
		it('should not throw for valid email', async () => {
			vi.mocked(fetch).mockResolvedValue({
				ok: true,
				json: async () => ({ disposable: 'false' })
			} as Response);

			await expect(validateNotDisposable('test@gmail.com')).resolves.not.toThrow();
		});

		it('should throw for disposable email', async () => {
			await expect(validateNotDisposable('test@mailinator.com')).rejects.toThrow(
				'Disposable email addresses are not allowed'
			);
		});
	});
});
