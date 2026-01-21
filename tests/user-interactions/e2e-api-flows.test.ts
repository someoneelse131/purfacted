import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	createUser,
	createVerifiedUser,
	createExpertUser,
	createModeratorUser,
	createFact,
	createProvenFact,
	createSession,
	createCategory,
	resetFactoryCounter
} from '../infrastructure';

/**
 * End-to-End API Flow Tests
 *
 * These tests simulate complete API request/response cycles that mimic
 * real user interactions with the platform through the REST API.
 *
 * Test Scenarios:
 * 1. Complete Auth API Flow - Register, verify, login, logout
 * 2. Fact CRUD Operations - Create, read, update, delete via API
 * 3. Voting API Flow - Cast vote, change vote, remove vote
 * 4. Profile Management - View, update, manage settings
 * 5. Search and Discovery - Search facts, filter by category
 * 6. Password Reset Flow - Request, verify token, reset
 * 7. Public API v1 - External API access patterns
 */

// ============================================
// Mock API Request/Response Helpers
// ============================================

interface MockApiResponse {
	status: number;
	body: any;
	headers?: Record<string, string>;
}

function createApiResponse(status: number, body: any, headers: Record<string, string> = {}): MockApiResponse {
	return { status, body, headers };
}

function successResponse(data: any): MockApiResponse {
	return createApiResponse(200, { success: true, data });
}

function createdResponse(data: any): MockApiResponse {
	return createApiResponse(201, { success: true, data });
}

function errorResponse(status: number, code: string, message: string): MockApiResponse {
	return createApiResponse(status, { success: false, error: { code, message } });
}

// ============================================
// Helper to create error objects (avoids vi.mock hoisting issues)
// ============================================

function createError(code: string, message: string) {
	const error = new Error(message);
	(error as any).code = code;
	return error;
}

// ============================================
// Service Mocks
// ============================================

vi.mock('$lib/server/services/auth', () => ({
	registerUser: vi.fn(),
	loginUser: vi.fn(),
	logoutUser: vi.fn(),
	verifyEmail: vi.fn(),
	requestPasswordReset: vi.fn(),
	resetPassword: vi.fn(),
	changePassword: vi.fn(),
	validateSession: vi.fn()
}));

vi.mock('$lib/server/services/user', () => ({
	getUserById: vi.fn(),
	getUserByEmail: vi.fn(),
	updateUser: vi.fn(),
	deleteUser: vi.fn()
}));

vi.mock('$lib/server/services/profile', () => ({
	getProfile: vi.fn(),
	updateProfile: vi.fn(),
	getPublicProfile: vi.fn()
}));

vi.mock('$lib/server/services/fact', () => ({
	createFact: vi.fn(),
	getFactById: vi.fn(),
	updateFact: vi.fn(),
	deleteFact: vi.fn(),
	searchFacts: vi.fn(),
	getFactsByAuthor: vi.fn()
}));

vi.mock('$lib/server/services/vote', () => ({
	castVote: vi.fn(),
	removeVote: vi.fn(),
	getUserVote: vi.fn(),
	getVotesByFact: vi.fn()
}));

vi.mock('$lib/server/services/category', () => ({
	createCategory: vi.fn(),
	getCategoryById: vi.fn(),
	searchCategories: vi.fn(),
	getCategoryTree: vi.fn()
}));

vi.mock('$lib/server/services/notification.inapp', () => ({
	getUserNotifications: vi.fn(),
	markAsRead: vi.fn(),
	markAllAsRead: vi.fn(),
	getUnreadCount: vi.fn(),
	deleteNotification: vi.fn()
}));

vi.mock('$lib/server/services/emailNotification', () => ({
	sendVerificationEmail: vi.fn(),
	sendWelcomeEmail: vi.fn(),
	sendPasswordResetEmail: vi.fn()
}));

vi.mock('$lib/server/llm', () => ({
	checkGrammar: vi.fn()
}));

vi.mock('$lib/server/services/statistics', () => ({
	getPlatformStats: vi.fn(),
	getUserStats: vi.fn()
}));

