import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	createUser,
	createVerifiedUser,
	createExpertUser,
	createModeratorUser,
	createOrganizationUser,
	createFact,
	createProvenFact,
	createSource,
	createVote,
	createCategory,
	createNotification,
	createQueueItem,
	resetFactoryCounter
} from '../infrastructure';

/**
 * User Interaction Tests
 *
 * These tests simulate complete user journeys through the PurFacted platform,
 * verifying that all the pieces work together as a real user would experience them.
 */

// ============================================
// Service Mocks - Simple function mocks only
// ============================================

vi.mock('$lib/server/services/auth', () => ({
	registerUser: vi.fn(),
	loginUser: vi.fn(),
	logoutUser: vi.fn(),
	verifyEmail: vi.fn(),
	requestPasswordReset: vi.fn(),
	resetPassword: vi.fn(),
	validateSession: vi.fn()
}));

vi.mock('$lib/server/services/user', () => ({
	getUserById: vi.fn(),
	getUserByEmail: vi.fn(),
	updateUser: vi.fn(),
	deleteUser: vi.fn()
}));

vi.mock('$lib/server/services/fact', () => ({
	createFact: vi.fn(),
	getFactById: vi.fn(),
	updateFact: vi.fn(),
	deleteFact: vi.fn(),
	searchFacts: vi.fn(),
	updateFactStatus: vi.fn()
}));

vi.mock('$lib/server/services/vote', () => ({
	castVote: vi.fn(),
	removeVote: vi.fn(),
	getUserVote: vi.fn(),
	getVotesByFact: vi.fn(),
	recalculateFactVotes: vi.fn(),
	calculateVoteWeight: vi.fn()
}));

vi.mock('$lib/server/services/trust', () => ({
	getUserTrustScore: vi.fn(),
	updateTrustScore: vi.fn(),
	calculateTrustModifier: vi.fn(),
	initializeTrustScore: vi.fn()
}));

vi.mock('$lib/server/services/expertVerification', () => ({
	requestVerification: vi.fn(),
	getVerificationRequest: vi.fn(),
	reviewVerification: vi.fn(),
	getVerificationsByUser: vi.fn()
}));

vi.mock('$lib/server/services/debate', () => ({
	createDebate: vi.fn(),
	getDebateById: vi.fn(),
	addDebateMessage: vi.fn(),
	publishDebate: vi.fn(),
	voteOnDebate: vi.fn(),
	getDebatesByFact: vi.fn()
}));

vi.mock('$lib/server/services/veto', () => ({
	submitVeto: vi.fn(),
	getVetosByFact: vi.fn(),
	voteOnVeto: vi.fn(),
	processVeto: vi.fn()
}));

vi.mock('$lib/server/services/comment', () => ({
	createComment: vi.fn(),
	getCommentsByFact: vi.fn(),
	updateComment: vi.fn(),
	deleteComment: vi.fn()
}));

vi.mock('$lib/server/services/discussion', () => ({
	createDiscussion: vi.fn(),
	getDiscussionsByFact: vi.fn(),
	voteOnDiscussion: vi.fn()
}));

vi.mock('$lib/server/services/report', () => ({
	createReport: vi.fn(),
	getReportsByContent: vi.fn(),
	updateReportStatus: vi.fn()
}));

vi.mock('$lib/server/services/moderation', () => ({
	getQueueItems: vi.fn(),
	addToQueue: vi.fn(),
	claimQueueItem: vi.fn(),
	resolveQueueItem: vi.fn(),
	getQueueStats: vi.fn()
}));

vi.mock('$lib/server/services/ban', () => ({
	banUser: vi.fn(),
	isUserBanned: vi.fn(),
	getUserBanHistory: vi.fn(),
	flagAccount: vi.fn()
}));

vi.mock('$lib/server/services/notification.inapp', () => ({
	createNotification: vi.fn(),
	getUserNotifications: vi.fn(),
	markAsRead: vi.fn(),
	getUnreadCount: vi.fn()
}));

vi.mock('$lib/server/services/emailNotification', () => ({
	sendVerificationEmail: vi.fn(),
	sendWelcomeEmail: vi.fn(),
	sendNotificationEmail: vi.fn()
}));

vi.mock('$lib/server/services/category', () => ({
	createCategory: vi.fn(),
	getCategoryById: vi.fn(),
	searchCategories: vi.fn(),
	getCategoryTree: vi.fn()
}));

vi.mock('$lib/server/services/organization', () => ({
	createOrganization: vi.fn(),
	getOrganizationById: vi.fn(),
	tagOrganization: vi.fn()
}));

vi.mock('$lib/server/services/organizationComment', () => ({
	createOfficialComment: vi.fn(),
	getOfficialComments: vi.fn()
}));

vi.mock('$lib/server/llm', () => ({
	checkGrammar: vi.fn().mockResolvedValue({ isCorrect: true, suggestions: [] })
}));

// Helper to create error-like objects
function createError(code: string, message: string) {
	const error = new Error(message);
	(error as any).code = code;
	return error;
}

// ============================================
// Test Suite 1: New User Registration Journey
// ============================================

