/**
 * T34: Test Utilities
 *
 * Additional utility functions for testing common patterns.
 */

import { vi, expect } from 'vitest';

// ============================================
// Request/Response Utilities
// ============================================

/**
 * Creates a mock SvelteKit Request object
 */
export function createMockRequest(
	body: unknown = {},
	options: {
		method?: string;
		headers?: Record<string, string>;
	} = {}
): Request {
	return {
		method: options.method || 'POST',
		headers: new Map(Object.entries(options.headers || {})),
		json: vi.fn().mockResolvedValue(body),
		text: vi.fn().mockResolvedValue(JSON.stringify(body)),
		formData: vi.fn().mockResolvedValue(new FormData()),
		clone: vi.fn().mockReturnThis(),
		signal: {
			aborted: false,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn()
		}
	} as unknown as Request;
}

/**
 * Creates a mock URL object with query parameters
 */
export function createMockUrl(
	path: string,
	params: Record<string, string> = {}
): URL {
	const url = new URL(`http://localhost:3000${path}`);
	Object.entries(params).forEach(([key, value]) => {
		url.searchParams.set(key, value);
	});
	return url;
}

/**
 * Creates mock locals object for SvelteKit handlers
 */
export function createMockLocals(
	user: {
		id: string;
		userType: string;
		emailVerified?: boolean;
	} | null = null
): App.Locals {
	return {
		user: user ? {
			id: user.id,
			userType: user.userType as any,
			emailVerified: user.emailVerified ?? true
		} : null
	} as App.Locals;
}

/**
 * Parses JSON response from handler
 */
export async function parseResponse(response: Response): Promise<any> {
	return response.json();
}

// ============================================
// Assertion Helpers
// ============================================

/**
 * Expects handler to throw with specific status
 */
export async function expectHttpError(
	promise: Promise<any>,
	status: number,
	messageContains?: string
): Promise<void> {
	await expect(promise).rejects.toMatchObject({ status });
	if (messageContains) {
		await expect(promise).rejects.toMatchObject({
			body: expect.objectContaining({
				message: expect.stringContaining(messageContains)
			})
		});
	}
}

/**
 * Expects successful API response
 */
export function expectSuccessResponse(data: any): void {
	expect(data.success).toBe(true);
	expect(data).toHaveProperty('data');
}

/**
 * Expects error API response
 */
export function expectErrorResponse(data: any, message?: string): void {
	expect(data.success).toBe(false);
	expect(data).toHaveProperty('error');
	if (message) {
		expect(data.error.message).toContain(message);
	}
}

/**
 * Expects object to have required fields
 */
export function expectShape<T extends object>(
	obj: unknown,
	shape: (keyof T)[]
): void {
	expect(obj).toBeDefined();
	shape.forEach((key) => {
		expect(obj).toHaveProperty(key as string);
	});
}

/**
 * Expects array to be sorted
 */
export function expectSorted<T>(
	arr: T[],
	compareFn: (a: T, b: T) => number,
	order: 'asc' | 'desc' = 'asc'
): void {
	for (let i = 1; i < arr.length; i++) {
		const result = compareFn(arr[i - 1], arr[i]);
		if (order === 'asc') {
			expect(result).toBeLessThanOrEqual(0);
		} else {
			expect(result).toBeGreaterThanOrEqual(0);
		}
	}
}

// ============================================
// Time Utilities
// ============================================

/**
 * Creates a date relative to now
 */
export function relativeDate(offset: {
	days?: number;
	hours?: number;
	minutes?: number;
	seconds?: number;
}): Date {
	const date = new Date();
	if (offset.days) date.setDate(date.getDate() + offset.days);
	if (offset.hours) date.setHours(date.getHours() + offset.hours);
	if (offset.minutes) date.setMinutes(date.getMinutes() + offset.minutes);
	if (offset.seconds) date.setSeconds(date.getSeconds() + offset.seconds);
	return date;
}

/**
 * Creates a past date
 */
export function pastDate(daysAgo: number): Date {
	return relativeDate({ days: -daysAgo });
}

/**
 * Creates a future date
 */
export function futureDate(daysAhead: number): Date {
	return relativeDate({ days: daysAhead });
}

/**
 * Mocks Date.now() and new Date()
 */
export function freezeTime(date: Date = new Date()): () => void {
	const originalDate = global.Date;
	const frozenTime = date.getTime();

	// Mock Date.now first before mocking the constructor
	const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(frozenTime);

	// Create a mock Date class that preserves static methods
	const MockDate = vi.fn((...args: any[]) => {
		if (args.length === 0) {
			return new originalDate(frozenTime);
		}
		return new originalDate(...args);
	}) as unknown as DateConstructor;

	// Copy static methods from original Date
	MockDate.now = () => frozenTime;
	MockDate.parse = originalDate.parse;
	MockDate.UTC = originalDate.UTC;

	global.Date = MockDate;

	return () => {
		global.Date = originalDate;
		nowSpy.mockRestore();
	};
}

// ============================================
// Async Utilities
// ============================================

/**
 * Waits for specified milliseconds
 */
export function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries an async function until it succeeds or max retries reached
 */
export async function retry<T>(
	fn: () => Promise<T>,
	options: {
		maxRetries?: number;
		delay?: number;
		shouldRetry?: (error: unknown) => boolean;
	} = {}
): Promise<T> {
	const { maxRetries = 3, delay = 100, shouldRetry = () => true } = options;

	let lastError: unknown;
	for (let i = 0; i < maxRetries; i++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			if (!shouldRetry(error) || i === maxRetries - 1) {
				throw error;
			}
			await wait(delay);
		}
	}
	throw lastError;
}

/**
 * Expects a promise to reject within timeout
 */
export async function expectRejectWithin(
	promise: Promise<any>,
	timeout: number
): Promise<void> {
	const timeoutPromise = new Promise((_, reject) => {
		setTimeout(() => reject(new Error('Timeout')), timeout);
	});

	await expect(
		Promise.race([promise, timeoutPromise])
	).rejects.toBeDefined();
}

// ============================================
// Data Utilities
// ============================================

/**
 * Generates a random string
 */
export function randomString(length: number = 10): string {
	const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/**
 * Generates a random email
 */
export function randomEmail(domain: string = 'test.purfacted.com'): string {
	return `test-${randomString(8)}@${domain}`;
}

/**
 * Generates a random integer within range
 */
export function randomInt(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Picks random item from array
 */
export function randomItem<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Creates an array of n items using factory function
 */
export function times<T>(n: number, factory: (index: number) => T): T[] {
	return Array.from({ length: n }, (_, i) => factory(i));
}

// ============================================
// Environment Utilities
// ============================================

const originalEnv = { ...process.env };

/**
 * Sets environment variables for test
 */
export function setTestEnv(env: Record<string, string>): () => void {
	Object.entries(env).forEach(([key, value]) => {
		process.env[key] = value;
	});

	return () => {
		Object.keys(env).forEach((key) => {
			if (key in originalEnv) {
				process.env[key] = originalEnv[key];
			} else {
				delete process.env[key];
			}
		});
	};
}

/**
 * Clears specified environment variables
 */
export function clearTestEnv(keys: string[]): void {
	keys.forEach((key) => {
		delete process.env[key];
	});
}