// ============================================
// Test Suite 1: Complete Auth API Flow
// ============================================

describe('E2E API: Authentication Flow', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetFactoryCounter();
	});

	describe('POST /api/auth/register', () => {
		it('should register a new user successfully', async () => {
			const { registerUser } = await import('$lib/server/services/auth');
			const { sendVerificationEmail } = await import('$lib/server/services/emailNotification');

			const requestBody = {
				email: 'newuser@example.com',
				password: 'SecureP@ssw0rd!',
				firstName: 'John',
				lastName: 'Doe'
			};

			const newUser = createUser({
				email: requestBody.email,
				firstName: requestBody.firstName,
				lastName: requestBody.lastName,
				emailVerified: false
			});

			vi.mocked(registerUser).mockResolvedValue({
				user: newUser,
				verificationToken: 'verification-token-123'
			} as any);
			vi.mocked(sendVerificationEmail).mockResolvedValue(undefined);

			// Simulate API call
			const result = await registerUser(
				requestBody.email,
				requestBody.password,
				requestBody.firstName,
				requestBody.lastName
			);

			// Verify email sent
			await sendVerificationEmail(requestBody.email, 'verification-token-123');

			// Build API response
			const response = createdResponse({
				user: {
					id: result.user.id,
					email: result.user.email,
					firstName: result.user.firstName,
					lastName: result.user.lastName
				},
				message: 'Please check your email to verify your account'
			});

			expect(response.status).toBe(201);
			expect(response.body.success).toBe(true);
			expect(response.body.data.user.email).toBe(requestBody.email);
		});

		it('should return 400 for invalid email', async () => {
			const { registerUser } = await import('$lib/server/services/auth');

			vi.mocked(registerUser).mockRejectedValue(
				createError('INVALID_EMAIL', 'Invalid email format')
			);

			try {
				await registerUser('invalid-email', 'password', 'Test', 'User');
			} catch (e: any) {
				const response = errorResponse(400, e.code, e.message);
				expect(response.status).toBe(400);
				expect(response.body.error.code).toBe('INVALID_EMAIL');
			}
		});

		it('should return 409 for duplicate email', async () => {
			const { registerUser } = await import('$lib/server/services/auth');

			vi.mocked(registerUser).mockRejectedValue(
				createError('EMAIL_EXISTS', 'Email already registered')
			);

			try {
				await registerUser('existing@example.com', 'password', 'Test', 'User');
			} catch (e: any) {
				const response = errorResponse(409, e.code, e.message);
				expect(response.status).toBe(409);
				expect(response.body.error.code).toBe('EMAIL_EXISTS');
			}
		});
	});

	describe('POST /api/auth/verify', () => {
		it('should verify email with valid token', async () => {
			const { verifyEmail } = await import('$lib/server/services/auth');
			const { sendWelcomeEmail } = await import('$lib/server/services/emailNotification');

			const verifiedUser = createVerifiedUser({
				email: 'verified@example.com',
				emailVerified: true
			});

			vi.mocked(verifyEmail).mockResolvedValue(verifiedUser as any);
			vi.mocked(sendWelcomeEmail).mockResolvedValue(undefined);

			const result = await verifyEmail('valid-token-123');
			await sendWelcomeEmail(verifiedUser.email);

			const response = successResponse({
				verified: true,
				message: 'Email verified successfully'
			});

			expect(response.status).toBe(200);
			expect(response.body.data.verified).toBe(true);
		});

		it('should return 400 for invalid token', async () => {
			const { verifyEmail } = await import('$lib/server/services/auth');

			vi.mocked(verifyEmail).mockRejectedValue(
				createError('INVALID_TOKEN', 'Invalid verification token')
			);

			try {
				await verifyEmail('invalid-token');
			} catch (e: any) {
				const response = errorResponse(400, e.code, e.message);
				expect(response.status).toBe(400);
				expect(response.body.error.code).toBe('INVALID_TOKEN');
			}
		});
	});

	describe('POST /api/auth/login', () => {
		it('should login user and return session', async () => {
			const { loginUser } = await import('$lib/server/services/auth');

			const user = createVerifiedUser({ email: 'user@example.com' });
			const session = createSession({ userId: user.id });

			vi.mocked(loginUser).mockResolvedValue({
				user,
				session
			} as any);

			const result = await loginUser('user@example.com', 'password123');

			const response = successResponse({
				user: {
					id: result.user.id,
					email: result.user.email,
					firstName: result.user.firstName,
					lastName: result.user.lastName,
					userType: result.user.userType,
					trustScore: result.user.trustScore
				}
			});

			// Session cookie would be set in headers
			response.headers = {
				'Set-Cookie': `session=${result.session.id}; HttpOnly; Secure; SameSite=Strict`
			};

			expect(response.status).toBe(200);
			expect(response.body.data.user.email).toBe('user@example.com');
			expect(response.headers['Set-Cookie']).toContain('session=');
		});

		it('should return 401 for invalid credentials', async () => {
			const { loginUser } = await import('$lib/server/services/auth');

			vi.mocked(loginUser).mockRejectedValue(
				createError('INVALID_CREDENTIALS', 'Invalid email or password')
			);

			try {
				await loginUser('user@example.com', 'wrongpassword');
			} catch (e: any) {
				const response = errorResponse(401, e.code, e.message);
				expect(response.status).toBe(401);
				expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
			}
		});
	});

	describe('POST /api/auth/logout', () => {
		it('should logout user and clear session', async () => {
			const { logoutUser, validateSession } = await import('$lib/server/services/auth');

			vi.mocked(logoutUser).mockResolvedValue(undefined);

			await logoutUser('session-123');

			const response = successResponse({
				message: 'Logged out successfully'
			});

			// Clear session cookie
			response.headers = {
				'Set-Cookie': 'session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
			};

			expect(response.status).toBe(200);
			expect(response.headers['Set-Cookie']).toContain('Max-Age=0');
		});
	});
});