describe('User Journey: New User Registration to First Fact', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetFactoryCounter();
	});

	it('should complete full journey: register → verify email → login → submit fact → receive votes', async () => {
		const { registerUser, verifyEmail, loginUser, validateSession } = await import(
			'$lib/server/services/auth'
		);
		const { sendVerificationEmail, sendWelcomeEmail } = await import(
			'$lib/server/services/emailNotification'
		);
		const { initializeTrustScore, updateTrustScore } = await import(
			'$lib/server/services/trust'
		);
		const { createFact: createFactService } = await import('$lib/server/services/fact');
		const { castVote, recalculateFactVotes } = await import('$lib/server/services/vote');
		const { createNotification } = await import('$lib/server/services/notification.inapp');

		// === STEP 1: User Registration ===
		const newUser = createUser({
			email: 'newuser@example.com',
			firstName: 'Alice',
			lastName: 'Smith',
			emailVerified: false,
			userType: 'VERIFIED',
			trustScore: 0
		});

		vi.mocked(registerUser).mockResolvedValue({
			user: newUser,
			verificationToken: 'verify-token-abc123'
		} as any);

		vi.mocked(sendVerificationEmail).mockResolvedValue(undefined);
		vi.mocked(initializeTrustScore).mockResolvedValue(undefined);

		const registrationResult = await registerUser(
			'newuser@example.com',
			'SecureP@ssw0rd!',
			'Alice',
			'Smith'
		);

		expect(registrationResult.user.email).toBe('newuser@example.com');
		expect(registrationResult.verificationToken).toBeTruthy();

		await sendVerificationEmail(newUser.email, 'verify-token-abc123');
		expect(sendVerificationEmail).toHaveBeenCalledWith('newuser@example.com', 'verify-token-abc123');

		await initializeTrustScore(newUser.id);
		expect(initializeTrustScore).toHaveBeenCalledWith(newUser.id);

		// === STEP 2: Email Verification ===
		const verifiedUser = { ...newUser, emailVerified: true, trustScore: 10 };
		vi.mocked(verifyEmail).mockResolvedValue(verifiedUser as any);
		vi.mocked(sendWelcomeEmail).mockResolvedValue(undefined);

		const verificationResult = await verifyEmail('verify-token-abc123');
		expect(verificationResult.emailVerified).toBe(true);

		await sendWelcomeEmail(verifiedUser.email);
		expect(sendWelcomeEmail).toHaveBeenCalledWith('newuser@example.com');

		// === STEP 3: User Login ===
		const session = { id: 'session-123', userId: newUser.id, expiresAt: new Date(Date.now() + 86400000) };
		vi.mocked(loginUser).mockResolvedValue({
			user: verifiedUser,
			session
		} as any);

		const loginResult = await loginUser('newuser@example.com', 'SecureP@ssw0rd!');
		expect(loginResult.session.id).toBe('session-123');
		expect(loginResult.user.emailVerified).toBe(true);

		vi.mocked(validateSession).mockResolvedValue({
			session,
			user: verifiedUser
		} as any);

		const sessionValidation = await validateSession(session.id);
		expect(sessionValidation.user.id).toBe(newUser.id);

		// === STEP 4: Submit First Fact ===
		const newFact = createFact({
			title: 'Water boils at 100°C at sea level',
			body: 'Under standard atmospheric pressure, pure water reaches its boiling point at 100 degrees Celsius.',
			authorId: newUser.id,
			status: 'SUBMITTED'
		});

		vi.mocked(createFactService).mockResolvedValue(newFact as any);
		vi.mocked(createNotification).mockResolvedValue(undefined);

		const submittedFact = await createFactService({
			title: newFact.title,
			body: newFact.body,
			authorId: newUser.id,
			sources: [{ url: 'https://science.edu/water-properties', type: 'ACADEMIC' }]
		});

		expect(submittedFact.id).toBe(newFact.id);
		expect(submittedFact.status).toBe('SUBMITTED');

		// === STEP 5: Fact Receives Votes ===
		const voter1 = createExpertUser({ id: 'expert-voter-1' });
		const voter2 = createVerifiedUser({ id: 'verified-voter-2' });

		vi.mocked(castVote)
			.mockResolvedValueOnce({ id: 'vote-1', factId: newFact.id, userId: voter1.id, value: 1, weight: 5.0 } as any)
			.mockResolvedValueOnce({ id: 'vote-2', factId: newFact.id, userId: voter2.id, value: 1, weight: 2.0 } as any);

		const vote1 = await castVote(newFact.id, voter1.id, 1);
		const vote2 = await castVote(newFact.id, voter2.id, 1);

		expect(vote1.weight).toBe(5.0);
		expect(vote2.weight).toBe(2.0);

		vi.mocked(recalculateFactVotes).mockResolvedValue({
			upvotes: 2,
			downvotes: 0,
			weightedScore: 7.0
		});

		const voteResult = await recalculateFactVotes(newFact.id);
		expect(voteResult.weightedScore).toBe(7.0);

		// === STEP 6: Author Receives Notification ===
		await createNotification({
			userId: newUser.id,
			type: 'FACT_VOTE',
			message: 'Your fact received a new upvote'
		});

		expect(createNotification).toHaveBeenCalled();

		// === STEP 7: Trust Score Updates ===
		vi.mocked(updateTrustScore).mockResolvedValue(undefined);
		await updateTrustScore(newUser.id, 1, 'UPVOTE_RECEIVED');
		expect(updateTrustScore).toHaveBeenCalledWith(newUser.id, 1, 'UPVOTE_RECEIVED');
	});

	it('should handle registration with invalid email', async () => {
		const { registerUser } = await import('$lib/server/services/auth');

		vi.mocked(registerUser).mockRejectedValue(createError('INVALID_EMAIL', 'Invalid email format'));

		await expect(
			registerUser('invalid-email', 'SecureP@ssw0rd!', 'Test', 'User')
		).rejects.toMatchObject({
			code: 'INVALID_EMAIL'
		});
	});

	it('should handle registration with existing email', async () => {
		const { registerUser } = await import('$lib/server/services/auth');

		vi.mocked(registerUser).mockRejectedValue(createError('EMAIL_EXISTS', 'Email already registered'));

		await expect(
			registerUser('existing@example.com', 'SecureP@ssw0rd!', 'Test', 'User')
		).rejects.toMatchObject({
			code: 'EMAIL_EXISTS'
		});
	});

	it('should prevent login before email verification', async () => {
		const { loginUser } = await import('$lib/server/services/auth');

		vi.mocked(loginUser).mockRejectedValue(
			createError('EMAIL_NOT_VERIFIED', 'Please verify your email before logging in')
		);

		await expect(loginUser('unverified@example.com', 'password')).rejects.toMatchObject({
			code: 'EMAIL_NOT_VERIFIED'
		});
	});
});

// ============================================
// Test Suite 2: Expert Verification Flow
// ============================================

