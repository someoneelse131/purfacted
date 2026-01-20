/**
 * T32: Test Factories
 *
 * Enhanced factory functions for creating test data with relationships.
 */

import type {
	MockUser,
	MockFact,
	MockSession,
	MockCategory,
	MockSource,
	MockVote
} from '../helpers';

// ID counter for unique IDs
let factoryCounter = 0;

/**
 * Generates a unique ID with optional prefix
 */
export function createId(prefix: string = 'id'): string {
	factoryCounter++;
	return `${prefix}-${factoryCounter}-${Date.now()}`;
}

/**
 * Resets the factory counter (call in beforeEach)
 */
export function resetFactoryCounter(): void {
	factoryCounter = 0;
}

// ============================================
// User Factories
// ============================================

export interface CreateUserOptions extends Partial<MockUser> {
	withSession?: boolean;
	withFacts?: number;
}

export function createUser(options: CreateUserOptions = {}): MockUser & { session?: MockSession; facts?: MockFact[] } {
	const id = options.id || createId('user');
	const user: MockUser = {
		id,
		email: options.email || `${id}@test.purfacted.com`,
		firstName: options.firstName || 'Test',
		lastName: options.lastName || 'User',
		passwordHash: options.passwordHash || '$argon2id$v=19$m=65536,t=3,p=4$hash',
		userType: options.userType || 'VERIFIED',
		trustScore: options.trustScore ?? 10,
		emailVerified: options.emailVerified ?? true,
		banLevel: options.banLevel ?? 0,
		bannedUntil: options.bannedUntil ?? null,
		createdAt: options.createdAt || new Date(),
		updatedAt: options.updatedAt || new Date(),
		lastLoginAt: options.lastLoginAt ?? null,
		deletedAt: options.deletedAt ?? null
	};

	const result: MockUser & { session?: MockSession; facts?: MockFact[] } = { ...user };

	if (options.withSession) {
		result.session = createSession({ userId: id });
	}

	if (options.withFacts) {
		result.facts = Array.from({ length: options.withFacts }, () =>
			createFact({ authorId: id })
		);
	}

	return result;
}

export function createVerifiedUser(options: Partial<MockUser> = {}): MockUser {
	return createUser({ userType: 'VERIFIED', trustScore: 10, ...options });
}

export function createExpertUser(options: Partial<MockUser> = {}): MockUser {
	return createUser({ userType: 'EXPERT', trustScore: 50, ...options });
}

export function createPhdUser(options: Partial<MockUser> = {}): MockUser {
	return createUser({ userType: 'PHD', trustScore: 75, ...options });
}

export function createOrganizationUser(options: Partial<MockUser> = {}): MockUser {
	return createUser({ userType: 'ORGANIZATION', trustScore: 100, ...options });
}

export function createModeratorUser(options: Partial<MockUser> = {}): MockUser {
	return createUser({ userType: 'MODERATOR', trustScore: 60, ...options });
}

export function createAnonymousUser(options: Partial<MockUser> = {}): MockUser {
	return createUser({ userType: 'ANONYMOUS', trustScore: 0, emailVerified: false, ...options });
}

export function createBannedUser(level: number = 1, options: Partial<MockUser> = {}): MockUser {
	const bannedUntil = level >= 3
		? new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000)
		: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

	return createUser({ banLevel: level, bannedUntil, ...options });
}

// ============================================
// Fact Factories
// ============================================

export interface CreateFactOptions extends Partial<MockFact> {
	withSources?: number;
	withVotes?: { upvotes?: number; downvotes?: number };
}

export function createFact(options: CreateFactOptions = {}): MockFact & { sources?: MockSource[]; votes?: MockVote[] } {
	const id = options.id || createId('fact');
	const fact: MockFact = {
		id,
		title: options.title || `Test Fact ${id}`,
		body: options.body || 'This is a test fact with sufficient content for validation.',
		status: options.status || 'SUBMITTED',
		upvotes: options.upvotes ?? 0,
		downvotes: options.downvotes ?? 0,
		weightedScore: options.weightedScore ?? 0,
		authorId: options.authorId || createId('user'),
		categoryId: options.categoryId ?? null,
		createdAt: options.createdAt || new Date(),
		updatedAt: options.updatedAt || new Date(),
		deletedAt: options.deletedAt ?? null
	};

	const result: MockFact & { sources?: MockSource[]; votes?: MockVote[] } = { ...fact };

	if (options.withSources) {
		result.sources = Array.from({ length: options.withSources }, () =>
			createSource({ factId: id })
		);
	}

	if (options.withVotes) {
		result.votes = [];
		for (let i = 0; i < (options.withVotes.upvotes || 0); i++) {
			result.votes.push(createVote({ factId: id, value: 1 }));
		}
		for (let i = 0; i < (options.withVotes.downvotes || 0); i++) {
			result.votes.push(createVote({ factId: id, value: -1 }));
		}
	}

	return result;
}