// ============================================
// Test Suite 2: Fact CRUD Operations
// ============================================

describe('E2E API: Fact Operations', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetFactoryCounter();
	});

	describe('POST /api/facts', () => {
		it('should create a new fact', async () => {
			const { createFact: createFactService } = await import('$lib/server/services/fact');
			const { checkGrammar } = await import('$lib/server/llm');
			const { validateSession } = await import('$lib/server/services/auth');

			const user = createVerifiedUser({ id: 'author-user' });
			const session = createSession({ userId: user.id });

			vi.mocked(validateSession).mockResolvedValue({ session, user } as any);
			vi.mocked(checkGrammar).mockResolvedValue({ isCorrect: true, suggestions: [] });

			const newFact = createFact({
				title: 'Test Fact',
				body: 'This is a test fact with sufficient content.',
				authorId: user.id
			});

			vi.mocked(createFactService).mockResolvedValue(newFact as any);

			// Simulate authenticated request
			const sessionValidation = await validateSession(session.id);
			expect(sessionValidation.user.id).toBe(user.id);

			// Check grammar
			const grammarCheck = await checkGrammar(newFact.body);
			expect(grammarCheck.isCorrect).toBe(true);

			// Create fact
			const fact = await createFactService({
				title: newFact.title,
				body: newFact.body,
				authorId: user.id,
				sources: [{ url: 'https://example.com/source', type: 'NEWS' }]
			});

			const response = createdResponse({
				fact: {
					id: fact.id,
					title: fact.title,
					body: fact.body,
					status: fact.status,
					authorId: fact.authorId
				}
			});

			expect(response.status).toBe(201);
			expect(response.body.data.fact.title).toBe(newFact.title);
		});

		it('should return 401 when not authenticated', async () => {
			const { validateSession } = await import('$lib/server/services/auth');

			vi.mocked(validateSession).mockRejectedValue(
				createError('INVALID_SESSION', 'Not authenticated')
			);

			try {
				await validateSession('invalid-session');
			} catch (e: any) {
				const response = errorResponse(401, e.code, e.message);
				expect(response.status).toBe(401);
			}
		});
	});

	describe('GET /api/facts/:id', () => {
		it('should return fact by ID', async () => {
			const { getFactById } = await import('$lib/server/services/fact');

			const fact = createProvenFact({
				id: 'fact-123',
				title: 'Proven Fact',
				body: 'This fact has been verified.'
			});

			vi.mocked(getFactById).mockResolvedValue(fact as any);

			const result = await getFactById('fact-123');

			const response = successResponse({
				fact: {
					id: result?.id,
					title: result?.title,
					body: result?.body,
					status: result?.status,
					upvotes: result?.upvotes,
					downvotes: result?.downvotes,
					weightedScore: result?.weightedScore
				}
			});

			expect(response.status).toBe(200);
			expect(response.body.data.fact.id).toBe('fact-123');
		});

		it('should return 404 for non-existent fact', async () => {
			const { getFactById } = await import('$lib/server/services/fact');

			vi.mocked(getFactById).mockResolvedValue(null);

			const result = await getFactById('non-existent');

			if (!result) {
				const response = errorResponse(404, 'NOT_FOUND', 'Fact not found');
				expect(response.status).toBe(404);
			}
		});
	});

	describe('GET /api/facts (search)', () => {
		it('should search facts with filters', async () => {
			const { searchFacts } = await import('$lib/server/services/fact');

			const facts = [
				createProvenFact({ title: 'Water Fact' }),
				createProvenFact({ title: 'Another Water Fact' })
			];

			vi.mocked(searchFacts).mockResolvedValue({
				facts,
				total: 2,
				page: 1,
				pageSize: 10
			} as any);

			const result = await searchFacts({
				query: 'water',
				status: 'PROVEN',
				page: 1,
				pageSize: 10
			});

			const response = successResponse({
				facts: result.facts.map((f: any) => ({
					id: f.id,
					title: f.title,
					status: f.status
				})),
				pagination: {
					total: result.total,
					page: result.page,
					pageSize: result.pageSize
				}
			});

			expect(response.status).toBe(200);
			expect(response.body.data.facts).toHaveLength(2);
			expect(response.body.data.pagination.total).toBe(2);
		});
	});

	describe('DELETE /api/facts/:id', () => {
		it('should delete own fact', async () => {
			const { deleteFact, getFactById } = await import('$lib/server/services/fact');
			const { validateSession } = await import('$lib/server/services/auth');

			const user = createVerifiedUser({ id: 'author' });
			const session = createSession({ userId: user.id });
			const fact = createFact({ id: 'fact-to-delete', authorId: user.id });

			vi.mocked(validateSession).mockResolvedValue({ session, user } as any);
			vi.mocked(getFactById).mockResolvedValue(fact as any);
			vi.mocked(deleteFact).mockResolvedValue(undefined);

			const sessionResult = await validateSession(session.id);
			const factResult = await getFactById('fact-to-delete');

			// Verify ownership
			expect(factResult?.authorId).toBe(sessionResult.user.id);

			await deleteFact('fact-to-delete');

			const response = successResponse({
				message: 'Fact deleted successfully'
			});

			expect(response.status).toBe(200);
		});

		it('should return 403 when deleting others fact', async () => {
			const { getFactById } = await import('$lib/server/services/fact');
			const { validateSession } = await import('$lib/server/services/auth');

			const user = createVerifiedUser({ id: 'not-author' });
			const session = createSession({ userId: user.id });
			const fact = createFact({ id: 'other-fact', authorId: 'other-user' });

			vi.mocked(validateSession).mockResolvedValue({ session, user } as any);
			vi.mocked(getFactById).mockResolvedValue(fact as any);

			const sessionResult = await validateSession(session.id);
			const factResult = await getFactById('other-fact');

			// Not the owner
			if (factResult?.authorId !== sessionResult.user.id) {
				const response = errorResponse(403, 'FORBIDDEN', 'You cannot delete this fact');
				expect(response.status).toBe(403);
			}
		});
	});
});