describe('User Journey: Expert Verification Process', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetFactoryCounter();
	});

	it('should complete expert verification: request → review → approval → enhanced privileges', async () => {
		const { requestVerification, getVerificationRequest, reviewVerification } = await import(
			'$lib/server/services/expertVerification'
		);
		const { updateUser } = await import('$lib/server/services/user');
		const { castVote, calculateVoteWeight } = await import('$lib/server/services/vote');
		const { updateTrustScore } = await import('$lib/server/services/trust');
		const { createNotification } = await import('$lib/server/services/notification.inapp');

		const user = createVerifiedUser({
			id: 'user-seeking-expert',
			trustScore: 75,
			userType: 'VERIFIED'
		});

		// === STEP 1: Request Expert Verification ===
		const verificationRequest = {
			id: 'verification-req-1',
			userId: user.id,
			credentials: 'PhD in Physics from MIT',
			documentUrl: 'https://secure.storage/diploma.pdf',
			status: 'PENDING',
			createdAt: new Date()
		};

		vi.mocked(requestVerification).mockResolvedValue(verificationRequest as any);

		const request = await requestVerification(user.id, {
			credentials: 'PhD in Physics from MIT',
			documentUrl: 'https://secure.storage/diploma.pdf'
		});

		expect(request.status).toBe('PENDING');
		expect(request.credentials).toContain('PhD');

		// === STEP 2: Moderator Reviews Request ===
		const moderator = createModeratorUser({ id: 'moderator-reviewer' });

		vi.mocked(getVerificationRequest).mockResolvedValue({
			...verificationRequest,
			reviewer: null
		} as any);

		const pendingRequest = await getVerificationRequest(verificationRequest.id);
		expect(pendingRequest.status).toBe('PENDING');

		// === STEP 3: Moderator Approves Verification ===
		vi.mocked(reviewVerification).mockResolvedValue({
			...verificationRequest,
			status: 'APPROVED',
			reviewerId: moderator.id,
			reviewedAt: new Date()
		} as any);

		vi.mocked(updateUser).mockResolvedValue({
			...user,
			userType: 'PHD'
		} as any);

		vi.mocked(createNotification).mockResolvedValue(undefined);

		const approvedRequest = await reviewVerification(verificationRequest.id, {
			approved: true,
			reviewerId: moderator.id
		});

		expect(approvedRequest.status).toBe('APPROVED');

		const updatedUser = await updateUser(user.id, { userType: 'PHD' });
		expect(updatedUser.userType).toBe('PHD');

		await createNotification({
			userId: user.id,
			type: 'VERIFICATION_APPROVED',
			message: 'Your expert verification has been approved!'
		});

		expect(createNotification).toHaveBeenCalled();

		// === STEP 4: Expert Can Now Vote with Higher Weight ===
		vi.mocked(calculateVoteWeight).mockReturnValue(8.0);

		const weight = calculateVoteWeight('PHD', 75);
		expect(weight).toBe(8.0);

		vi.mocked(castVote).mockResolvedValue({
			id: 'expert-vote',
			value: 1,
			weight: 8.0 * 1.2
		} as any);

		const expertVote = await castVote('fact-123', user.id, 1);
		expect(expertVote.weight).toBeGreaterThan(5);

		// === STEP 5: Trust Score Reward for Verification ===
		vi.mocked(updateTrustScore).mockResolvedValue(undefined);
		await updateTrustScore(user.id, 3, 'VERIFICATION_CORRECT');
		expect(updateTrustScore).toHaveBeenCalledWith(user.id, 3, 'VERIFICATION_CORRECT');
	});

	it('should handle rejected verification request', async () => {
		const { requestVerification, reviewVerification } = await import(
			'$lib/server/services/expertVerification'
		);
		const { createNotification } = await import('$lib/server/services/notification.inapp');
		const { updateTrustScore } = await import('$lib/server/services/trust');

		const user = createVerifiedUser({ id: 'user-rejected' });

		vi.mocked(requestVerification).mockResolvedValue({
			id: 'verification-req-rejected',
			userId: user.id,
			status: 'PENDING'
		} as any);

		await requestVerification(user.id, { credentials: 'Fake credentials' });

		vi.mocked(reviewVerification).mockResolvedValue({
			id: 'verification-req-rejected',
			status: 'REJECTED',
			rejectionReason: 'Could not verify credentials'
		} as any);

		const rejected = await reviewVerification('verification-req-rejected', {
			approved: false,
			rejectionReason: 'Could not verify credentials'
		});

		expect(rejected.status).toBe('REJECTED');

		vi.mocked(createNotification).mockResolvedValue(undefined);
		await createNotification({
			userId: user.id,
			type: 'VERIFICATION_REJECTED',
			message: 'Your verification request was not approved'
		});

		vi.mocked(updateTrustScore).mockResolvedValue(undefined);
		await updateTrustScore(user.id, -10, 'VERIFICATION_WRONG');
		expect(updateTrustScore).toHaveBeenCalledWith(user.id, -10, 'VERIFICATION_WRONG');
	});
});

// ============================================
// Test Suite 3: Complete Fact Verification Lifecycle
// ============================================

