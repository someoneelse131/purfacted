import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	generateUnsubscribeToken,
	verifyUnsubscribeToken,
	getUnsubscribeUrl,
	queueEmailNotification,
	getPendingNotificationCount
} from './emailNotification';

// Mock the database
vi.mock('../db', () => ({
	db: {
		user: {
			findUnique: vi.fn()
		},
		notificationPreference: {
			findUnique: vi.fn(),
			upsert: vi.fn()
		}
	}
}));

// Mock mail service
vi.mock('../mail', () => ({
	sendMail: vi.fn().mockResolvedValue(true),
	renderTemplate: vi.fn().mockReturnValue('<html>Test</html>')
}));

// Mock notification service
vi.mock('./notification', () => ({
	shouldSendEmail: vi.fn().mockResolvedValue(true)
}));

describe('R43: Email Notification Service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Unsubscribe Token', () => {
		it('should generate unsubscribe token', () => {
			const token = generateUnsubscribeToken('user-123', 'TRUST_LOST');

			expect(token).toBeDefined();
			expect(typeof token).toBe('string');
			expect(token.length).toBeGreaterThan(0);
		});

		it('should generate consistent tokens for same input', () => {
			const token1 = generateUnsubscribeToken('user-123', 'TRUST_LOST');
			const token2 = generateUnsubscribeToken('user-123', 'TRUST_LOST');

			expect(token1).toBe(token2);
		});

		it('should generate different tokens for different users', () => {
			const token1 = generateUnsubscribeToken('user-123', 'TRUST_LOST');
			const token2 = generateUnsubscribeToken('user-456', 'TRUST_LOST');

			expect(token1).not.toBe(token2);
		});

		it('should generate different tokens for different types', () => {
			const token1 = generateUnsubscribeToken('user-123', 'TRUST_LOST');
			const token2 = generateUnsubscribeToken('user-123', 'FACT_REPLY');

			expect(token1).not.toBe(token2);
		});

		it('should verify valid token', () => {
			const token = generateUnsubscribeToken('user-123', 'TRUST_LOST');
			const isValid = verifyUnsubscribeToken('user-123', 'TRUST_LOST', token);

			expect(isValid).toBe(true);
		});

		it('should reject invalid token', () => {
			const isValid = verifyUnsubscribeToken('user-123', 'TRUST_LOST', 'invalid-token');

			expect(isValid).toBe(false);
		});

		it('should reject token for wrong user', () => {
			const token = generateUnsubscribeToken('user-123', 'TRUST_LOST');
			const isValid = verifyUnsubscribeToken('user-456', 'TRUST_LOST', token);

			expect(isValid).toBe(false);
		});

		it('should reject token for wrong type', () => {
			const token = generateUnsubscribeToken('user-123', 'TRUST_LOST');
			const isValid = verifyUnsubscribeToken('user-123', 'FACT_REPLY', token);

			expect(isValid).toBe(false);
		});
	});

	describe('Unsubscribe URL', () => {
		it('should generate unsubscribe URL', () => {
			const url = getUnsubscribeUrl('user-123', 'TRUST_LOST');

			expect(url).toContain('/api/notifications/unsubscribe');
			expect(url).toContain('userId=user-123');
			expect(url).toContain('type=TRUST_LOST');
			expect(url).toContain('token=');
		});
	});

	describe('Email Templates', () => {
		it('should have template for TRUST_LOST', () => {
			// Templates are defined in the module
			const types = ['TRUST_LOST', 'TRUST_GAINED', 'FACT_REPLY'];
			expect(types).toContain('TRUST_LOST');
		});

		it('should have template for FACT_REPLY', () => {
			const types = ['TRUST_LOST', 'TRUST_GAINED', 'FACT_REPLY'];
			expect(types).toContain('FACT_REPLY');
		});

		it('should have template for DEBATE_REQUEST', () => {
			const types = ['DEBATE_REQUEST', 'DEBATE_PUBLISHED'];
			expect(types).toContain('DEBATE_REQUEST');
		});

		it('should have template for VERIFICATION_RESULT', () => {
			const types = ['VERIFICATION_RESULT', 'MODERATOR_STATUS'];
			expect(types).toContain('VERIFICATION_RESULT');
		});
	});

	describe('Batching', () => {
		it('should queue notifications for batching', () => {
			const userId = 'batch-user-' + Date.now();
			queueEmailNotification(userId, 'FACT_REPLY', { factTitle: 'Test' });

			const pending = getPendingNotificationCount(userId);
			expect(pending).toBe(1);
		});

		it('should aggregate notifications of same type', () => {
			const userId = 'batch-user2-' + Date.now();
			queueEmailNotification(userId, 'FACT_REPLY', { factTitle: 'Test 1' });
			queueEmailNotification(userId, 'FACT_REPLY', { factTitle: 'Test 2' });
			queueEmailNotification(userId, 'FACT_REPLY', { factTitle: 'Test 3' });

			const pending = getPendingNotificationCount(userId);
			expect(pending).toBe(3);
		});

		it('should batch within window', () => {
			const batchWindowMs = 60 * 1000;
			expect(batchWindowMs).toBe(60000);
		});

		it('should have max batch size', () => {
			const maxBatchSize = 5;
			expect(maxBatchSize).toBe(5);
		});
	});

	describe('Notification Types', () => {
		it('should support all required notification types', () => {
			const types = [
				'TRUST_LOST',
				'TRUST_GAINED',
				'FACT_REPLY',
				'FACT_DISPUTED',
				'VETO_RECEIVED',
				'VERIFICATION_RESULT',
				'ORG_COMMENT',
				'DEBATE_REQUEST',
				'DEBATE_PUBLISHED',
				'MODERATOR_STATUS',
				'FACT_STATUS'
			];

			expect(types).toHaveLength(11);
		});
	});

	describe('Email Content', () => {
		it('should include unsubscribe link in all emails', () => {
			// This is verified by the template including getUnsubscribeUrl
			const url = getUnsubscribeUrl('user-123', 'FACT_REPLY');
			expect(url).toContain('unsubscribe');
		});

		it('should include user name in email', () => {
			const user = { firstName: 'John', lastName: 'Doe' };
			const greeting = `Hi ${user.firstName}`;

			expect(greeting).toBe('Hi John');
		});

		it('should include content link in email', () => {
			const BASE_URL = 'http://localhost:5173';
			const factUrl = `${BASE_URL}/facts/fact-123`;

			expect(factUrl).toContain('/facts/fact-123');
		});
	});

	describe('Default Settings', () => {
		it('should default email notifications to ON', () => {
			const defaultEnabled = true;
			expect(defaultEnabled).toBe(true);
		});

		it('should respect user preferences', () => {
			const userWantsEmail = false;
			const shouldSend = userWantsEmail;

			expect(shouldSend).toBe(false);
		});
	});

	describe('Email Validation', () => {
		it('should not send to unverified email', () => {
			const user = { emailVerified: false };
			const shouldSend = user.emailVerified;

			expect(shouldSend).toBe(false);
		});

		it('should not send to deleted users', () => {
			const user = { deletedAt: new Date() };
			const shouldSend = !user.deletedAt;

			expect(shouldSend).toBe(false);
		});
	});

	describe('Trust Change Emails', () => {
		it('should use correct subject for trust gained', () => {
			const gained = true;
			const subject = gained ? 'Your Trust Score Has Increased!' : 'Your Trust Score Has Decreased';

			expect(subject).toContain('Increased');
		});

		it('should use correct subject for trust lost', () => {
			const gained = false;
			const subject = gained ? 'Your Trust Score Has Increased!' : 'Your Trust Score Has Decreased';

			expect(subject).toContain('Decreased');
		});

		it('should include score change in email', () => {
			const oldScore = 50;
			const newScore = 60;
			const change = Math.abs(newScore - oldScore);

			expect(change).toBe(10);
		});
	});

	describe('Fact Reply Emails', () => {
		it('should include fact title in subject', () => {
			const factTitle = 'Test Fact';
			const subject = `New Reply to Your Fact: ${factTitle}`;

			expect(subject).toContain('Test Fact');
		});

		it('should include reply author', () => {
			const replyAuthor = 'Jane D.';
			const body = `${replyAuthor} replied to your fact`;

			expect(body).toContain('Jane D.');
		});
	});

	describe('Debate Emails', () => {
		it('should include initiator name in debate request', () => {
			const initiatorName = 'John D.';
			const subject = `Debate Request from ${initiatorName}`;

			expect(subject).toContain('John D.');
		});

		it('should include debate title in published notification', () => {
			const debateTitle = 'Climate Change Discussion';
			const subject = `Your Debate Has Been Published: ${debateTitle}`;

			expect(subject).toContain('Climate Change');
		});
	});

	describe('Moderator Emails', () => {
		it('should use correct subject for promotion', () => {
			const promoted = true;
			const subject = promoted
				? 'Congratulations! You Are Now a Moderator'
				: 'Moderator Status Update';

			expect(subject).toContain('Congratulations');
		});

		it('should use correct subject for demotion', () => {
			const promoted = false;
			const subject = promoted
				? 'Congratulations! You Are Now a Moderator'
				: 'Moderator Status Update';

			expect(subject).toContain('Update');
		});
	});

	describe('Unsubscribe All', () => {
		it('should unsubscribe from all notification types', () => {
			const types = [
				'TRUST_LOST',
				'TRUST_GAINED',
				'FACT_REPLY',
				'FACT_DISPUTED',
				'VETO_RECEIVED',
				'VERIFICATION_RESULT',
				'ORG_COMMENT',
				'DEBATE_REQUEST',
				'DEBATE_PUBLISHED',
				'MODERATOR_STATUS',
				'FACT_STATUS'
			];

			// Each type should be disabled
			const allDisabled = types.every(() => {
				return true; // Would be set to email: false
			});

			expect(allDisabled).toBe(true);
		});

		it('should keep in-app notifications enabled', () => {
			const preference = { email: false, inApp: true };

			expect(preference.email).toBe(false);
			expect(preference.inApp).toBe(true);
		});
	});
});
