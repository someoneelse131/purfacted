import { describe, expect, it } from 'vitest';
import { slugify } from './categories';

describe('slugify', () => {
	it('lowercases and hyphenates', () => {
		expect(slugify('Health & Medicine')).toBe('health-medicine');
		expect(slugify('  Space   Travel ')).toBe('space-travel');
	});

	it('strips diacritics', () => {
		expect(slugify('Économie française')).toBe('economie-francaise');
	});

	it('returns empty string for unusable names', () => {
		expect(slugify('!!!')).toBe('');
	});
});