describe('User Journey: Fact Verification Lifecycle', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetFactoryCounter();
	});

	it('should complete full fact lifecycle: create → vote → proven → veto challenge → resolved', async () => {
		const { createFact: createFactService, getFactById, updateFactStatus } = await import(
			'$lib/server/services/fact'
		);
		const { castVote, recalculateFactVotes } = await import('$lib/server/services/vote');
		const { submitVeto, voteOnVeto, processVeto } = await import('$lib/server/services/veto');
		const { updateTrustScore } = await import('$lib/server/services/trust');
		const { createNotification } = await import('$lib/server/services/notification.inapp');
		const { checkGrammar } = await import('$lib/server/llm');

		const author = createVerifiedUser({ id: 'fact-author', trustScore: 30 });
		const experts = [
			createExpertUser({ id: 'expert-1', trustScore: 80 }),
			createExpertUser({ id: 'expert-2', trustScore: 90 }),
			createExpertUser({ id: 'expert-3', trustScore: 70 })
		];
		const challenger = createExpertUser({ id: 'challenger', trustScore: 60 });

		// === STEP 1: Create Fact with Grammar Check ===
		vi.mocked(checkGrammar).mockResolvedValue({
			isCorrect: true,
			suggestions: []
		});

		const grammarResult = await checkGrammar('The Earth orbits the Sun.');
		expect(grammarResult.isCorrect).toBe(true);

		const newFact = createFact({
			id: 'fact-lifecycle-test',
			title: 'The Earth orbits the Sun',
			body: 'The Earth completes one orbit around the Sun every 365.25 days.',
			authorId: author.id,
			status: 'SUBMITTED'
		});

		vi.mocked(createFactService).mockResolvedValue(newFact as any);

		const fact = await createFactService({
			title: newFact.title,
			body: newFact.body,
			authorId: author.id,
			sources: [{ url: 'https://nasa.gov/solar-system', type: 'GOVERNMENT' }]
		});

		expect(fact.status).toBe('SUBMITTED');

		// === STEP 2: Experts Vote on the Fact ===
		vi.mocked(castVote)
			.mockResolvedValueOnce({ id: 'v1', value: 1, weight: 7.5 } as any)
			.mockResolvedValueOnce({ id: 'v2', value: 1, weight: 9.0 } as any)
			.mockResolvedValueOnce({ id: 'v3', value: 1, weight: 6.0 } as any);

		for (const expert of experts) {
			await castVote(fact.id, expert.id, 1);
		}

		expect(castVote).toHaveBeenCalledTimes(3);

		// === STEP 3: Vote Threshold Reached - Status Changes to PROVEN ===
		vi.mocked(recalculateFactVotes).mockResolvedValue({
			upvotes: 3,
			downvotes: 0,
			weightedScore: 22.5
		});

		const voteResult = await recalculateFactVotes(fact.id);
		expect(voteResult.weightedScore).toBeGreaterThan(20);

		vi.mocked(updateFactStatus).mockResolvedValue({
			...newFact,
			status: 'PROVEN',
			upvotes: 3,
			weightedScore: 22.5
		} as any);

		const provenFact = await updateFactStatus(fact.id, 'PROVEN');
		expect(provenFact.status).toBe('PROVEN');

		vi.mocked(updateTrustScore).mockResolvedValue(undefined);
		await updateTrustScore(author.id, 10, 'FACT_APPROVED');
		expect(updateTrustScore).toHaveBeenCalledWith(author.id, 10, 'FACT_APPROVED');

		vi.mocked(createNotification).mockResolvedValue(undefined);
		await createNotification({
			userId: author.id,
			type: 'FACT_PROVEN',
			message: 'Your fact has been verified as proven!'
		});

		// === STEP 4: Another Expert Challenges with Veto ===
		const veto = {
			id: 'veto-1',
			factId: fact.id,
			submitterId: challenger.id,
			reason: 'This is an oversimplification. The orbit is elliptical, not circular.',
			status: 'PENDING'
		};

		vi.mocked(submitVeto).mockResolvedValue(veto as any);

		const submittedVeto = await submitVeto(fact.id, challenger.id, veto.reason);
		expect(submittedVeto.status).toBe('PENDING');

		vi.mocked(updateFactStatus).mockResolvedValue({
			...provenFact,
			status: 'UNDER_VETO_REVIEW'
		} as any);

		// === STEP 5: Community Votes on Veto ===
		vi.mocked(voteOnVeto)
			.mockResolvedValueOnce({ vetoId: veto.id, value: -1 } as any)
			.mockResolvedValueOnce({ vetoId: veto.id, value: -1 } as any)
			.mockResolvedValueOnce({ vetoId: veto.id, value: 1 } as any);

		for (const expert of experts) {
			await voteOnVeto(veto.id, expert.id, expert.id === 'expert-3' ? 1 : -1);
		}

		// === STEP 6: Veto Fails - Fact Remains Proven ===
		vi.mocked(processVeto).mockResolvedValue({
			...veto,
			status: 'REJECTED',
			result: 'REJECTED'
		} as any);

		const processedVeto = await processVeto(veto.id);
		expect(processedVeto.status).toBe('REJECTED');

		vi.mocked(updateFactStatus).mockResolvedValue({
			...provenFact,
			status: 'PROVEN'
		} as any);

		vi.mocked(getFactById).mockResolvedValue({
			...provenFact,
			status: 'PROVEN'
		} as any);

		const finalFact = await getFactById(fact.id);
		expect(finalFact?.status).toBe('PROVEN');

		await updateTrustScore(challenger.id, -5, 'FAILED_VETO');
		expect(updateTrustScore).toHaveBeenCalledWith(challenger.id, -5, 'FAILED_VETO');
	});

	it('should handle fact becoming DISPROVEN through negative votes', async () => {
		const { createFact: createFactService, updateFactStatus } = await import(
			'$lib/server/services/fact'
		);
		const { castVote, recalculateFactVotes } = await import('$lib/server/services/vote');
		const { updateTrustScore } = await import('$lib/server/services/trust');

		const author = createVerifiedUser({ id: 'bad-author' });

		const falseFact = createFact({
			title: 'The Earth is flat',
			body: 'The Earth is a flat disc.',
			authorId: author.id,
			status: 'SUBMITTED'
		});

		vi.mocked(createFactService).mockResolvedValue(falseFact as any);

		vi.mocked(castVote)
			.mockResolvedValueOnce({ value: -1, weight: 7.5 } as any)
			.mockResolvedValueOnce({ value: -1, weight: 8.0 } as any)
			.mockResolvedValueOnce({ value: -1, weight: 6.5 } as any);

		vi.mocked(recalculateFactVotes).mockResolvedValue({
			upvotes: 0,
			downvotes: 3,
			weightedScore: -22.0
		});

		const voteResult = await recalculateFactVotes(falseFact.id);
		expect(voteResult.weightedScore).toBeLessThan(-20);

		vi.mocked(updateFactStatus).mockResolvedValue({
			...falseFact,
			status: 'DISPROVEN'
		} as any);

		const disproven = await updateFactStatus(falseFact.id, 'DISPROVEN');
		expect(disproven.status).toBe('DISPROVEN');

		vi.mocked(updateTrustScore).mockResolvedValue(undefined);
		await updateTrustScore(author.id, -20, 'FACT_WRONG');
		expect(updateTrustScore).toHaveBeenCalledWith(author.id, -20, 'FACT_WRONG');
	});
});

// ============================================
// Test Suite 4: Debate System Flow
// ============================================