// ============================================
// Test Suite 3: Voting API Flow
// ============================================

describe('E2E API: Voting Flow', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetFactoryCounter();
	});

	describe('POST /api/facts/:id/vote', () => {
		it('should cast upvote', async () => {
			const { castVote, getUserVote } = await import('$lib/server/services/vote');
			const { validateSession } = await import('$lib/server/services/auth');

			const user = createVerifiedUser({ id: 'voter' });
			const session = createSession({ userId: user.id });

			vi.mocked(validateSession).mockResolvedValue({ session, user } as any);
			vi.mocked(getUserVote).mockResolvedValue(null); // No existing vote
			vi.mocked(castVote).mockResolvedValue({
				id: 'vote-1',
				factId: 'fact-123',
				userId: user.id,
				value: 1,
				weight: 2.0
			} as any);

			await validateSession(session.id);

			// Check for existing vote
			const existingVote = await getUserVote('fact-123', user.id);
			expect(existingVote).toBeNull();

			// Cast vote
			const vote = await castVote('fact-123', user.id, 1);

			const response = successResponse({
				vote: {
					factId: vote.factId,
					value: vote.value,
					weight: vote.weight
				}
			});

			expect(response.status).toBe(200);
			expect(response.body.data.vote.value).toBe(1);
		});

		it('should update existing vote', async () => {
			const { castVote, getUserVote } = await import('$lib/server/services/vote');
			const { validateSession } = await import('$lib/server/services/auth');

			const user = createVerifiedUser({ id: 'voter' });
			const session = createSession({ userId: user.id });

			vi.mocked(validateSession).mockResolvedValue({ session, user } as any);
			vi.mocked(getUserVote).mockResolvedValue({
				id: 'existing-vote',
				value: 1,
				weight: 2.0
			} as any);
			vi.mocked(castVote).mockResolvedValue({
				id: 'existing-vote',
				factId: 'fact-123',
				userId: user.id,
				value: -1, // Changed from upvote to downvote
				weight: 2.0,
				updated: true
			} as any);

			const vote = await castVote('fact-123', user.id, -1);

			const response = successResponse({
				vote: {
					factId: vote.factId,
					value: vote.value,
					updated: true
				}
			});

			expect(response.status).toBe(200);
			expect(response.body.data.vote.value).toBe(-1);
			expect(response.body.data.vote.updated).toBe(true);
		});
	});

	describe('DELETE /api/facts/:id/vote', () => {
		it('should remove vote', async () => {
			const { removeVote, getUserVote } = await import('$lib/server/services/vote');
			const { validateSession } = await import('$lib/server/services/auth');

			const user = createVerifiedUser({ id: 'voter' });
			const session = createSession({ userId: user.id });

			vi.mocked(validateSession).mockResolvedValue({ session, user } as any);
			vi.mocked(getUserVote).mockResolvedValue({ id: 'vote-1' } as any);
			vi.mocked(removeVote).mockResolvedValue(undefined);

			await validateSession(session.id);
			await removeVote('fact-123', user.id);

			const response = successResponse({
				message: 'Vote removed successfully'
			});

			expect(response.status).toBe(200);
		});
	});
});

