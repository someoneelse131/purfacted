import { describe, expect, it } from 'vitest';
import {
	EXPERT_CREDENTIAL_MIMES,
	extensionForMime,
	validateCredential,
	validateField
} from './experts';
import { badgeMeta, expertBadgeKey } from './badges';

describe('validateField', () => {
	it('trims and accepts a field within bounds', () => {
		const r = validateField('  Climate science  ', 3, 120);
		expect(r).toEqual({ ok: true, value: 'Climate science' });
	});

	it('rejects a too-short field', () => {
		expect(validateField('ab', 3, 120).ok).toBe(false);
	});

	it('rejects a too-long field', () => {
		expect(validateField('x'.repeat(121), 3, 120).ok).toBe(false);
	});
});

describe('validateCredential', () => {
	it('accepts an allowed mime within the size limit', () => {
		expect(validateCredential('application/pdf', 1000, 5_000_000)).toBeNull();
	});

	it('rejects a disallowed mime', () => {
		expect(validateCredential('text/html', 1000, 5_000_000)).toMatch(/PDF or image/);
	});

	it('rejects an empty file', () => {
		expect(validateCredential('image/png', 0, 5_000_000)).toMatch(/empty/);
	});

	it('rejects a file over the size limit', () => {
		expect(validateCredential('image/png', 6_000_000, 5_000_000)).toMatch(/at most 5 MB/);
	});
});

describe('extensionForMime', () => {
	it('maps every allowed mime to a known extension', () => {
		for (const mime of EXPERT_CREDENTIAL_MIMES) {
			expect(extensionForMime(mime)).not.toBe('bin');
		}
	});

	it('falls back to bin for an unknown mime', () => {
		expect(extensionForMime('application/x-unknown')).toBe('bin');
	});
});

describe('expert badge meta', () => {
	it('encodes the field in the key and decodes a display name', () => {
		const key = expertBadgeKey('Epidemiology');
		expect(key).toBe('expert:Epidemiology');
		expect(badgeMeta(key)).toEqual({
			name: 'Expert: Epidemiology',
			description: 'Verified domain expert.'
		});
	});

	it('still resolves built-in badge keys', () => {
		expect(badgeMeta('first_verdict')?.name).toBe('First Verdict');
	});
});
