/**
 * Test Helpers
 *
 * Factory functions and utilities for creating test data.
 */

import { vi } from 'vitest';

// ============================================
// Type Definitions
// ============================================

export interface MockUser {
	id: string;
	email: string;
	firstName: string;
	lastName: string;
	passwordHash: string;
	userType: 'ANONYMOUS' | 'VERIFIED' | 'EXPERT' | 'PHD' | 'ORGANIZATION' | 'MODERATOR';
	trustScore: number;
	emailVerified: boolean;
	banLevel: number;
	bannedUntil: Date | null;
	createdAt: Date;
	updatedAt: Date;
	lastLoginAt: Date | null;
	deletedAt: Date | null;
}

export interface MockFact {
	id: string;
	title: string;
	body: string;
	status: 'SUBMITTED' | 'PENDING' | 'PROVEN' | 'DISPROVEN' | 'DISPUTED' | 'OUTDATED';
	upvotes: number;
	downvotes: number;
	weightedScore: number;
	authorId: string;
	categoryId: string | null;
	createdAt: Date;
	updatedAt: Date;
	deletedAt: Date | null;
}

export interface MockSession {
	id: string;
	userId: string;
	expiresAt: Date;
}

export interface MockCategory {
	id: string;
	name: string;
	normalizedName: string;
	parentId: string | null;
	factCount: number;
	createdAt: Date;
	updatedAt: Date;
}

export interface MockSource {
	id: string;
	url: string;
	title: string | null;
	type: 'NEWS' | 'ACADEMIC' | 'GOVERNMENT' | 'ORGANIZATION' | 'OTHER';
	credibilityScore: number;
	factId: string;
	createdAt: Date;
}

export interface MockVote {
	id: string;
	value: number;
	weight: number;
	userId: string;
	factId: string;
	createdAt: Date;
	updatedAt: Date;
}

// ============================================
// ID Generator
// ============================================

let idCounter = 0;

export function generateId(prefix: string = 'test'): string {
	idCounter++;
	return `${prefix}-${idCounter}-${Date.now()}`;
}

export function resetIdCounter(): void {
	idCounter = 0;
}

// ============================================
// Factory Functions
// ============================================

export function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
	const id = generateId('user');
	return {
		id,
		email: `${id}@test.purfacted.com`,
		firstName: 'Test',
		lastName: 'User',
		passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$test$hash',
		userType: 'VERIFIED',
		trustScore: 10,
		emailVerified: true,
		banLevel: 0,
		bannedUntil: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		lastLoginAt: null,
		deletedAt: null,
		...overrides
	};
}

export function createMockFact(overrides: Partial<MockFact> = {}): MockFact {
	const id = generateId('fact');
	return {
		id,
		title: `Test Fact ${id}`,
		body: 'This is a test fact with sufficient content for validation.',
		status: 'SUBMITTED',
		upvotes: 0,
		downvotes: 0,
		weightedScore: 0,
		authorId: generateId('user'),
		categoryId: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		deletedAt: null,
		...overrides
	};
}

export function createMockSession(overrides: Partial<MockSession> = {}): MockSession {
	const id = generateId('session');
	return {
		id,
		userId: generateId('user'),
		expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
		...overrides
	};
}

export function createMockCategory(overrides: Partial<MockCategory> = {}): MockCategory {
	const id = generateId('category');
	const name = overrides.name || `Category ${id}`;
	return {
		id,
		name,
		normalizedName: name.toLowerCase().trim(),
		parentId: null,
		factCount: 0,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides
	};
}

export function createMockSource(overrides: Partial<MockSource> = {}): MockSource {
	const id = generateId('source');
	return {
		id,
		url: `https://example.com/source/${id}`,
		title: `Source ${id}`,
		type: 'NEWS',
		credibilityScore: 50,
		factId: generateId('fact'),
		createdAt: new Date(),
		...overrides
	};
}

export function createMockVote(overrides: Partial<MockVote> = {}): MockVote {
	const id = generateId('vote');
	return {
		id,
		value: 1,
		weight: 2.0,
		userId: generateId('user'),
		factId: generateId('fact'),
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides
	};
}