export function createProvenFact(options: Partial<MockFact> = {}): MockFact {
	return createFact({
		status: 'PROVEN',
		upvotes: 15,
		downvotes: 2,
		weightedScore: 25.5,
		...options
	});
}

export function createDisprovenFact(options: Partial<MockFact> = {}): MockFact {
	return createFact({
		status: 'DISPROVEN',
		upvotes: 2,
		downvotes: 15,
		weightedScore: -25.5,
		...options
	});
}

export function createDisputedFact(options: Partial<MockFact> = {}): MockFact {
	return createFact({
		status: 'DISPUTED',
		upvotes: 10,
		downvotes: 9,
		weightedScore: 0.5,
		...options
	});
}

// ============================================
// Session Factories
// ============================================

export function createSession(options: Partial<MockSession> = {}): MockSession {
	const id = options.id || createId('session');
	return {
		id,
		userId: options.userId || createId('user'),
		expiresAt: options.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000)
	};
}

export function createExpiredSession(options: Partial<MockSession> = {}): MockSession {
	return createSession({
		expiresAt: new Date(Date.now() - 1000),
		...options
	});
}

// ============================================
// Category Factories
// ============================================

export function createCategory(options: Partial<MockCategory> = {}): MockCategory {
	const id = options.id || createId('category');
	const name = options.name || `Category ${id}`;
	return {
		id,
		name,
		normalizedName: name.toLowerCase().trim(),
		parentId: options.parentId ?? null,
		factCount: options.factCount ?? 0,
		createdAt: options.createdAt || new Date(),
		updatedAt: options.updatedAt || new Date()
	};
}

export function createCategoryWithChildren(
	childCount: number = 2,
	options: Partial<MockCategory> = {}
): MockCategory & { children: MockCategory[] } {
	const parent = createCategory(options);
	const children = Array.from({ length: childCount }, (_, i) =>
		createCategory({ parentId: parent.id, name: `${parent.name} - Child ${i + 1}` })
	);
	return { ...parent, children };
}

// ============================================
// Source Factories
// ============================================

export function createSource(options: Partial<MockSource> = {}): MockSource {
	const id = options.id || createId('source');
	return {
		id,
		url: options.url || `https://example.com/source/${id}`,
		title: options.title ?? `Source ${id}`,
		type: options.type || 'NEWS',
		credibilityScore: options.credibilityScore ?? 50,
		factId: options.factId || createId('fact'),
		createdAt: options.createdAt || new Date()
	};
}

export function createAcademicSource(options: Partial<MockSource> = {}): MockSource {
	return createSource({
		type: 'ACADEMIC',
		credibilityScore: 85,
		url: 'https://university.edu/research/paper.pdf',
		...options
	});
}

export function createGovernmentSource(options: Partial<MockSource> = {}): MockSource {
	return createSource({
		type: 'GOVERNMENT',
		credibilityScore: 80,
		url: 'https://gov.example/official-data',
		...options
	});
}

// ============================================
// Vote Factories
// ============================================

export function createVote(options: Partial<MockVote> = {}): MockVote {
	const id = options.id || createId('vote');
	return {
		id,
		value: options.value ?? 1,
		weight: options.weight ?? 2.0,
		userId: options.userId || createId('user'),
		factId: options.factId || createId('fact'),
		createdAt: options.createdAt || new Date(),
		updatedAt: options.updatedAt || new Date()
	};
}

export function createUpvote(options: Partial<MockVote> = {}): MockVote {
	return createVote({ value: 1, ...options });
}

export function createDownvote(options: Partial<MockVote> = {}): MockVote {
	return createVote({ value: -1, ...options });
}

// ============================================
// Notification Factories
// ============================================

export interface MockNotification {
	id: string;
	type: string;
	userId: string;
	message: string;
	read: boolean;
	metadata?: Record<string, unknown>;
	createdAt: Date;
}

export function createNotification(options: Partial<MockNotification> = {}): MockNotification {
	const id = options.id || createId('notif');
	return {
		id,
		type: options.type || 'FACT_REPLY',
		userId: options.userId || createId('user'),
		message: options.message || 'Test notification',
		read: options.read ?? false,
		metadata: options.metadata,
		createdAt: options.createdAt || new Date()
	};
}

// ============================================
// Queue Item Factories
// ============================================

export interface MockQueueItem {
	id: string;
	type: string;
	contentId: string;
	contentType: string;
	status: string;
	reason?: string;
	assignedToId?: string;
	createdAt: Date;
}

export function createQueueItem(options: Partial<MockQueueItem> = {}): MockQueueItem {
	const id = options.id || createId('queue');
	return {
		id,
		type: options.type || 'REPORTED_CONTENT',
		contentId: options.contentId || createId('content'),
		contentType: options.contentType || 'FACT',
		status: options.status || 'PENDING',
		reason: options.reason,
		assignedToId: options.assignedToId,
		createdAt: options.createdAt || new Date()
	};
}