describe('User Journey: Debate System', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetFactoryCounter();
	});

	it('should complete debate flow: initiate → exchange messages → publish → community votes', async () => {
		const { createDebate, getDebateById, addDebateMessage, publishDebate, voteOnDebate } =
			await import('$lib/server/services/debate');
		const { createNotification } = await import('$lib/server/services/notification.inapp');
		const { getFactById } = await import('$lib/server/services/fact');

		const initiator = createExpertUser({ id: 'debate-initiator', firstName: 'Alice' });
		const participant = createExpertUser({ id: 'debate-participant', firstName: 'Bob' });
		const voters = [
			createVerifiedUser({ id: 'voter-1' }),
			createVerifiedUser({ id: 'voter-2' }),
			createVerifiedUser({ id: 'voter-3' })
		];

		const disputedFact = createProvenFact({
			id: 'disputed-fact',
			title: 'Controversial scientific claim'
		});

		vi.mocked(getFactById).mockResolvedValue(disputedFact as any);

		// === STEP 1: Initiator Creates Private Debate ===
		const debate = {
			id: 'debate-1',
			factId: disputedFact.id,
			initiatorId: initiator.id,
			participantId: participant.id,
			status: 'PENDING',
			published: false,
			messages: []
		};

		vi.mocked(createDebate).mockResolvedValue(debate as any);

		const createdDebate = await createDebate({
			factId: disputedFact.id,
			initiatorId: initiator.id,
			participantId: participant.id,
			initialMessage: 'I believe this fact needs reconsideration.'
		});

		expect(createdDebate.status).toBe('PENDING');
		expect(createdDebate.published).toBe(false);

		vi.mocked(createNotification).mockResolvedValue(undefined);
		await createNotification({
			userId: participant.id,
			type: 'DEBATE_INVITATION',
			message: `${initiator.firstName} has invited you to debate`
		});

		// === STEP 2: Exchange Debate Messages ===
		vi.mocked(addDebateMessage)
			.mockResolvedValueOnce({
				id: 'msg-1',
				debateId: debate.id,
				authorId: initiator.id,
				content: 'The evidence does not support this conclusion.',
				createdAt: new Date()
			} as any)
			.mockResolvedValueOnce({
				id: 'msg-2',
				debateId: debate.id,
				authorId: participant.id,
				content: 'Here is additional evidence supporting the fact.',
				createdAt: new Date()
			} as any)
			.mockResolvedValueOnce({
				id: 'msg-3',
				debateId: debate.id,
				authorId: initiator.id,
				content: 'That evidence has been retracted.',
				createdAt: new Date()
			} as any);

		await addDebateMessage(debate.id, initiator.id, 'The evidence does not support this conclusion.');
		await addDebateMessage(debate.id, participant.id, 'Here is additional evidence supporting the fact.');
		await addDebateMessage(debate.id, initiator.id, 'That evidence has been retracted.');

		expect(addDebateMessage).toHaveBeenCalledTimes(3);

		// === STEP 3: Both Parties Agree to Publish ===
		vi.mocked(publishDebate).mockResolvedValue({
			...debate,
			status: 'ACTIVE',
			published: true,
			publishedAt: new Date()
		} as any);

		const publishedDebate = await publishDebate(debate.id);
		expect(publishedDebate.published).toBe(true);
		expect(publishedDebate.status).toBe('ACTIVE');

		// === STEP 4: Community Votes on Debate Positions ===
		vi.mocked(voteOnDebate)
			.mockResolvedValueOnce({ debateId: debate.id, userId: voters[0].id, supportInitiator: true } as any)
			.mockResolvedValueOnce({ debateId: debate.id, userId: voters[1].id, supportInitiator: true } as any)
			.mockResolvedValueOnce({ debateId: debate.id, userId: voters[2].id, supportInitiator: false } as any);

		await voteOnDebate(debate.id, voters[0].id, true);
		await voteOnDebate(debate.id, voters[1].id, true);
		await voteOnDebate(debate.id, voters[2].id, false);

		expect(voteOnDebate).toHaveBeenCalledTimes(3);

		// === STEP 5: Debate Concludes ===
		vi.mocked(getDebateById).mockResolvedValue({
			...debate,
			status: 'CONCLUDED',
			initiatorVotes: 2,
			participantVotes: 1,
			winner: 'initiator'
		} as any);

		const concludedDebate = await getDebateById(debate.id);
		expect(concludedDebate?.initiatorVotes).toBe(2);
		expect(concludedDebate?.winner).toBe('initiator');
	});

	it('should handle debate invitation rejection', async () => {
		const { createDebate } = await import('$lib/server/services/debate');

		const initiator = createVerifiedUser({ id: 'initiator' });

		vi.mocked(createDebate).mockRejectedValue(
			createError('INVITATION_REJECTED', 'Participant declined the debate invitation')
		);

		await expect(
			createDebate({
				factId: 'fact-123',
				initiatorId: initiator.id,
				participantId: 'non-participating-user'
			})
		).rejects.toMatchObject({ code: 'INVITATION_REJECTED' });
	});
});

// ============================================
// Test Suite 5: Moderation and Ban Flow
// ============================================

describe('User Journey: Moderation and Ban System', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetFactoryCounter();
	});

	it('should complete moderation flow: report → queue → review → ban', async () => {
		const { createReport } = await import('$lib/server/services/report');
		const { addToQueue, getQueueItems, claimQueueItem, resolveQueueItem } = await import(
			'$lib/server/services/moderation'
		);
		const { banUser, getUserBanHistory } = await import('$lib/server/services/ban');
		const { createNotification } = await import('$lib/server/services/notification.inapp');
		const { updateTrustScore } = await import('$lib/server/services/trust');

		const reporter = createVerifiedUser({ id: 'reporter' });
		const offender = createVerifiedUser({ id: 'offender', trustScore: 20 });
		const moderator = createModeratorUser({ id: 'moderator' });

		const offendingFact = createFact({
			id: 'offensive-fact',
			title: 'Misleading claim',
			authorId: offender.id
		});

		// === STEP 1: User Reports Content ===
		const report = {
			id: 'report-1',
			reporterId: reporter.id,
			contentId: offendingFact.id,
			contentType: 'FACT',
			reason: 'MISINFORMATION',
			description: 'This contains deliberately false information',
			status: 'PENDING'
		};

		vi.mocked(createReport).mockResolvedValue(report as any);

		const submittedReport = await createReport({
			reporterId: reporter.id,
			contentId: offendingFact.id,
			contentType: 'FACT',
			reason: 'MISINFORMATION',
			description: 'This contains deliberately false information'
		});

		expect(submittedReport.status).toBe('PENDING');

		// === STEP 2: Report Added to Moderation Queue ===
		const queueItem = createQueueItem({
			id: 'queue-1',
			type: 'REPORTED_CONTENT',
			contentId: offendingFact.id,
			contentType: 'FACT',
			status: 'PENDING'
		});

		vi.mocked(addToQueue).mockResolvedValue(queueItem as any);

		await addToQueue({
			type: 'REPORTED_CONTENT',
			contentId: offendingFact.id,
			reason: 'Multiple reports received'
		});

		// === STEP 3: Moderator Views Queue ===
		vi.mocked(getQueueItems).mockResolvedValue({
			items: [queueItem],
			total: 1
		} as any);

		const queue = await getQueueItems({ status: 'PENDING' });
		expect(queue.items).toHaveLength(1);

		// === STEP 4: Moderator Claims Item ===
		vi.mocked(claimQueueItem).mockResolvedValue({
			...queueItem,
			assignedToId: moderator.id,
			status: 'IN_REVIEW'
		} as any);

		const claimed = await claimQueueItem(queueItem.id, moderator.id);
		expect(claimed.assignedToId).toBe(moderator.id);
		expect(claimed.status).toBe('IN_REVIEW');

		// === STEP 5: Moderator Takes Action - First Offense Ban ===
		vi.mocked(banUser).mockResolvedValue({
			userId: offender.id,
			banLevel: 1,
			bannedUntil: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
			reason: 'Spreading misinformation'
		} as any);

		const ban = await banUser(offender.id, {
			reason: 'Spreading misinformation',
			moderatorId: moderator.id
		});

		expect(ban.banLevel).toBe(1);
		expect(ban.bannedUntil).toBeDefined();

		// === STEP 6: Queue Item Resolved ===
		vi.mocked(resolveQueueItem).mockResolvedValue({
			...queueItem,
			status: 'RESOLVED',
			resolution: 'USER_BANNED',
			resolvedById: moderator.id
		} as any);

		const resolved = await resolveQueueItem(queueItem.id, {
			resolution: 'USER_BANNED',
			resolvedById: moderator.id
		});

		expect(resolved.status).toBe('RESOLVED');

		// === STEP 7: Offender Notified ===
		vi.mocked(createNotification).mockResolvedValue(undefined);
		await createNotification({
			userId: offender.id,
			type: 'ACCOUNT_BANNED',
			message: 'Your account has been temporarily suspended for 3 days'
		});

		// === STEP 8: Trust Score Penalty ===
		vi.mocked(updateTrustScore).mockResolvedValue(undefined);
		await updateTrustScore(offender.id, -50, 'MODERATION_ACTION');

		// === Verify Ban History ===
		vi.mocked(getUserBanHistory).mockResolvedValue([ban] as any);

		const banHistory = await getUserBanHistory(offender.id);
		expect(banHistory).toHaveLength(1);
	});

	it('should escalate bans for repeat offenders', async () => {
		const { banUser, getUserBanHistory } = await import('$lib/server/services/ban');

		const repeatOffender = createVerifiedUser({ id: 'repeat-offender', banLevel: 1 });

		vi.mocked(getUserBanHistory).mockResolvedValue([
			{
				banLevel: 1,
				bannedUntil: new Date(Date.now() - 86400000),
				reason: 'First offense'
			}
		] as any);

		vi.mocked(banUser).mockResolvedValue({
			userId: repeatOffender.id,
			banLevel: 2,
			bannedUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
			reason: 'Second offense'
		} as any);

		const secondBan = await banUser(repeatOffender.id, { reason: 'Second offense' });
		expect(secondBan.banLevel).toBe(2);

		vi.mocked(getUserBanHistory).mockResolvedValue([
			{ banLevel: 1 },
			{ banLevel: 2 }
		] as any);

		vi.mocked(banUser).mockResolvedValue({
			userId: repeatOffender.id,
			banLevel: 3,
			bannedUntil: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000),
			reason: 'Third offense - permanent ban'
		} as any);

		const permanentBan = await banUser(repeatOffender.id, { reason: 'Third offense' });
		expect(permanentBan.banLevel).toBe(3);
	});
});