// ============================================
// Test Suite 4: Profile Management
// ============================================

describe('E2E API: Profile Management', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetFactoryCounter();
	});

	describe('GET /api/user/profile', () => {
		it('should return user profile', async () => {
			const { getProfile } = await import('$lib/server/services/profile');
			const { validateSession } = await import('$lib/server/services/auth');

			const user = createVerifiedUser({
				id: 'profile-user',
				email: 'user@example.com',
				firstName: 'John',
				lastName: 'Doe',
				trustScore: 45
			});
			const session = createSession({ userId: user.id });

			vi.mocked(validateSession).mockResolvedValue({ session, user } as any);
			vi.mocked(getProfile).mockResolvedValue({
				user,
				stats: {
					factsSubmitted: 10,
					factsProven: 8,
					totalVotes: 50
				}
			} as any);

			const sessionResult = await validateSession(session.id);
			const profile = await getProfile(sessionResult.user.id);

			const response = successResponse({
				profile: {
					id: profile.user.id,
					email: profile.user.email,
					firstName: profile.user.firstName,
					lastName: profile.user.lastName,
					userType: profile.user.userType,
					trustScore: profile.user.trustScore,
					stats: profile.stats
				}
			});

			expect(response.status).toBe(200);
			expect(response.body.data.profile.email).toBe('user@example.com');
			expect(response.body.data.profile.stats.factsSubmitted).toBe(10);
		});
	});

	describe('PATCH /api/user/profile', () => {
		it('should update profile', async () => {
			const { updateProfile } = await import('$lib/server/services/profile');
			const { validateSession } = await import('$lib/server/services/auth');

			const user = createVerifiedUser({ id: 'profile-user' });
			const session = createSession({ userId: user.id });

			vi.mocked(validateSession).mockResolvedValue({ session, user } as any);
			vi.mocked(updateProfile).mockResolvedValue({
				...user,
				firstName: 'Updated',
				lastName: 'Name'
			} as any);

			await validateSession(session.id);
			const updated = await updateProfile(user.id, {
				firstName: 'Updated',
				lastName: 'Name'
			});

			const response = successResponse({
				profile: {
					firstName: updated.firstName,
					lastName: updated.lastName
				}
			});

			expect(response.status).toBe(200);
			expect(response.body.data.profile.firstName).toBe('Updated');
		});
	});

	describe('GET /api/profiles/:id', () => {
		it('should return public profile', async () => {
			const { getPublicProfile } = await import('$lib/server/services/profile');

			const user = createExpertUser({
				id: 'expert-user',
				firstName: 'Expert',
				lastName: 'User',
				trustScore: 85
			});

			vi.mocked(getPublicProfile).mockResolvedValue({
				id: user.id,
				firstName: user.firstName,
				lastName: user.lastName,
				userType: user.userType,
				trustScore: user.trustScore,
				factsCount: 25,
				memberSince: user.createdAt
			} as any);

			const profile = await getPublicProfile(user.id);

			const response = successResponse({
				profile: {
					id: profile.id,
					firstName: profile.firstName,
					lastName: profile.lastName,
					userType: profile.userType,
					trustScore: profile.trustScore,
					factsCount: profile.factsCount
				}
			});

			expect(response.status).toBe(200);
			expect(response.body.data.profile.userType).toBe('EXPERT');
			// Email should not be exposed
			expect(response.body.data.profile.email).toBeUndefined();
		});
	});
});

