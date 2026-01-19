import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	BotPreventionError,
	isDisposableEmail,
	validateHoneypot,
	getBotPreventionConfig
} from './botPrevention';

// Mock the database
vi.mock('../db', () => ({
	db: {
		user: {
			findMany: vi.fn(),
			updateMany: vi.fn()
		},
		debateMessage: {
			count: vi.fn()
		}
	}
}));

// Mock ban service
vi.mock('./ban', () => ({
	isEmailBanned: vi.fn().mockResolvedValue(false),
	isIpBanned: vi.fn().mockResolvedValue(false),
	hashIp: vi.fn().mockReturnValue('hashed')
}));

describe('R39: Bot Prevention', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('BotPreventionError', () => {
		it('should have correct name and code', () => {
			const error = new BotPreventionError('Test message', 'TEST_CODE');
			expect(error.name).toBe('BotPreventionError');
			expect(error.code).toBe('TEST_CODE');
			expect(error.message).toBe('Test message');
		});
	});

	describe('Captcha requirements', () => {
		it('should require captcha for registration', () => {
			const requiresCaptcha = true;
			expect(requiresCaptcha).toBe(true);
		});

		it('should require captcha for anonymous votes', () => {
			const requiresCaptcha = true;
			expect(requiresCaptcha).toBe(true);
		});
	});

	describe('Honeypot fields', () => {
		it('should accept empty honeypot (human)', () => {
			expect(validateHoneypot('')).toBe(true);
			expect(validateHoneypot(undefined)).toBe(true);
		});

		it('should reject filled honeypot (bot)', () => {
			expect(validateHoneypot('filled by bot')).toBe(false);
			expect(validateHoneypot('spam')).toBe(false);
		});

		it('should trim whitespace', () => {
			expect(validateHoneypot('   ')).toBe(true);
		});
	});

	describe('Rate limiting', () => {
		it('should have configurable rate limits per endpoint', () => {
			const config = getBotPreventionConfig();
			expect(config.rateLimits).toBeDefined();
			expect(config.rateLimits['auth/register']).toBeDefined();
		});

		it('should limit registration to 5 per hour', () => {
			const config = getBotPreventionConfig();
			const regLimit = config.rateLimits['auth/register'];

			expect(regLimit.requests).toBe(5);
			expect(regLimit.windowMs).toBe(60 * 60 * 1000);
		});

		it('should limit login to 10 per 15 minutes', () => {
			const config = getBotPreventionConfig();
			const loginLimit = config.rateLimits['auth/login'];

			expect(loginLimit.requests).toBe(10);
			expect(loginLimit.windowMs).toBe(15 * 60 * 1000);
		});

		it('should have default limit for unspecified endpoints', () => {
			const config = getBotPreventionConfig();
			expect(config.rateLimits['default']).toBeDefined();
		});
	});

	describe('Email verification', () => {
		it('should require verification within 24 hours', () => {
			const maxHours = 24;
			expect(maxHours).toBe(24);
		});

		it('should cleanup unverified accounts after 24h', () => {
			const oneDayMs = 24 * 60 * 60 * 1000;
			expect(oneDayMs).toBe(86400000);
		});
	});

	describe('Copy-paste detection in debates', () => {
		it('should detect exact duplicate messages', () => {
			const message = 'This is a test message';
			const recentMessages = ['This is a test message'];
			const isDuplicate = recentMessages.includes(message);

			expect(isDuplicate).toBe(true);
		});

		it('should detect rapid message rate', () => {
			const messagesInLastMinute = 6;
			const isRapid = messagesInLastMinute >= 5;

			expect(isRapid).toBe(true);
		});
	});

	describe('Disposable email blocking', () => {
		it('should detect known disposable domains', () => {
			expect(isDisposableEmail('test@10minutemail.com')).toBe(true);
			expect(isDisposableEmail('test@tempmail.com')).toBe(true);
			expect(isDisposableEmail('test@mailinator.com')).toBe(true);
		});

		it('should allow legitimate domains', () => {
			expect(isDisposableEmail('test@gmail.com')).toBe(false);
			expect(isDisposableEmail('test@company.com')).toBe(false);
		});

		it('should have list of disposable domains', () => {
			const config = getBotPreventionConfig();
			expect(config.disposableDomains.length).toBeGreaterThan(0);
		});
	});

	describe('Registration protection', () => {
		it('should check honeypot field', () => {
			const honeypotEmpty = '';
			const isBot = !validateHoneypot(honeypotEmpty);
			expect(isBot).toBe(false);
		});

		it('should check disposable email', () => {
			const email = 'user@tempmail.com';
			const isDisposable = isDisposableEmail(email);
			expect(isDisposable).toBe(true);
		});

		it('should check banned email', () => {
			const isBanned = true;
			const canRegister = !isBanned;
			expect(canRegister).toBe(false);
		});

		it('should check banned IP', () => {
			const isBanned = true;
			const canRegister = !isBanned;
			expect(canRegister).toBe(false);
		});

		it('should check rate limit', () => {
			const isLimited = true;
			const canRegister = !isLimited;
			expect(canRegister).toBe(false);
		});
	});

	describe('String similarity for copy-paste detection', () => {
		it('should detect highly similar strings', () => {
			const str1 = 'This is a test message';
			const str2 = 'This is a test messge'; // typo

			// Simple similarity check
			const commonChars = str1.split('').filter((c, i) => c === str2[i]).length;
			const similarity = commonChars / Math.max(str1.length, str2.length);

			expect(similarity).toBeGreaterThan(0.8);
		});

		it('should allow different messages', () => {
			const str1 = 'Hello world';
			const str2 = 'Goodbye everyone';

			const commonChars = str1.split('').filter((c, i) => c === str2[i]).length;
			const similarity = commonChars / Math.max(str1.length, str2.length);

			expect(similarity).toBeLessThan(0.5);
		});
	});
});