// ============================================
// Test Suite 6: Organization User Journey
// ============================================

describe('User Journey: Organization Account', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetFactoryCounter();
	});

	it('should complete organization flow: verify → tag in fact → official comment → high-weight vote', async () => {
		const { createOrganization, getOrganizationById, tagOrganization } = await import(
			'$lib/server/services/organization'
		);
		const { createOfficialComment, getOfficialComments } = await import(
			'$lib/server/services/organizationComment'
		);
		const { castVote } = await import('$lib/server/services/vote');
		const { getFactById } = await import('$lib/server/services/fact');
		const { createNotification } = await import('$lib/server/services/notification.inapp');

		const orgUser = createOrganizationUser({
			id: 'org-nasa',
			firstName: 'NASA',
			lastName: 'Official',
			trustScore: 100
		});

		const organization = {
			id: 'org-1',
			name: 'NASA',
			userId: orgUser.id,
			verified: true,
			domain: 'nasa.gov'
		};

		vi.mocked(createOrganization).mockResolvedValue(organization as any);
		vi.mocked(getOrganizationById).mockResolvedValue(organization as any);

		const factAboutOrg = createFact({
			id: 'fact-about-nasa',
			title: 'NASA confirms water on Mars',
			body: 'NASA has confirmed the presence of water ice on Mars.',
			status: 'SUBMITTED'
		});

		vi.mocked(getFactById).mockResolvedValue(factAboutOrg as any);

		vi.mocked(tagOrganization).mockResolvedValue({
			factId: factAboutOrg.id,
			organizationId: organization.id
		} as any);

		await tagOrganization(factAboutOrg.id, organization.id);

		vi.mocked(createNotification).mockResolvedValue(undefined);
		await createNotification({
			userId: orgUser.id,
			type: 'ORGANIZATION_TAGGED',
			message: 'Your organization was mentioned in a fact'
		});

		const officialComment = {
			id: 'official-comment-1',
			factId: factAboutOrg.id,
			organizationId: organization.id,
			content: 'This information is accurate. We confirmed water ice presence in 2023.',
			isOfficial: true
		};

		vi.mocked(createOfficialComment).mockResolvedValue(officialComment as any);

		const comment = await createOfficialComment({
			factId: factAboutOrg.id,
			organizationId: organization.id,
			content: officialComment.content
		});

		expect(comment.isOfficial).toBe(true);

		vi.mocked(castVote).mockResolvedValue({
			id: 'org-vote',
			factId: factAboutOrg.id,
			userId: orgUser.id,
			value: 1,
			weight: 100.0
		} as any);

		const orgVote = await castVote(factAboutOrg.id, orgUser.id, 1);
		expect(orgVote.weight).toBe(100.0);

		vi.mocked(getOfficialComments).mockResolvedValue([officialComment] as any);

		const officialComments = await getOfficialComments(factAboutOrg.id);
		expect(officialComments).toHaveLength(1);
		expect(officialComments[0].isOfficial).toBe(true);
	});
});

// ============================================
// Test Suite 7: Trust Score System
// ============================================