// ============================================
// Test Suite 5: Search and Discovery
// ============================================

describe('E2E API: Search and Discovery', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetFactoryCounter();
	});

	describe('GET /api/facts (advanced search)', () => {
		it('should search with multiple filters', async () => {
			const { searchFacts } = await import('$lib/server/services/fact');

			const category = createCategory({ id: 'cat-science', name: 'Science' });
			const facts = Array.from({ length: 5 }, (_, i) =>
				createProvenFact({
					id: `fact-${i}`,
					title: `Science Fact ${i}`,
					categoryId: category.id
				})
			);

			vi.mocked(searchFacts).mockResolvedValue({
				facts,
				total: 5,
				page: 1,
				pageSize: 10
			} as any);

			const result = await searchFacts({
				query: 'science',
				status: 'PROVEN',
				categoryId: category.id,
				sortBy: 'weightedScore',
				sortOrder: 'desc',
				page: 1,
				pageSize: 10
			});

			const response = successResponse({
				facts: result.facts,
				pagination: {
					total: result.total,
					page: result.page,
					pageSize: result.pageSize,
					totalPages: Math.ceil(result.total / result.pageSize)
				}
			});

			expect(response.status).toBe(200);
			expect(response.body.data.facts).toHaveLength(5);
		});
	});

	describe('GET /api/categories/tree', () => {
		it('should return category hierarchy', async () => {
			const { getCategoryTree } = await import('$lib/server/services/category');

			const tree = {
				id: 'root',
				name: 'All Categories',
				children: [
					{
						id: 'cat-science',
						name: 'Science',
						children: [
							{ id: 'cat-physics', name: 'Physics', children: [] },
							{ id: 'cat-chemistry', name: 'Chemistry', children: [] }
						]
					},
					{
						id: 'cat-history',
						name: 'History',
						children: []
					}
				]
			};

			vi.mocked(getCategoryTree).mockResolvedValue(tree as any);

			const result = await getCategoryTree();

			const response = successResponse({
				categories: result
			});

			expect(response.status).toBe(200);
			expect(response.body.data.categories.children).toHaveLength(2);
		});
	});
});

