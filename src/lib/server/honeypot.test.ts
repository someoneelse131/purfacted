import { describe, expect, it } from 'vitest';
import { honeypotTriggered } from './honeypot';

describe('honeypot (R19)', () => {
	it('triggers when the hidden field is filled', () => {
		const form = new FormData();
		form.set('website', 'https://spam.example');
		expect(honeypotTriggered(form)).toBe(true);
	});

	it('passes when empty or absent', () => {
		const empty = new FormData();
		expect(honeypotTriggered(empty)).toBe(false);
		empty.set('website', '');
		expect(honeypotTriggered(empty)).toBe(false);
	});
});