// ============================================
// User Type Factories
// ============================================

export function createAnonymousUser(overrides: Partial<MockUser> = {}): MockUser {
	return createMockUser({
		userType: 'ANONYMOUS',
		trustScore: 0,
		emailVerified: false,
		...overrides
	});
}

export function createVerifiedUser(overrides: Partial<MockUser> = {}): MockUser {
	return createMockUser({
		userType: 'VERIFIED',
		trustScore: 10,
		emailVerified: true,
		...overrides
	});
}

export function createExpertUser(overrides: Partial<MockUser> = {}): MockUser {
	return createMockUser({
		userType: 'EXPERT',
		trustScore: 50,
		emailVerified: true,
		...overrides
	});
}

export function createPhdUser(overrides: Partial<MockUser> = {}): MockUser {
	return createMockUser({
		userType: 'PHD',
		trustScore: 75,
		emailVerified: true,
		...overrides
	});
}

export function createOrganizationUser(overrides: Partial<MockUser> = {}): MockUser {
	return createMockUser({
		userType: 'ORGANIZATION',
		trustScore: 100,
		emailVerified: true,
		...overrides
	});
}

export function createModeratorUser(overrides: Partial<MockUser> = {}): MockUser {
	return createMockUser({
		userType: 'MODERATOR',
		trustScore: 60,
		emailVerified: true,
		...overrides
	});
}

export function createBannedUser(banLevel: number = 1, overrides: Partial<MockUser> = {}): MockUser {
	const bannedUntil = banLevel >= 3
		? new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000) // 100 years (permanent)
		: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

	return createMockUser({
		banLevel,
		bannedUntil,
		...overrides
	});
}

// ============================================
// Fact Status Factories
// ============================================

export function createProvenFact(overrides: Partial<MockFact> = {}): MockFact {
	return createMockFact({
		status: 'PROVEN',
		upvotes: 10,
		downvotes: 2,
		weightedScore: 15.5,
		...overrides
	});
}

export function createDisprovenFact(overrides: Partial<MockFact> = {}): MockFact {
	return createMockFact({
		status: 'DISPROVEN',
		upvotes: 2,
		downvotes: 15,
		weightedScore: -20.3,
		...overrides
	});
}

export function createDisputedFact(overrides: Partial<MockFact> = {}): MockFact {
	return createMockFact({
		status: 'DISPUTED',
		upvotes: 8,
		downvotes: 7,
		weightedScore: 0.5,
		...overrides
	});
}

// ============================================
// Database Mock Utilities
// ============================================

export function createMockPrismaClient() {
	return {
		user: {
			findUnique: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
			count: vi.fn()
		},
		session: {
			findUnique: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
			deleteMany: vi.fn()
		},
		fact: {
			findUnique: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
			count: vi.fn()
		},
		source: {
			findUnique: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn()
		},
		vote: {
			findUnique: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
			upsert: vi.fn()
		},
		category: {
			findUnique: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn()
		},
		comment: {
			findUnique: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn()
		},
		discussion: {
			findUnique: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn()
		},
		debate: {
			findUnique: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn()
		},
		notification: {
			findUnique: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			updateMany: vi.fn(),
			delete: vi.fn(),
			deleteMany: vi.fn()
		},
		moderationQueue: {
			findUnique: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn()
		},
		ban: {
			findUnique: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn()
		},
		emailVerification: {
			findUnique: vi.fn(),
			create: vi.fn(),
			delete: vi.fn()
		},
		passwordReset: {
			findUnique: vi.fn(),
			create: vi.fn(),
			delete: vi.fn()
		},
		ipRateLimit: {
			findUnique: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			deleteMany: vi.fn()
		},
		anonymousVote: {
			findUnique: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			delete: vi.fn()
		},
		$transaction: vi.fn((callback: any) => callback({}))
	};
}

// ============================================
// Request/Response Mock Utilities
// ============================================

export interface MockRequestOptions {
	method?: string;
	url?: string;
	headers?: Record<string, string>;
	body?: unknown;
	params?: Record<string, string>;
	locals?: Record<string, unknown>;
}

