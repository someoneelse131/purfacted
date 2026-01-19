/**
 * R39: Bot Prevention Service
 *
 * Consolidates all anti-bot measures: captcha, honeypots, rate limiting,
 * disposable email detection, copy-paste detection.
 */

import { db } from '../db';
import { isEmailBanned, isIpBanned, hashIp } from './ban';

// Rate limiting configuration
const RATE_LIMITS: Record<string, { requests: number; windowMs: number }> = {
	'auth/register': { requests: 5, windowMs: 60 * 60 * 1000 }, // 5 per hour
	'auth/login': { requests: 10, windowMs: 15 * 60 * 1000 }, // 10 per 15 min
	'auth/forgot-password': { requests: 3, windowMs: 60 * 60 * 1000 }, // 3 per hour
	'facts/create': { requests: 10, windowMs: 24 * 60 * 60 * 1000 }, // 10 per day
	'votes/anonymous': { requests: 1, windowMs: 24 * 60 * 60 * 1000 }, // 1 per day
	'debates/message': { requests: 50, windowMs: 60 * 60 * 1000 }, // 50 per hour
	default: { requests: 100, windowMs: 60 * 1000 } // 100 per minute
};

// Known disposable email domains (subset - use API for full list in production)
const DISPOSABLE_DOMAINS = [
	'10minutemail.com',
	'tempmail.com',
	'guerrillamail.com',
	'mailinator.com',
	'throwaway.email',
	'fakeinbox.com',
	'temp-mail.org',
	'getnada.com',
	'maildrop.cc',
	'discard.email'
];

export class BotPreventionError extends Error {
	code: string;
	constructor(message: string, code: string) {
		super(message);
		this.name = 'BotPreventionError';
		this.code = code;
	}
}

// In-memory rate limit storage (use Redis in production)
const rateLimitStore: Map<string, { count: number; resetAt: number }> = new Map();

/**
 * Check rate limit for an endpoint/IP combination
 */
export async function checkRateLimit(
	endpoint: string,
	ip: string
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
	const config = RATE_LIMITS[endpoint] || RATE_LIMITS['default'];
	const key = `${endpoint}:${hashIp(ip)}`;
	const now = Date.now();

	const current = rateLimitStore.get(key);

	if (!current || current.resetAt < now) {
		// New window
		rateLimitStore.set(key, { count: 1, resetAt: now + config.windowMs });
		return {
			allowed: true,
			remaining: config.requests - 1,
			resetAt: new Date(now + config.windowMs)
		};
	}

	if (current.count >= config.requests) {
		return {
			allowed: false,
			remaining: 0,
			resetAt: new Date(current.resetAt)
		};
	}

	current.count++;
	return {
		allowed: true,
		remaining: config.requests - current.count,
		resetAt: new Date(current.resetAt)
	};
}

/**
 * Reset rate limit for an endpoint/IP
 */
export function resetRateLimit(endpoint: string, ip: string): void {
	const key = `${endpoint}:${hashIp(ip)}`;
	rateLimitStore.delete(key);
}

/**
 * Check if email is from a disposable domain
 */
export function isDisposableEmail(email: string): boolean {
	const domain = email.split('@')[1]?.toLowerCase();
	if (!domain) return false;

	return DISPOSABLE_DOMAINS.includes(domain);
}

/**
 * Check if email is from a disposable domain using external API
 * (Fallback to local list if API fails)
 */
export async function checkDisposableEmailApi(email: string): Promise<boolean> {
	// First check local list
	if (isDisposableEmail(email)) {
		return true;
	}

	// In production, call an external API like:
	// https://open.kickbox.com/v1/disposable/{domain}
	// For now, just use local list
	return false;
}

/**
 * Validate honeypot field (should be empty)
 */
export function validateHoneypot(fieldValue: string | undefined): boolean {
	// Honeypot fields should always be empty
	// Bots tend to fill in all fields
	return !fieldValue || fieldValue.trim() === '';
}

/**
 * Detect copy-paste behavior in messages
 * Returns true if suspicious (potential bot)
 */
