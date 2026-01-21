/**
 * T33: Mock Services
 *
 * Centralized mock service configurations for consistent test mocking.
 */

import { vi } from 'vitest';

/**
 * Creates standard service error class for mocking
 */
export function createServiceError(name: string) {
	return class ServiceError extends Error {
		code: string;
		constructor(code: string, message: string) {
			super(message);
			this.name = name;
			this.code = code;
		}
	};
}

// ============================================
// Service Mock Templates
// ============================================

/**
 * User service mock template
 */
export function mockUserService() {
	return {
		getUserById: vi.fn(),
		getUserByEmail: vi.fn(),
		createUser: vi.fn(),
		updateUser: vi.fn(),
		deleteUser: vi.fn(),
		getUsersByTrustScore: vi.fn(),
		verifyUserEmail: vi.fn(),
		UserError: createServiceError('UserError')
	};
}

/**
 * Auth service mock template
 */
export function mockAuthService() {
	return {
		registerUser: vi.fn(),
		loginUser: vi.fn(),
		logoutUser: vi.fn(),
		verifyEmail: vi.fn(),
		requestPasswordReset: vi.fn(),
		resetPassword: vi.fn(),
		createSession: vi.fn(),
		validateSession: vi.fn(),
		invalidateSession: vi.fn(),
		AuthError: createServiceError('AuthError')
	};
}

/**
 * Fact service mock template
 */
export function mockFactService() {
	return {
		createFact: vi.fn(),
		getFactById: vi.fn(),
		updateFact: vi.fn(),
		deleteFact: vi.fn(),
		searchFacts: vi.fn(),
		updateFactStatus: vi.fn(),
		getFactsByAuthor: vi.fn(),
		getFactsByCategory: vi.fn(),
		FactError: createServiceError('FactError')
	};
}

/**
 * Vote service mock template
 */
export function mockVoteService() {
	return {
		castVote: vi.fn(),
		removeVote: vi.fn(),
		getUserVote: vi.fn(),
		getVotesByFact: vi.fn(),
		calculateWeightedScore: vi.fn(),
		recalculateFactVotes: vi.fn(),
		getBaseVoteWeight: vi.fn(),
		calculateVoteWeight: vi.fn(),
		VoteError: createServiceError('VoteError')
	};
}

/**
 * Trust service mock template
 */
export function mockTrustService() {
	return {
		getUserTrustScore: vi.fn(),
		updateTrustScore: vi.fn(),
		recalculateTrustScore: vi.fn(),
		getTrustScoreHistory: vi.fn(),
		calculateTrustModifier: vi.fn(),
		getTrustConfig: vi.fn(),
		initializeTrustScore: vi.fn(),
		TrustError: createServiceError('TrustError')
	};
}

/**
 * Notification service mock template
 */
export function mockNotificationService() {
	return {
		createNotification: vi.fn(),
		getUserNotifications: vi.fn(),
		markAsRead: vi.fn(),
		markAllAsRead: vi.fn(),
		deleteNotification: vi.fn(),
		getUnreadCount: vi.fn(),
		getNotificationPreferences: vi.fn(),
		updateNotificationPreference: vi.fn(),
		NotificationError: createServiceError('NotificationError')
	};
}

/**
 * Moderation service mock template
 */
export function mockModerationService() {
	return {
		getQueueItems: vi.fn(),
		getQueueStats: vi.fn(),
		getQueueItem: vi.fn(),
		addToQueue: vi.fn(),
		claimQueueItem: vi.fn(),
		releaseQueueItem: vi.fn(),
		resolveQueueItem: vi.fn(),
		dismissQueueItem: vi.fn(),
		ModerationError: createServiceError('ModerationError')
	};
}

/**
 * Moderator service mock template
 */
export function mockModeratorService() {
	return {
		getAllModerators: vi.fn(),
		appointModerator: vi.fn(),
		demoteModerator: vi.fn(),
		isEligibleForModerator: vi.fn(),
		getEligibleCandidates: vi.fn(),
		getInactiveModerators: vi.fn(),
		runAutoElection: vi.fn(),
		handleInactiveModerators: vi.fn(),
		getModeratorConfig: vi.fn(),
		handleReturningModerator: vi.fn(),
		getModeratorStats: vi.fn(),
		ModeratorError: createServiceError('ModeratorError')
	};
}

/**
 * Ban service mock template
 */
export function mockBanService() {
	return {
		banUser: vi.fn(),
		unbanUser: vi.fn(),
		isUserBanned: vi.fn(),
		getBannedUsers: vi.fn(),
		getUserBanHistory: vi.fn(),
		getBanConfig: vi.fn(),
		flagAccount: vi.fn(),
		getPendingFlags: vi.fn(),
		reviewFlaggedAccount: vi.fn(),
		autoFlagNegativeVetoUsers: vi.fn(),
		BanError: createServiceError('BanError')
	};
}

/**
 * Email service mock template
 */
export function mockEmailService() {
	return {
		sendVerificationEmail: vi.fn(),
		sendWelcomeEmail: vi.fn(),
		sendPasswordResetEmail: vi.fn(),
		sendNotificationEmail: vi.fn(),
		processUnsubscribe: vi.fn(),
		unsubscribeFromAll: vi.fn()
	};
}

/**
 * LLM service mock template
 */
export function mockLLMService() {
	return {
		checkGrammar: vi.fn().mockResolvedValue({ isCorrect: true, suggestions: [] })
	};
}

// ============================================
// Setup Helpers
// ============================================

/**
 * Sets up all common service mocks
 * NOTE: Uses vi.doMock() instead of vi.mock() because vi.mock() is hoisted
 * and would fail when called inside a function that references local variables.
 */
export async function setupServiceMocks() {
	const mocks = {
		user: mockUserService(),
		auth: mockAuthService(),
		fact: mockFactService(),
		vote: mockVoteService(),
		trust: mockTrustService(),
		notification: mockNotificationService(),
		moderation: mockModerationService(),
		moderator: mockModeratorService(),
		ban: mockBanService(),
		email: mockEmailService(),
		llm: mockLLMService()
	};

	// Set up vi.doMock for each service (not hoisted, so safe to use in functions)
	vi.doMock('$lib/server/services/user', () => mocks.user);
	vi.doMock('$lib/server/services/auth', () => mocks.auth);
	vi.doMock('$lib/server/services/fact', () => mocks.fact);
	vi.doMock('$lib/server/services/vote', () => mocks.vote);
	vi.doMock('$lib/server/services/trust', () => mocks.trust);
	vi.doMock('$lib/server/services/notification', () => mocks.notification);
	vi.doMock('$lib/server/services/moderation', () => mocks.moderation);
	vi.doMock('$lib/server/services/moderator', () => mocks.moderator);
	vi.doMock('$lib/server/services/ban', () => mocks.ban);
	vi.doMock('$lib/server/services/emailNotification', () => mocks.email);
	vi.doMock('$lib/server/llm', () => mocks.llm);

	return mocks;
}

/**
 * Clears all mocks
 */
export function clearAllServiceMocks() {
	vi.clearAllMocks();
}

/**
 * Resets all mocks to default implementations
 */
export function resetAllServiceMocks() {
	vi.resetAllMocks();
}