export function createMockRequest(options: MockRequestOptions = {}) {
	const {
		method = 'GET',
		url = 'http://localhost:3000/api/test',
		headers = {},
		body = null,
		params = {},
		locals = {}
	} = options;

	return {
		method,
		url: new URL(url),
		headers: new Map(Object.entries(headers)),
		json: vi.fn().mockResolvedValue(body),
		text: vi.fn().mockResolvedValue(JSON.stringify(body)),
		params: new Map(Object.entries(params)),
		locals
	};
}

export function createMockResponse() {
	const headers = new Map<string, string>();
	let status = 200;
	let body: unknown = null;

	return {
		status: (code: number) => {
			status = code;
			return {
				json: (data: unknown) => {
					body = data;
					return new Response(JSON.stringify(data), {
						status,
						headers: Object.fromEntries(headers)
					});
				}
			};
		},
		json: (data: unknown) => {
			body = data;
			return new Response(JSON.stringify(data), {
				status,
				headers: Object.fromEntries(headers)
			});
		},
		setHeader: (key: string, value: string) => {
			headers.set(key, value);
		},
		getStatus: () => status,
		getBody: () => body
	};
}

// ============================================
// Time Mock Utilities
// ============================================

export function mockDate(date: Date | string | number): () => void {
	const originalDate = Date;
	const mockDateInstance = new originalDate(date);

	vi.spyOn(global, 'Date').mockImplementation(((...args: any[]) => {
		if (args.length === 0) {
			return mockDateInstance;
		}
		return new originalDate(...args);
	}) as any);

	// Also mock Date.now()
	vi.spyOn(Date, 'now').mockReturnValue(mockDateInstance.getTime());

	return () => {
		vi.restoreAllMocks();
	};
}

export function advanceTime(ms: number): void {
	const current = Date.now();
	vi.spyOn(Date, 'now').mockReturnValue(current + ms);
}

// ============================================
// Assertion Helpers
// ============================================

export function expectValidId(id: unknown): void {
	expect(typeof id).toBe('string');
	expect((id as string).length).toBeGreaterThan(0);
}

export function expectValidDate(date: unknown): void {
	expect(date instanceof Date || typeof date === 'string').toBe(true);
	const dateObj = new Date(date as string | Date);
	expect(isNaN(dateObj.getTime())).toBe(false);
}

export function expectUserShape(user: unknown): void {
	expect(user).toHaveProperty('id');
	expect(user).toHaveProperty('email');
	expect(user).toHaveProperty('firstName');
	expect(user).toHaveProperty('lastName');
	expect(user).toHaveProperty('userType');
	expect(user).toHaveProperty('trustScore');
}

export function expectFactShape(fact: unknown): void {
	expect(fact).toHaveProperty('id');
	expect(fact).toHaveProperty('title');
	expect(fact).toHaveProperty('body');
	expect(fact).toHaveProperty('status');
	expect(fact).toHaveProperty('authorId');
}

export function expectApiResponse(response: unknown): void {
	expect(response).toHaveProperty('success');
	if ((response as any).success) {
		expect(response).toHaveProperty('data');
	} else {
		expect(response).toHaveProperty('error');
	}
}

// ============================================
// Environment Mock Utilities
// ============================================

const originalEnv = { ...process.env };

export function mockEnv(env: Record<string, string>): () => void {
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

// ============================================
// Async Test Utilities
// ============================================

export async function expectAsyncError(
	fn: () => Promise<unknown>,
	errorMatcher?: string | RegExp | ((error: unknown) => boolean)
): Promise<void> {
	let thrown = false;
	let error: unknown;

	try {
		await fn();
	} catch (e) {
		thrown = true;
		error = e;
	}

	expect(thrown).toBe(true);

	if (errorMatcher) {
		if (typeof errorMatcher === 'string') {
			expect((error as Error).message).toContain(errorMatcher);
		} else if (errorMatcher instanceof RegExp) {
			expect((error as Error).message).toMatch(errorMatcher);
		} else {
			expect(errorMatcher(error)).toBe(true);
		}
	}
}

export function waitFor(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
