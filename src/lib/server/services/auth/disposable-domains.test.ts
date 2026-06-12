import { describe, expect, it } from 'vitest';
import { isDisposableEmail } from './disposable-domains';

describe('disposable email detection', () => {
	it('flags known disposable domains case-insensitively', () => {
		expect(isDisposableEmail('bot@mailinator.com')).toBe(true);
		expect(isDisposableEmail('bot@MAILINATOR.COM')).toBe(true);
		expect(isDisposableEmail('x@yopmail.com')).toBe(true);
	});

	it('allows regular providers', () => {
		expect(isDisposableEmail('user@gmail.com')).toBe(false);
		expect(isDisposableEmail('user@chiaruzzi.ch')).toBe(false);
	});

	it('handles malformed input', () => {
		expect(isDisposableEmail('no-at-sign')).toBe(false);
		expect(isDisposableEmail('')).toBe(false);
	});
});