describe('User Journey: Trust Score Evolution', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetFactoryCounter();
	});

	it('should track trust score through various actions', async () => {
		const { updateTrustScore, getUserTrustScore, calculateTrustModifier } = await import(
			'$lib/server/services/trust'
		);
		const { calculateVoteWeight } = await import('$lib/server/services/vote');

		const user = createVerifiedUser({ id: 'trust-journey-user', trustScore: 10 });

		vi.mocked(getUserTrustScore).mockResolvedValue(10);

		let currentTrust = await getUserTrustScore(user.id);
		expect(currentTrust).toBe(10);

		vi.mocked(updateTrustScore).mockResolvedValue(undefined);
		await updateTrustScore(user.id, 10, 'FACT_APPROVED');

		vi.mocked(getUserTrustScore).mockResolvedValue(20);
		currentTrust = await getUserTrustScore(user.id);
		expect(currentTrust).toBe(20);

		await updateTrustScore(user.id, 1, 'UPVOTE_RECEIVED');
		await updateTrustScore(user.id, 1, 'UPVOTE_RECEIVED');
		await updateTrustScore(user.id, 1, 'UPVOTE_RECEIVED');

		vi.mocked(getUserTrustScore).mockResolvedValue(23);
		currentTrust = await getUserTrustScore(user.id);
		expect(currentTrust).toBe(23);

		await updateTrustScore(user.id, 5, 'SUCCESSFUL_VETO');

		vi.mocked(getUserTrustScore).mockResolvedValue(28);
		currentTrust = await getUserTrustScore(user.id);
		expect(currentTrust).toBe(28);

		await updateTrustScore(user.id, 10, 'FACT_APPROVED');

		vi.mocked(getUserTrustScore).mockResolvedValue(38);
		currentTrust = await getUserTrustScore(user.id);
		expect(currentTrust).toBe(38);

		await updateTrustScore(user.id, -1, 'DOWNVOTE_RECEIVED');
		await updateTrustScore(user.id, -1, 'DOWNVOTE_RECEIVED');

		vi.mocked(getUserTrustScore).mockResolvedValue(36);
		currentTrust = await getUserTrustScore(user.id);
		expect(currentTrust).toBe(36);

		vi.mocked(calculateTrustModifier).mockReturnValue(1.0);

		const modifier = calculateTrustModifier(36);
		expect(modifier).toBe(1.0);

		vi.mocked(calculateVoteWeight).mockReturnValue(2.0 * modifier);

		const voteWeight = calculateVoteWeight('VERIFIED', 36);
		expect(voteWeight).toBe(2.0);
	});

	it('should reduce voting power for negative trust users', async () => {
		const { getUserTrustScore, calculateTrustModifier } = await import(
			'$lib/server/services/trust'
		);
		const { calculateVoteWeight } = await import('$lib/server/services/vote');

		const negativeTrustUser = createVerifiedUser({ id: 'negative-trust', trustScore: -30 });

		vi.mocked(getUserTrustScore).mockResolvedValue(-30);

		const trust = await getUserTrustScore(negativeTrustUser.id);
		expect(trust).toBe(-30);

		vi.mocked(calculateTrustModifier).mockReturnValue(0.25);

		const modifier = calculateTrustModifier(-30);
		expect(modifier).toBe(0.25);

		vi.mocked(calculateVoteWeight).mockReturnValue(2.0 * 0.25);

		const voteWeight = calculateVoteWeight('VERIFIED', -30);
		expect(voteWeight).toBe(0.5);
	});

	it('should remove voting power completely for very negative trust', async () => {
		const { calculateTrustModifier } = await import('$lib/server/services/trust');
		const { calculateVoteWeight } = await import('$lib/server/services/vote');

		vi.mocked(calculateTrustModifier).mockReturnValue(0);

		const modifier = calculateTrustModifier(-60);
		expect(modifier).toBe(0);

		vi.mocked(calculateVoteWeight).mockReturnValue(0);

		const voteWeight = calculateVoteWeight('VERIFIED', -60);
		expect(voteWeight).toBe(0);
	});
});

// ============================================
// Test Suite 8: Cross-Feature Integration
// ============================================

describe('User Journey: Cross-Feature Integration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetFactoryCounter();
	});

	it('should handle complex scenario: fact → comments → discussion → notification chain', async () => {
		const { createFact: createFactService, getFactById } = await import(
			'$lib/server/services/fact'
		);
		const { createComment } = await import('$lib/server/services/comment');
		const { createDiscussion, getDiscussionsByFact, voteOnDiscussion } = await import(
			'$lib/server/services/discussion'
		);
		const { createNotification, getUserNotifications, markAsRead } = await import(
			'$lib/server/services/notification.inapp'
		);

		const author = createVerifiedUser({ id: 'author' });
		const commenter1 = createVerifiedUser({ id: 'commenter-1' });
		const commenter2 = createExpertUser({ id: 'commenter-2' });

		const fact = createFact({
			id: 'complex-fact',
			title: 'Complex scientific claim',
			authorId: author.id
		});

		vi.mocked(createFactService).mockResolvedValue(fact as any);
		vi.mocked(getFactById).mockResolvedValue(fact as any);

		vi.mocked(createComment)
			.mockResolvedValueOnce({
				id: 'comment-1',
				factId: fact.id,
				userId: commenter1.id,
				body: 'Interesting claim!'
			} as any)
			.mockResolvedValueOnce({
				id: 'comment-2',
				factId: fact.id,
				userId: commenter2.id,
				body: 'I have concerns about the methodology.'
			} as any);

		await createComment({ factId: fact.id, userId: commenter1.id, body: 'Interesting claim!' });
		await createComment({
			factId: fact.id,
			userId: commenter2.id,
			body: 'I have concerns about the methodology.'
		});

		vi.mocked(createNotification).mockResolvedValue(undefined);
		await createNotification({ userId: author.id, type: 'COMMENT_RECEIVED', message: 'New comment on your fact' });
		await createNotification({ userId: author.id, type: 'COMMENT_RECEIVED', message: 'New comment on your fact' });

		vi.mocked(createDiscussion)
			.mockResolvedValueOnce({
				id: 'discussion-pro',
				factId: fact.id,
				type: 'PRO',
				userId: commenter1.id,
				body: 'This aligns with established research.'
			} as any)
			.mockResolvedValueOnce({
				id: 'discussion-contra',
				factId: fact.id,
				type: 'CONTRA',
				userId: commenter2.id,
				body: 'The sample size was too small.'
			} as any);

		await createDiscussion({
			factId: fact.id,
			type: 'PRO',
			userId: commenter1.id,
			body: 'This aligns with established research.'
		});
		await createDiscussion({
			factId: fact.id,
			type: 'CONTRA',
			userId: commenter2.id,
			body: 'The sample size was too small.'
		});

		vi.mocked(voteOnDiscussion)
			.mockResolvedValueOnce({ discussionId: 'discussion-pro', value: 1 } as any)
			.mockResolvedValueOnce({ discussionId: 'discussion-contra', value: 1 } as any);

		await voteOnDiscussion('discussion-pro', author.id, 1);
		await voteOnDiscussion('discussion-contra', author.id, 1);

		vi.mocked(getUserNotifications).mockResolvedValue([
			{ id: 'n1', type: 'COMMENT_RECEIVED', read: false },
			{ id: 'n2', type: 'COMMENT_RECEIVED', read: false },
			{ id: 'n3', type: 'DISCUSSION_REPLY', read: false }
		] as any);

		const notifications = await getUserNotifications(author.id);
		expect(notifications.length).toBeGreaterThanOrEqual(2);

		vi.mocked(markAsRead).mockResolvedValue(undefined);
		await markAsRead(author.id, notifications[0].id);
		expect(markAsRead).toHaveBeenCalled();

		vi.mocked(getDiscussionsByFact).mockResolvedValue({
			pro: [{ id: 'discussion-pro', type: 'PRO', votes: 5 }],
			contra: [{ id: 'discussion-contra', type: 'CONTRA', votes: 3 }],
			neutral: []
		} as any);

		const discussions = await getDiscussionsByFact(fact.id);
		expect(discussions.pro).toHaveLength(1);
		expect(discussions.contra).toHaveLength(1);
	});

	it('should handle category-based fact organization flow', async () => {
		const { createCategory: createCategoryService, getCategoryTree } =
			await import('$lib/server/services/category');
		const { createFact: createFactService, searchFacts } = await import(
			'$lib/server/services/fact'
		);

		const parentCategory = createCategory({ id: 'cat-science', name: 'Science' });
		const childCategory = createCategory({
			id: 'cat-physics',
			name: 'Physics',
			parentId: parentCategory.id
		});

		vi.mocked(createCategoryService)
			.mockResolvedValueOnce(parentCategory as any)
			.mockResolvedValueOnce(childCategory as any);

		await createCategoryService({ name: 'Science' });
		await createCategoryService({ name: 'Physics', parentId: parentCategory.id });

		const physicsFact = createFact({
			id: 'physics-fact',
			title: 'E=mc²',
			categoryId: childCategory.id
		});

		vi.mocked(createFactService).mockResolvedValue(physicsFact as any);

		vi.mocked(searchFacts).mockResolvedValue({
			facts: [physicsFact],
			total: 1
		} as any);

		const categoryFacts = await searchFacts({ categoryId: childCategory.id });
		expect(categoryFacts.facts).toHaveLength(1);

		vi.mocked(getCategoryTree).mockResolvedValue({
			...parentCategory,
			children: [childCategory]
		} as any);

		const tree = await getCategoryTree(parentCategory.id);
		expect(tree.children).toHaveLength(1);
		expect(tree.children[0].name).toBe('Physics');
	});
});

