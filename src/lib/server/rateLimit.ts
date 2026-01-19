import { incr, expire, ttl } from './redis';

const LOGIN_MAX_ATTEMPTS = parseInt(process.env.LOGIN_MAX_ATTEMPTS || '5', 10);
const LOGIN_LOCKOUT_MINUTES = parseInt(process.env.LOGIN_LOCKOUT_MINUTES || '15', 10);

interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	resetInSeconds: number;
}

/**
 * Check and increment rate limit for login attempts
 */
export async function checkLoginRateLimit(identifier: string): Promise<RateLimitResult> {
	const key = `rate_limit:login:${identifier}`;
	const lockoutSeconds = LOGIN_LOCKOUT_MINUTES * 60;

	const attempts = await incr(key);

	// Set expiry on first attempt
	if (attempts === 1) {
		await expire(key, lockoutSeconds);
	}

	const ttlRemaining = await ttl(key);
	const resetInSeconds = ttlRemaining > 0 ? ttlRemaining : lockoutSeconds;

	if (attempts > LOGIN_MAX_ATTEMPTS) {
		return {
			allowed: false,
			remaining: 0,
			resetInSeconds
		};
	}

	return {
		allowed: true,
		remaining: LOGIN_MAX_ATTEMPTS - attempts,
		resetInSeconds
	};
}

/**
 * Reset login rate limit (e.g., after successful login)
 */
export async function resetLoginRateLimit(identifier: string): Promise<void> {
	const { del } = await import('./redis');
	const key = `rate_limit:login:${identifier}`;
	await del(key);
}

/**
 * General rate limiter for API endpoints
 */
export async function checkRateLimit(
	identifier: string,
	namespace: string,
	maxRequests: number,
	windowSeconds: number
): Promise<RateLimitResult> {
	const key = `rate_limit:${namespace}:${identifier}`;

	const requests = await incr(key);

	if (requests === 1) {
		await expire(key, windowSeconds);
	}

	const ttlRemaining = await ttl(key);
	const resetInSeconds = ttlRemaining > 0 ? ttlRemaining : windowSeconds;

	if (requests > maxRequests) {
		return {
			allowed: false,
			remaining: 0,
			resetInSeconds
		};
	}

	return {
		allowed: true,
		remaining: maxRequests - requests,
		resetInSeconds
	};
}