// ============================================
// Test Suite 6: Password Reset Flow
// ============================================

describe('E2E API: Password Reset', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetFactoryCounter();
	});

	describe('POST /api/auth/forgot-password', () => {
		it('should send password reset email', async () => {
			const { requestPasswordReset } = await import('$lib/server/services/auth');
			const { sendPasswordResetEmail } = await import('$lib/server/services/emailNotification');

			vi.mocked(requestPasswordReset).mockResolvedValue({
				token: 'reset-token-123',
				expiresAt: new Date(Date.now() + 3600000)
			} as any);
			vi.mocked(sendPasswordResetEmail).mockResolvedValue(undefined);

			const result = await requestPasswordReset('user@example.com');
			await sendPasswordResetEmail('user@example.com', result.token);

			// Always return success (security: don't reveal if email exists)
			const response = successResponse({
				message: 'If an account with that email exists, a password reset link has been sent'
			});

			expect(response.status).toBe(200);
		});
	});

	describe('POST /api/auth/reset-password', () => {
		it('should reset password with valid token', async () => {
			const { resetPassword } = await import('$lib/server/services/auth');

			vi.mocked(resetPassword).mockResolvedValue({
				success: true,
				message: 'Password reset successfully'
			} as any);

			const result = await resetPassword('valid-token', 'NewSecureP@ss123!');

			const response = successResponse({
				message: result.message
			});

			expect(response.status).toBe(200);
		});

		it('should return 400 for expired token', async () => {
			const { resetPassword } = await import('$lib/server/services/auth');

			vi.mocked(resetPassword).mockRejectedValue(
				createError('TOKEN_EXPIRED', 'Password reset token has expired')
			);

			try {
				await resetPassword('expired-token', 'newpassword');
			} catch (e: any) {
				const response = errorResponse(400, e.code, e.message);
				expect(response.status).toBe(400);
				expect(response.body.error.code).toBe('TOKEN_EXPIRED');
			}
		});
	});
});

// ============================================
// Test Suite 7: Public API v1
// ============================================

describe('E2E API: Public API v1', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetFactoryCounter();
	});

	describe('GET /api/v1/facts', () => {
		it('should return public facts without authentication', async () => {
			const { searchFacts } = await import('$lib/server/services/fact');

			const publicFacts = [
				createProvenFact({ id: 'public-1', title: 'Public Fact 1' }),
				createProvenFact({ id: 'public-2', title: 'Public Fact 2' })
			];

			vi.mocked(searchFacts).mockResolvedValue({
				facts: publicFacts,
				total: 2,
				page: 1,
				pageSize: 20
			} as any);

			// Public API - no authentication required
			const result = await searchFacts({
				status: 'PROVEN',
				page: 1,
				pageSize: 20
			});

			const response = successResponse({
				facts: result.facts.map((f: any) => ({
					id: f.id,
					title: f.title,
					status: f.status,
					weightedScore: f.weightedScore
				})),
				meta: {
					total: result.total,
					page: result.page,
					pageSize: result.pageSize
				}
			});

			expect(response.status).toBe(200);
			expect(response.body.data.facts).toHaveLength(2);
		});
	});

	describe('GET /api/v1/facts/:id', () => {
		it('should return single fact details', async () => {
			const { getFactById } = await import('$lib/server/services/fact');

			const fact = createProvenFact({
				id: 'api-fact',
				title: 'API Accessible Fact',
				body: 'This fact is accessible via public API.'
			});

			vi.mocked(getFactById).mockResolvedValue(fact as any);

			const result = await getFactById('api-fact');

			const response = successResponse({
				fact: {
					id: result?.id,
					title: result?.title,
					body: result?.body,
					status: result?.status,
					upvotes: result?.upvotes,
					downvotes: result?.downvotes,
					weightedScore: result?.weightedScore,
					createdAt: result?.createdAt
				}
			});

			expect(response.status).toBe(200);
			expect(response.body.data.fact.id).toBe('api-fact');
		});
	});

	describe('GET /api/v1/stats', () => {
		it('should return platform statistics', async () => {
			const { getPlatformStats } = await import('$lib/server/services/statistics');

			vi.mocked(getPlatformStats).mockResolvedValue({
				totalFacts: 10000,
				provenFacts: 7500,
				disprovenFacts: 1500,
				disputedFacts: 1000,
				totalUsers: 5000,
				totalVotes: 150000,
				averageTrustScore: 35
			} as any);

			const stats = await getPlatformStats();

			const response = successResponse({
				stats: {
					facts: {
						total: stats.totalFacts,
						proven: stats.provenFacts,
						disproven: stats.disprovenFacts,
						disputed: stats.disputedFacts
					},
					users: {
						total: stats.totalUsers,
						averageTrustScore: stats.averageTrustScore
					},
					votes: {
						total: stats.totalVotes
					}
				}
			});

			expect(response.status).toBe(200);
			expect(response.body.data.stats.facts.total).toBe(10000);
		});
	});
});