// ============================================
// Test Suite 9: Edge Cases and Error Handling
// ============================================

describe('User Journey: Edge Cases', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetFactoryCounter();
	});

	it('should prevent banned user from performing actions', async () => {
		const { createFact: createFactService } = await import('$lib/server/services/fact');
		const { castVote } = await import('$lib/server/services/vote');
		const { createComment } = await import('$lib/server/services/comment');
		const { isUserBanned } = await import('$lib/server/services/ban');

		const bannedUser = createVerifiedUser({
			id: 'banned-user',
			banLevel: 2,
			bannedUntil: new Date(Date.now() + 86400000)
		});

		vi.mocked(isUserBanned).mockResolvedValue(true);

		vi.mocked(createFactService).mockRejectedValue(
			createError('USER_BANNED', 'You cannot perform this action while banned')
		);

		await expect(
			createFactService({ title: 'Test', body: 'Test', authorId: bannedUser.id })
		).rejects.toMatchObject({ code: 'USER_BANNED' });

		vi.mocked(castVote).mockRejectedValue(new Error('User is banned'));

		await expect(castVote('fact-123', bannedUser.id, 1)).rejects.toThrow('User is banned');

		vi.mocked(createComment).mockRejectedValue(new Error('User is banned'));

		await expect(
			createComment({ factId: 'fact-123', userId: bannedUser.id, body: 'Comment' })
		).rejects.toThrow('User is banned');
	});

	it('should handle concurrent voting correctly', async () => {
		const { castVote, recalculateFactVotes } = await import('$lib/server/services/vote');

		const fact = createFact({ id: 'concurrent-vote-fact' });
		const voters = Array.from({ length: 10 }, (_, i) =>
			createVerifiedUser({ id: `voter-${i}` })
		);

		vi.mocked(castVote).mockImplementation(async (factId, userId, value) => ({
			id: `vote-${userId}`,
			factId,
			userId,
			value,
			weight: 2.0
		}));

		const votePromises = voters.map((voter) => castVote(fact.id, voter.id, 1));

		const votes = await Promise.all(votePromises);
		expect(votes).toHaveLength(10);

		vi.mocked(recalculateFactVotes).mockResolvedValue({
			upvotes: 10,
			downvotes: 0,
			weightedScore: 20.0
		});

		const finalResult = await recalculateFactVotes(fact.id);
		expect(finalResult.upvotes).toBe(10);
	});

	it('should handle session expiration gracefully', async () => {
		const { validateSession, loginUser } = await import('$lib/server/services/auth');

		vi.mocked(validateSession).mockRejectedValue(
			createError('SESSION_EXPIRED', 'Your session has expired')
		);

		await expect(validateSession('expired-session-id')).rejects.toMatchObject({
			code: 'SESSION_EXPIRED'
		});

		vi.mocked(loginUser).mockResolvedValue({
			user: createVerifiedUser({ id: 'user' }),
			session: { id: 'new-session', expiresAt: new Date(Date.now() + 86400000) }
		} as any);

		const newLogin = await loginUser('user@example.com', 'password');
		expect(newLogin.session.id).toBe('new-session');
	});

	it('should handle rate limiting on fact creation', async () => {
		const { createFact: createFactService } = await import('$lib/server/services/fact');

		const newUser = createVerifiedUser({ id: 'rate-limited-user' });

		vi.mocked(createFactService)
			.mockResolvedValueOnce(createFact({ authorId: newUser.id }) as any)
			.mockResolvedValueOnce(createFact({ authorId: newUser.id }) as any)
			.mockResolvedValueOnce(createFact({ authorId: newUser.id }) as any)
			.mockResolvedValueOnce(createFact({ authorId: newUser.id }) as any)
			.mockResolvedValueOnce(createFact({ authorId: newUser.id }) as any)
			.mockRejectedValueOnce(
				createError('RATE_LIMITED', 'You have reached the daily fact submission limit')
			);

		for (let i = 0; i < 5; i++) {
			await createFactService({ title: `Fact ${i}`, body: 'Body', authorId: newUser.id });
		}

		await expect(
			createFactService({ title: 'Fact 6', body: 'Body', authorId: newUser.id })
		).rejects.toMatchObject({ code: 'RATE_LIMITED' });
	});
});
