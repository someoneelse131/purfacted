import { describe, expect, it } from 'vitest';
import {
	renderNotificationEmail,
	renderPasswordResetEmail,
	renderVerificationEmail
} from './templates';

describe('email templates', () => {
	it('renders the verification email with link and expiry', () => {
		const mail = renderVerificationEmail({
			username: 'alice',
			verifyUrl: 'https://purfacted.com/verify-email/tok123',
			expiryHours: 24
		});
		expect(mail.subject).toContain('Verify');
		expect(mail.html).toContain('https://purfacted.com/verify-email/tok123');
		expect(mail.html).toContain('alice');
		expect(mail.html).toContain('24 hours');
		expect(mail.text).toContain('https://purfacted.com/verify-email/tok123');
	});

	it('renders the password reset email with link', () => {
		const mail = renderPasswordResetEmail({
			username: 'bob',
			resetUrl: 'https://purfacted.com/reset-password/tok456',
			expiryHours: 1
		});
		expect(mail.html).toContain('https://purfacted.com/reset-password/tok456');
		expect(mail.text).toContain('https://purfacted.com/reset-password/tok456');
		expect(mail.subject).toContain('Reset');
	});

	it('renders notifications with unsubscribe link in html and text', () => {
		const mail = renderNotificationEmail({
			username: 'carol',
			subject: 'New veto on your fact',
			bodyHtml: '<p>Something happened.</p>',
			bodyText: 'Something happened.',
			unsubscribeUrl: 'https://purfacted.com/unsubscribe/tok789'
		});
		expect(mail.html).toContain('https://purfacted.com/unsubscribe/tok789');
		expect(mail.text).toContain('https://purfacted.com/unsubscribe/tok789');
	});

	it('escapes html in user-controlled values', () => {
		const mail = renderVerificationEmail({
			username: '<script>alert(1)</script>',
			verifyUrl: 'https://purfacted.com/verify-email/tok',
			expiryHours: 24
		});
		expect(mail.html).not.toContain('<script>');
		expect(mail.html).toContain('&lt;script&gt;');
	});
});