export async function detectCopyPaste(
	userId: string,
	message: string,
	recentMessages: string[]
): Promise<{ suspicious: boolean; reason?: string }> {
	// Check for exact duplicates
	if (recentMessages.includes(message)) {
		return { suspicious: true, reason: 'Exact duplicate message' };
	}

	// Check for very similar messages (>90% similarity)
	for (const recent of recentMessages) {
		const similarity = calculateSimilarity(message, recent);
		if (similarity > 0.9) {
			return { suspicious: true, reason: 'Very similar to recent message' };
		}
	}

	// Check for rapid message rate (more than 5 in last minute)
	const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
	const recentCount = await db.debateMessage.count({
		where: {
			userId,
			createdAt: { gte: oneMinuteAgo }
		}
	});

	if (recentCount >= 5) {
		return { suspicious: true, reason: 'Rapid message rate' };
	}

	return { suspicious: false };
}

/**
 * Calculate Levenshtein similarity between two strings
 */
function calculateSimilarity(str1: string, str2: string): number {
	const len1 = str1.length;
	const len2 = str2.length;
	const maxLen = Math.max(len1, len2);

	if (maxLen === 0) return 1;

	const distance = levenshteinDistance(str1, str2);
	return 1 - distance / maxLen;
}

/**
 * Levenshtein distance calculation
 */
function levenshteinDistance(str1: string, str2: string): number {
	const m = str1.length;
	const n = str2.length;

	const dp: number[][] = Array(m + 1)
		.fill(null)
		.map(() => Array(n + 1).fill(0));

	for (let i = 0; i <= m; i++) dp[i][0] = i;
	for (let j = 0; j <= n; j++) dp[0][j] = j;

	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			if (str1[i - 1] === str2[j - 1]) {
				dp[i][j] = dp[i - 1][j - 1];
			} else {
				dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
			}
		}
	}

	return dp[m][n];
}

/**
 * Verify captcha token (placeholder - integrate with actual provider)
 */
export async function verifyCaptcha(token: string): Promise<boolean> {
	if (!token) return false;

	// In production, verify with reCAPTCHA, hCaptcha, etc.
	// For development/testing, accept any non-empty token
	const captchaSecret = process.env.CAPTCHA_SECRET;

	if (!captchaSecret) {
		// No captcha configured, skip verification
		return true;
	}

	// Placeholder for actual verification
	// const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
	//   method: 'POST',
	//   body: `secret=${captchaSecret}&response=${token}`
	// });
	// const data = await response.json();
	// return data.success;

	return token.length > 0;
}

/**
 * Check if a new registration is allowed
 */
export async function canRegister(
	email: string,
	ip: string,
	honeypotValue?: string
): Promise<{ allowed: boolean; reason?: string }> {
	// Check honeypot
	if (!validateHoneypot(honeypotValue)) {
		return { allowed: false, reason: 'Bot detected' };
	}

	// Check disposable email
	if (await checkDisposableEmailApi(email)) {
		return { allowed: false, reason: 'Disposable email not allowed' };
	}

	// Check banned email
	if (await isEmailBanned(email)) {
		return { allowed: false, reason: 'Email is blocked' };
	}

	// Check banned IP
	if (await isIpBanned(ip)) {
		return { allowed: false, reason: 'Registration blocked' };
	}

	// Check rate limit
	const rateLimit = await checkRateLimit('auth/register', ip);
	if (!rateLimit.allowed) {
		return { allowed: false, reason: 'Too many registration attempts' };
	}

	return { allowed: true };
}

/**
 * Check for unverified email accounts (need verification within 24h)
 */
export async function getUnverifiedAccounts(): Promise<string[]> {
	const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

	const unverified = await db.user.findMany({
		where: {
			emailVerified: false,
			createdAt: { lt: oneDayAgo },
			deletedAt: null
		},
		select: { id: true }
	});

	return unverified.map((u) => u.id);
}

/**
 * Cleanup expired unverified accounts
 */
export async function cleanupUnverifiedAccounts(): Promise<number> {
	const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

	const result = await db.user.updateMany({
		where: {
			emailVerified: false,
			createdAt: { lt: oneDayAgo },
			deletedAt: null
		},
		data: {
			deletedAt: new Date()
		}
	});

	return result.count;
}

/**
 * Get bot prevention configuration
 */
export function getBotPreventionConfig(): {
	rateLimits: typeof RATE_LIMITS;
	disposableDomains: string[];
} {
	return {
		rateLimits: RATE_LIMITS,
		disposableDomains: DISPOSABLE_DOMAINS
	};
}
