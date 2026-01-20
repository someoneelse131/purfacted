import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// Create a mock sendMail function we can control
const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-message-id' });

// Mock nodemailer
vi.mock('nodemailer', () => ({
	default: {
		createTransport: vi.fn(() => ({
			sendMail: mockSendMail
		}))
	}
}));

// Mock redis
vi.mock('./redis', () => ({
	set: vi.fn().mockResolvedValue(undefined),
	get: vi.fn().mockResolvedValue(null)
}));

describe('R6: Email Service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset the mock to succeed by default
		mockSendMail.mockResolvedValue({ messageId: 'test-message-id' });
	});

	describe('Email Templates', () => {
		it('should generate verification email template', async () => {
			const { emailVerificationTemplate } = await import('./mail');

			const html = emailVerificationTemplate('John', 'https://example.com/verify?token=abc123');

			expect(html).toContain('John');
			expect(html).toContain('https://example.com/verify?token=abc123');
			expect(html).toContain('Verify Email Address');
			expect(html).toContain('24 hours');
		});

		it('should generate password reset email template', async () => {
			const { passwordResetTemplate } = await import('./mail');

			const html = passwordResetTemplate('Jane', 'https://example.com/reset?token=xyz789');

			expect(html).toContain('Jane');
			expect(html).toContain('https://example.com/reset?token=xyz789');
			expect(html).toContain('Reset Password');
			expect(html).toContain('1 hour');
		});

		it('should generate notification email template', async () => {
			const { notificationTemplate } = await import('./mail');

			const html = notificationTemplate(
				'Bob',
				'Your fact was verified',
				'Congratulations! Your submitted fact has been verified by the community.',
				'https://example.com/facts/123',
				'View Fact'
			);

			expect(html).toContain('Bob');
			expect(html).toContain('Your fact was verified');
			expect(html).toContain('Congratulations');
			expect(html).toContain('View Fact');
		});

		it('should include unsubscribe text in templates', async () => {
			const { emailVerificationTemplate, notificationTemplate } = await import('./mail');

			const verificationHtml = emailVerificationTemplate('Test', 'https://example.com');
			const notificationHtml = notificationTemplate('Test', 'Title', 'Message');

			expect(verificationHtml).toContain('transactional email');
			expect(notificationHtml).toContain('notification preferences');
		});
	});

	describe('sendEmail', () => {
		it('should send email successfully', async () => {
			const { sendEmail } = await import('./mail');

			const result = await sendEmail({
				to: 'test@example.com',
				subject: 'Test Subject',
				html: '<p>Test content</p>'
			});

			expect(result).toBe(true);
		});

		it('should handle send failure gracefully', async () => {
			// Make the mock fail for this test
			mockSendMail.mockRejectedValue(new Error('SMTP error'));

			const { sendEmail } = await import('./mail');

			const result = await sendEmail({
				to: 'test@example.com',
				subject: 'Test Subject',
				html: '<p>Test content</p>'
			});

			expect(result).toBe(false);
		});
	});

	describe('Helper functions', () => {
		it('should send verification email', async () => {
			const { sendVerificationEmail } = await import('./mail');

			const result = await sendVerificationEmail(
				'test@example.com',
				'John',
				'verification-token-123'
			);

			expect(result).toBe(true);
		});

		it('should send password reset email', async () => {
			const { sendPasswordResetEmail } = await import('./mail');

			const result = await sendPasswordResetEmail(
				'test@example.com',
				'Jane',
				'reset-token-456'
			);

			expect(result).toBe(true);
		});

		it('should send notification email', async () => {
			const { sendNotificationEmail } = await import('./mail');

			const result = await sendNotificationEmail(
				'test@example.com',
				'Bob',
				'Test Notification',
				'This is a test notification message.'
			);

			expect(result).toBe(true);
		});
	});

	describe('Email Queue', () => {
		it('should queue email for later sending', async () => {
			const { queueEmail } = await import('./mail');
			const { set } = await import('./redis');

			await queueEmail({
				to: 'test@example.com',
				subject: 'Queued Email',
				html: '<p>Queued content</p>'
			});

			expect(set).toHaveBeenCalled();
		});
	});
});
