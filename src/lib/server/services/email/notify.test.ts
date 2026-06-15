import { describe, expect, it } from 'vitest';
import {
	EMAIL_BATCH_TYPES,
	buildBatchEmail,
	isEmailBatchType,
	isTypeEmailEnabled,
	isUserDue
} from './notify';

describe('isEmailBatchType', () => {
	it('accepts the batched notification types', () => {
		for (const type of EMAIL_BATCH_TYPES) {
			expect(isEmailBatchType(type)).toBe(true);
		}
	});

	it('rejects moderation_outcome (it keeps its own immediate email)', () => {
		expect(isEmailBatchType('moderation_outcome')).toBe(false);
	});

	it('rejects unknown types', () => {
		expect(isEmailBatchType('something_else')).toBe(false);
	});
});

describe('isTypeEmailEnabled (preferences respected)', () => {
	it('defaults to ON when no preference is stored', () => {
		expect(isTypeEmailEnabled('fact_decided', {})).toBe(true);
		expect(isTypeEmailEnabled('fact_decided', null)).toBe(true);
		expect(isTypeEmailEnabled('fact_decided', undefined)).toBe(true);
	});

	it('is OFF only when the type is explicitly set to false', () => {
		expect(isTypeEmailEnabled('fact_decided', { fact_decided: false })).toBe(false);
		expect(isTypeEmailEnabled('comment_reply', { fact_decided: false })).toBe(true);
	});

	it('treats true (or any non-false value) as ON', () => {
		expect(isTypeEmailEnabled('fact_decided', { fact_decided: true })).toBe(true);
	});

	it('survives a malformed preference blob', () => {
		expect(isTypeEmailEnabled('fact_decided', 'not an object')).toBe(true);
		expect(isTypeEmailEnabled('fact_decided', 42)).toBe(true);
	});
});

describe('isUserDue (batching window)', () => {
	const now = new Date('2026-06-15T12:00:00Z');
	const windowMs = 6 * 3600 * 1000;

	it('is due immediately when the user has never been emailed', () => {
		expect(isUserDue(null, now, windowMs)).toBe(true);
	});

	it('is not due before the window elapses', () => {
		const lastSent = new Date(now.getTime() - windowMs + 1);
		expect(isUserDue(lastSent, now, windowMs)).toBe(false);
	});

	it('is due once the window has fully elapsed', () => {
		const lastSent = new Date(now.getTime() - windowMs);
		expect(isUserDue(lastSent, now, windowMs)).toBe(true);
	});
});

describe('buildBatchEmail (aggregation)', () => {
	const items = [
		{ summary: 'Your claim was verified', link: 'https://purfacted.com/facts/a' },
		{ summary: 'Someone replied to your comment', link: 'https://purfacted.com/facts/b' }
	];

	it('aggregates several notifications into a single email', () => {
		const mail = buildBatchEmail(items, 'https://purfacted.com');
		expect(mail.subject).toContain('2');
		expect(mail.bodyHtml).toContain('Your claim was verified');
		expect(mail.bodyHtml).toContain('Someone replied to your comment');
		expect(mail.bodyHtml).toContain('https://purfacted.com/facts/a');
		expect(mail.bodyText).toContain('Your claim was verified');
		expect(mail.bodyText).toContain('Someone replied to your comment');
	});

	it('uses singular wording for a single update', () => {
		const mail = buildBatchEmail([items[0]], 'https://purfacted.com');
		expect(mail.subject).toContain('1');
		expect(mail.subject).not.toMatch(/updates/);
	});
});