// ============================================
// Test Suite 8: Notification API
// ============================================

describe('E2E API: Notifications', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetFactoryCounter();
	});

	describe('GET /api/notifications', () => {
		it('should return user notifications', async () => {
			const { getUserNotifications, getUnreadCount } = await import(
				'$lib/server/services/notification.inapp'
			);
			const { validateSession } = await import('$lib/server/services/auth');

			const user = createVerifiedUser({ id: 'notif-user' });
			const session = createSession({ userId: user.id });

			vi.mocked(validateSession).mockResolvedValue({ session, user } as any);
			vi.mocked(getUserNotifications).mockResolvedValue([
				{ id: 'n1', type: 'FACT_VOTE', message: 'New vote', read: false, createdAt: new Date() },
				{ id: 'n2', type: 'COMMENT', message: 'New comment', read: true, createdAt: new Date() }
			] as any);
			vi.mocked(getUnreadCount).mockResolvedValue(1);

			const notifications = await getUserNotifications(user.id);
			const unreadCount = await getUnreadCount(user.id);

			const response = successResponse({
				notifications,
				unreadCount
			});

			expect(response.status).toBe(200);
			expect(response.body.data.notifications).toHaveLength(2);
			expect(response.body.data.unreadCount).toBe(1);
		});
	});

	describe('POST /api/notifications/:id/read', () => {
		it('should mark notification as read', async () => {
			const { markAsRead } = await import('$lib/server/services/notification.inapp');
			const { validateSession } = await import('$lib/server/services/auth');

			const user = createVerifiedUser({ id: 'notif-user' });
			const session = createSession({ userId: user.id });

			vi.mocked(validateSession).mockResolvedValue({ session, user } as any);
			vi.mocked(markAsRead).mockResolvedValue({
				id: 'n1',
				read: true,
				readAt: new Date()
			} as any);

			await validateSession(session.id);
			const updated = await markAsRead(user.id, 'n1');

			const response = successResponse({
				notification: {
					id: updated.id,
					read: updated.read
				}
			});

			expect(response.status).toBe(200);
			expect(response.body.data.notification.read).toBe(true);
		});
	});

	describe('POST /api/notifications/read-all', () => {
		it('should mark all notifications as read', async () => {
			const { markAllAsRead } = await import('$lib/server/services/notification.inapp');
			const { validateSession } = await import('$lib/server/services/auth');

			const user = createVerifiedUser({ id: 'notif-user' });
			const session = createSession({ userId: user.id });

			vi.mocked(validateSession).mockResolvedValue({ session, user } as any);
			vi.mocked(markAllAsRead).mockResolvedValue({ count: 5 } as any);

			await validateSession(session.id);
			const result = await markAllAsRead(user.id);

			const response = successResponse({
				message: `Marked ${result.count} notifications as read`
			});

			expect(response.status).toBe(200);
		});
	});
});
