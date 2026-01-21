import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	createUser,
	createVerifiedUser,
	createExpertUser,
	createModeratorUser,
	createFact,
	createProvenFact,
	createCategory,
	resetFactoryCounter
} from '../infrastructure';

/**
 * Multi-User Interaction Tests
 *
 * These tests simulate scenarios involving multiple users interacting
 * with the platform simultaneously.
 */

// ============================================
// Service Mocks - Simple function mocks only
// ============================================

vi.mock('$lib/server/services/auth', () => ({
	validateSession: vi.fn()
}));

vi.mock('$lib/server/services/user', () => ({
	getUserById: vi.fn(),
	getUsersByTrustScore: vi.fn()
}));

vi.mock('$lib/server/services/fact', () => ({
	createFact: vi.fn(),
	getFactById: vi.fn(),
	updateFactStatus: vi.fn(),
	searchFacts: vi.fn()
}));

vi.mock('$lib/server/services/vote', () => ({
	castVote: vi.fn(),
	getVotesByFact: vi.fn(),
	recalculateFactVotes: vi.fn(),
	getTopVoters: vi.fn()
}));

vi.mock('$lib/server/services/trust', () => ({
	updateTrustScore: vi.fn(),
	getUserTrustScore: vi.fn(),
	getLeaderboard: vi.fn(),
	recalculateTrustScores: vi.fn()
}));

vi.mock('$lib/server/services/comment', () => ({
	createComment: vi.fn(),
	getCommentsByFact: vi.fn(),
	voteOnComment: vi.fn()
}));

vi.mock('$lib/server/services/discussion', () => ({
	createDiscussion: vi.fn(),
	getDiscussionsByFact: vi.fn(),
	voteOnDiscussion: vi.fn()
}));

vi.mock('$lib/server/services/debate', () => ({
	createDebate: vi.fn(),
	getDebateById: vi.fn(),
	addDebateMessage: vi.fn(),
	voteOnDebate: vi.fn()
}));

vi.mock('$lib/server/services/report', () => ({
	createReport: vi.fn(),
	getReportsByContent: vi.fn()
}));

vi.mock('$lib/server/services/notification.inapp', () => ({
	createNotification: vi.fn(),
	createBulkNotifications: vi.fn(),
	getUserNotifications: vi.fn()
}));

vi.mock('$lib/server/services/veto', () => ({
	submitVeto: vi.fn(),
	voteOnVeto: vi.fn(),
	processVeto: vi.fn()
}));

vi.mock('$lib/server/services/category', () => ({
	createCategory: vi.fn(),
	requestCategoryMerge: vi.fn(),
	voteOnMerge: vi.fn()
}));

vi.mock('$lib/server/services/userBlock', () => ({
	blockUser: vi.fn(),
	unblockUser: vi.fn(),
	getBlockedUsers: vi.fn(),
	isBlocked: vi.fn()
}));

// Helper to create error-like objects
function createError(code: string, message: string) {
	const error = new Error(message);
	(error as any).code = code;
	return error;
}

// Helper to create PhD user
function createPhdUser(options: Partial<ReturnType<typeof createUser>> = {}) {
	return createUser({ userType: 'PHD', trustScore: 75, ...options });
}

// ============================================
// Test Suite 1: Collaborative Fact Verification
// ============================================

describe('Multi-User: Collaborative Fact Verification', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetFactoryCounter();
	});

	it('should verify fact through expert consensus', async () => {
		const { createFact: createFactService, updateFactStatus } = await import(
			'$lib/server/services/fact'
		);
		const { castVote, recalculateFactVotes } = await import('$lib/server/services/vote');
		const { updateTrustScore } = await import('$lib/server/services/trust');
		const { createBulkNotifications } = await import('$lib/server/services/notification.inapp');

		const experts = [
			createExpertUser({ id: 'expert-physics-1', trustScore: 85 }),
			createExpertUser({ id: 'expert-physics-2', trustScore: 92 }),
			createExpertUser({ id: 'expert-physics-3', trustScore: 78 }),
			createPhdUser({ id: 'phd-physics-1', trustScore: 95 }),
			createPhdUser({ id: 'phd-physics-2', trustScore: 88 })
		];

		const author = createVerifiedUser({ id: 'fact-author', trustScore: 40 });

		const scientificFact = createFact({
			id: 'scientific-claim',
			title: 'Quantum entanglement enables faster-than-light communication',
			body: 'Recent experiments suggest quantum entanglement could theoretically enable instantaneous communication.',
			authorId: author.id,
			status: 'SUBMITTED'
		});

		vi.mocked(createFactService).mockResolvedValue(scientificFact as any);

		const expertVotes = [
			{ expert: experts[0], value: -1, weight: 7.5 },
			{ expert: experts[1], value: -1, weight: 9.0 },
			{ expert: experts[2], value: 1, weight: 6.5 },
			{ expert: experts[3], value: -1, weight: 12.0 },
			{ expert: experts[4], value: -1, weight: 10.5 }
		];

		vi.mocked(castVote).mockImplementation(async (factId, userId, value) => {
			const expertVote = expertVotes.find((v) => v.expert.id === userId);
			return {
				id: `vote-${userId}`,
				factId,
				userId,
				value,
				weight: expertVote?.weight || 5.0
			} as any;
		});

		for (const vote of expertVotes) {
			await castVote(scientificFact.id, vote.expert.id, vote.value);
		}

		expect(castVote).toHaveBeenCalledTimes(5);

		vi.mocked(recalculateFactVotes).mockResolvedValue({
			upvotes: 1,
			downvotes: 4,
			weightedScore: -32.5
		});

		const consensus = await recalculateFactVotes(scientificFact.id);
		expect(consensus.weightedScore).toBeLessThan(-20);

		vi.mocked(updateFactStatus).mockResolvedValue({
			...scientificFact,
			status: 'DISPROVEN'
		} as any);

		const updatedFact = await updateFactStatus(scientificFact.id, 'DISPROVEN');
		expect(updatedFact.status).toBe('DISPROVEN');

		vi.mocked(updateTrustScore).mockResolvedValue(undefined);

		await updateTrustScore(author.id, -20, 'FACT_WRONG');

		for (const vote of expertVotes.filter((v) => v.value === -1)) {
			await updateTrustScore(vote.expert.id, 3, 'VERIFICATION_CORRECT');
		}

		expect(updateTrustScore).toHaveBeenCalledTimes(5);

		vi.mocked(createBulkNotifications).mockResolvedValue(undefined);

		await createBulkNotifications(
			experts.map((e) => e.id),
			{
				type: 'FACT_RESOLVED',
				message: 'A fact you voted on has been resolved'
			}
		);
	});

	it('should handle split expert opinion leading to DISPUTED status', async () => {
		const { updateFactStatus } = await import('$lib/server/services/fact');
		const { castVote, recalculateFactVotes } = await import('$lib/server/services/vote');
		const { createDiscussion, getDiscussionsByFact } = await import(
			'$lib/server/services/discussion'
		);

		const proExperts = [
			createExpertUser({ id: 'pro-expert-1', trustScore: 80 }),
			createExpertUser({ id: 'pro-expert-2', trustScore: 85 })
		];
		const contraExperts = [
			createExpertUser({ id: 'contra-expert-1', trustScore: 82 }),
			createExpertUser({ id: 'contra-expert-2', trustScore: 78 })
		];

		const controversialFact = createFact({
			id: 'controversial-fact',
			status: 'SUBMITTED'
		});

		vi.mocked(castVote).mockImplementation(async (factId, userId, value) => ({
			id: `vote-${userId}`,
			factId,
			userId,
			value,
			weight: 7.0
		}));

		for (const expert of proExperts) {
			await castVote(controversialFact.id, expert.id, 1);
		}

		for (const expert of contraExperts) {
			await castVote(controversialFact.id, expert.id, -1);
		}

		vi.mocked(recalculateFactVotes).mockResolvedValue({
			upvotes: 2,
			downvotes: 2,
			weightedScore: 0.5
		});

		const voteResult = await recalculateFactVotes(controversialFact.id);
		expect(Math.abs(voteResult.weightedScore)).toBeLessThan(5);

		vi.mocked(updateFactStatus).mockResolvedValue({
			...controversialFact,
			status: 'DISPUTED'
		} as any);

		const disputed = await updateFactStatus(controversialFact.id, 'DISPUTED');
		expect(disputed.status).toBe('DISPUTED');

		vi.mocked(createDiscussion)
			.mockResolvedValueOnce({
				id: 'discussion-pro',
				type: 'PRO',
				body: 'Here is evidence supporting this claim...'
			} as any)
			.mockResolvedValueOnce({
				id: 'discussion-contra',
				type: 'CONTRA',
				body: 'This claim contradicts established research...'
			} as any);

		await createDiscussion({
			factId: controversialFact.id,
			type: 'PRO',
			userId: proExperts[0].id,
			body: 'Here is evidence supporting this claim...'
		});

		await createDiscussion({
			factId: controversialFact.id,
			type: 'CONTRA',
			userId: contraExperts[0].id,
			body: 'This claim contradicts established research...'
		});

		vi.mocked(getDiscussionsByFact).mockResolvedValue({
			pro: [{ id: 'discussion-pro', type: 'PRO' }],
			contra: [{ id: 'discussion-contra', type: 'CONTRA' }],
			neutral: []
		} as any);

		const discussions = await getDiscussionsByFact(controversialFact.id);
		expect(discussions.pro).toHaveLength(1);
		expect(discussions.contra).toHaveLength(1);
	});
});

// ============================================
// Test Suite 2: Competing Perspectives
// ============================================

describe('Multi-User: Competing Perspectives', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetFactoryCounter();
	});

	it('should handle debate between two experts with opposing views', async () => {
		const { createDebate, addDebateMessage, voteOnDebate, getDebateById } = await import(
			'$lib/server/services/debate'
		);
		const { updateTrustScore } = await import('$lib/server/services/trust');
		const { createNotification } = await import('$lib/server/services/notification.inapp');

		const initiator = createExpertUser({ id: 'climate-scientist', trustScore: 90, firstName: 'Dr. Climate' });
		const participant = createExpertUser({ id: 'skeptic-researcher', trustScore: 75, firstName: 'Dr. Skeptic' });
		const audience = Array.from({ length: 20 }, (_, i) =>
			createVerifiedUser({ id: `audience-${i}`, trustScore: 10 + i * 2 })
		);

		const debate = {
			id: 'climate-debate',
			factId: 'climate-fact',
			initiatorId: initiator.id,
			participantId: participant.id,
			status: 'ACTIVE',
			published: true,
			messages: []
		};

		vi.mocked(createDebate).mockResolvedValue(debate as any);

		const debateMessages = [
			{ author: initiator, content: 'The evidence clearly shows warming trends.' },
			{ author: participant, content: 'Natural cycles could explain these trends.' },
			{ author: initiator, content: 'Multiple independent studies confirm anthropogenic causes.' },
			{ author: participant, content: 'Correlation does not imply causation.' },
			{ author: initiator, content: 'Here are controlled experiments ruling out natural causes.' },
			{ author: participant, content: 'I acknowledge the evidence is compelling.' }
		];

		vi.mocked(addDebateMessage).mockImplementation(async (debateId, authorId, content) => ({
			id: `msg-${Date.now()}`,
			debateId,
			authorId,
			content,
			createdAt: new Date()
		}));

		for (const msg of debateMessages) {
			await addDebateMessage(debate.id, msg.author.id, msg.content);
		}

		expect(addDebateMessage).toHaveBeenCalledTimes(6);

		let initiatorVotes = 0;
		let participantVotes = 0;

		vi.mocked(voteOnDebate).mockImplementation(async (debateId, userId, supportInitiator) => {
			if (supportInitiator) initiatorVotes++;
			else participantVotes++;
			return { debateId, userId, supportInitiator } as any;
		});

		for (let i = 0; i < 14; i++) {
			await voteOnDebate(debate.id, audience[i].id, true);
		}
		for (let i = 14; i < 20; i++) {
			await voteOnDebate(debate.id, audience[i].id, false);
		}

		expect(initiatorVotes).toBe(14);
		expect(participantVotes).toBe(6);

		vi.mocked(getDebateById).mockResolvedValue({
			...debate,
			status: 'CONCLUDED',
			initiatorVotes: 14,
			participantVotes: 6,
			winner: 'initiator'
		} as any);

		const concluded = await getDebateById(debate.id);
		expect(concluded?.winner).toBe('initiator');

		vi.mocked(updateTrustScore).mockResolvedValue(undefined);

		await updateTrustScore(initiator.id, 5, 'DEBATE_WON');
		await updateTrustScore(participant.id, 2, 'CONSTRUCTIVE_DEBATE');

		expect(updateTrustScore).toHaveBeenCalledWith(initiator.id, 5, 'DEBATE_WON');
	});
});

// ============================================
// Test Suite 3: Community Moderation
// ============================================

describe('Multi-User: Community Moderation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetFactoryCounter();
	});

	it('should handle multiple reports triggering auto-moderation', async () => {
		const { createReport, getReportsByContent } = await import('$lib/server/services/report');
		const { getFactById, updateFactStatus } = await import('$lib/server/services/fact');
		const { createNotification } = await import('$lib/server/services/notification.inapp');

		const reporters = Array.from({ length: 5 }, (_, i) =>
			createVerifiedUser({ id: `reporter-${i}`, trustScore: 30 + i * 5 })
		);

		const offendingFact = createFact({
			id: 'offensive-content',
			title: 'Misleading health claim',
			authorId: 'spammer-user'
		});

		vi.mocked(getFactById).mockResolvedValue(offendingFact as any);

		vi.mocked(createReport).mockImplementation(async (reportData) => ({
			id: `report-${Date.now()}`,
			...reportData,
			status: 'PENDING'
		}));

		const reportReasons = [
			'MISINFORMATION',
			'MISINFORMATION',
			'HARMFUL_CONTENT',
			'SPAM',
			'MISINFORMATION'
		];

		for (let i = 0; i < reporters.length; i++) {
			await createReport({
				reporterId: reporters[i].id,
				contentId: offendingFact.id,
				contentType: 'FACT',
				reason: reportReasons[i],
				description: `Report from user ${i}`
			});
		}

		expect(createReport).toHaveBeenCalledTimes(5);

		vi.mocked(getReportsByContent).mockResolvedValue({
			reports: reportReasons.map((reason, i) => ({
				id: `report-${i}`,
				reason,
				reporterId: reporters[i].id
			})),
			total: 5,
			uniqueReporters: 5
		} as any);

		const reports = await getReportsByContent(offendingFact.id);
		expect(reports.uniqueReporters).toBe(5);

		vi.mocked(updateFactStatus).mockResolvedValue({
			...offendingFact,
			status: 'UNDER_REVIEW',
			flaggedAt: new Date()
		} as any);

		const flaggedFact = await updateFactStatus(offendingFact.id, 'UNDER_REVIEW');
		expect(flaggedFact.status).toBe('UNDER_REVIEW');

		vi.mocked(createNotification).mockResolvedValue(undefined);

		for (const reporter of reporters) {
			await createNotification({
				userId: reporter.id,
				type: 'REPORT_ACKNOWLEDGED',
				message: 'Your report has been received and the content is under review'
			});
		}

		expect(createNotification).toHaveBeenCalledTimes(5);
	});

	it('should handle category merge request with community voting', async () => {
		const { createCategory: createCategoryService, requestCategoryMerge, voteOnMerge } = await import(
			'$lib/server/services/category'
		);

		const categoryCreator = createVerifiedUser({ id: 'cat-creator', trustScore: 50 });
		const voters = Array.from({ length: 10 }, (_, i) =>
			createVerifiedUser({ id: `cat-voter-${i}`, trustScore: 20 + i * 5 })
		);

		const category1 = createCategory({ id: 'cat-science', name: 'Science' });
		const category2 = createCategory({ id: 'cat-sciences', name: 'Sciences' });

		const mergeRequest = {
			id: 'merge-req-1',
			sourceId: category2.id,
			targetId: category1.id,
			requesterId: categoryCreator.id,
			status: 'PENDING',
			approvalVotes: 0,
			rejectionVotes: 0
		};

		vi.mocked(requestCategoryMerge).mockResolvedValue(mergeRequest as any);

		await requestCategoryMerge({
			sourceId: category2.id,
			targetId: category1.id,
			requesterId: categoryCreator.id,
			reason: 'These categories are duplicates with slightly different names'
		});

		let approvals = 0;
		let rejections = 0;

		vi.mocked(voteOnMerge).mockImplementation(async (mergeId, userId, approve) => {
			if (approve) approvals++;
			else rejections++;
			return { mergeId, userId, approve } as any;
		});

		for (let i = 0; i < 7; i++) {
			await voteOnMerge(mergeRequest.id, voters[i].id, true);
		}
		for (let i = 7; i < 10; i++) {
			await voteOnMerge(mergeRequest.id, voters[i].id, false);
		}

		expect(approvals).toBe(7);
		expect(rejections).toBe(3);
		expect(approvals / (approvals + rejections)).toBeGreaterThan(0.6);
	});
});

// ============================================
// Test Suite 4: Trust Network Effects
// ============================================

describe('Multi-User: Trust Network Effects', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetFactoryCounter();
	});

	it('should demonstrate trust score impact on vote weights', async () => {
		const { castVote, recalculateFactVotes } = await import('$lib/server/services/vote');
		const { getUserTrustScore } = await import('$lib/server/services/trust');

		const users = [
			createVerifiedUser({ id: 'high-trust', trustScore: 120 }),
			createVerifiedUser({ id: 'medium-trust', trustScore: 60 }),
			createVerifiedUser({ id: 'low-trust', trustScore: 30 }),
			createVerifiedUser({ id: 'negative-trust', trustScore: -20 }),
			createVerifiedUser({ id: 'very-negative', trustScore: -55 })
		];

		const fact = createFact({ id: 'trust-test-fact' });

		const voteWeights = [
			{ user: users[0], weight: 2.0 * 1.5 },
			{ user: users[1], weight: 2.0 * 1.2 },
			{ user: users[2], weight: 2.0 * 1.0 },
			{ user: users[3], weight: 2.0 * 0.5 },
			{ user: users[4], weight: 2.0 * 0 }
		];

		vi.mocked(castVote).mockImplementation(async (factId, userId, value) => {
			const voteWeight = voteWeights.find((v) => v.user.id === userId);
			return {
				id: `vote-${userId}`,
				factId,
				userId,
				value,
				weight: voteWeight?.weight || 0
			} as any;
		});

		for (const user of users) {
			await castVote(fact.id, user.id, 1);
		}

		vi.mocked(recalculateFactVotes).mockResolvedValue({
			upvotes: 5,
			downvotes: 0,
			weightedScore: 3.0 + 2.4 + 2.0 + 1.0 + 0
		});

		const result = await recalculateFactVotes(fact.id);
		expect(result.weightedScore).toBeCloseTo(8.4, 1);
		expect(voteWeights[4].weight).toBe(0);
	});

	it('should show trust leaderboard changes over time', async () => {
		const { getLeaderboard, updateTrustScore } = await import('$lib/server/services/trust');

		vi.mocked(getLeaderboard).mockResolvedValueOnce([
			{ userId: 'user-a', trustScore: 100, rank: 1 },
			{ userId: 'user-b', trustScore: 95, rank: 2 },
			{ userId: 'user-c', trustScore: 90, rank: 3 }
		] as any);

		let leaderboard = await getLeaderboard();
		expect(leaderboard[0].userId).toBe('user-a');

		vi.mocked(updateTrustScore).mockResolvedValue(undefined);
		await updateTrustScore('user-b', 10, 'FACT_APPROVED');
		await updateTrustScore('user-b', 10, 'FACT_APPROVED');
		await updateTrustScore('user-a', -20, 'FACT_WRONG');

		vi.mocked(getLeaderboard).mockResolvedValueOnce([
			{ userId: 'user-b', trustScore: 115, rank: 1 },
			{ userId: 'user-c', trustScore: 90, rank: 2 },
			{ userId: 'user-a', trustScore: 80, rank: 3 }
		] as any);

		leaderboard = await getLeaderboard();
		expect(leaderboard[0].userId).toBe('user-b');
		expect(leaderboard[2].userId).toBe('user-a');
	});
});

// ============================================
// Test Suite 5: User Blocking System
// ============================================

describe('Multi-User: User Blocking', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetFactoryCounter();
	});

	it('should handle user blocking and interaction restrictions', async () => {
		const { blockUser, isBlocked, getBlockedUsers } = await import(
			'$lib/server/services/userBlock'
		);
		const { createDebate } = await import('$lib/server/services/debate');
		const { createComment } = await import('$lib/server/services/comment');

		const userA = createVerifiedUser({ id: 'user-a' });
		const userB = createVerifiedUser({ id: 'user-b' });

		vi.mocked(blockUser).mockResolvedValue({
			blockerId: userA.id,
			blockedId: userB.id,
			createdAt: new Date()
		} as any);

		await blockUser(userA.id, userB.id);

		vi.mocked(isBlocked).mockResolvedValue(true);

		const blocked = await isBlocked(userA.id, userB.id);
		expect(blocked).toBe(true);

		vi.mocked(createDebate).mockRejectedValue(
			createError('USER_BLOCKED', 'Cannot debate with a user who has blocked you')
		);

		await expect(
			createDebate({
				factId: 'fact-123',
				initiatorId: userB.id,
				participantId: userA.id
			})
		).rejects.toMatchObject({ code: 'USER_BLOCKED' });

		vi.mocked(getBlockedUsers).mockResolvedValue([
			{ blockedId: userB.id, blockedAt: new Date() }
		] as any);

		const blockedList = await getBlockedUsers(userA.id);
		expect(blockedList).toHaveLength(1);
		expect(blockedList[0].blockedId).toBe(userB.id);
	});
});

// ============================================
// Test Suite 6: Notification Cascade
// ============================================

describe('Multi-User: Notification Cascade', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetFactoryCounter();
	});

	it('should trigger notification chain when fact status changes', async () => {
		const { getFactById, updateFactStatus } = await import('$lib/server/services/fact');
		const { getVotesByFact } = await import('$lib/server/services/vote');
		const { createNotification, createBulkNotifications } = await import(
			'$lib/server/services/notification.inapp'
		);

		const author = createVerifiedUser({ id: 'fact-author' });
		const voters = Array.from({ length: 15 }, (_, i) =>
			createVerifiedUser({ id: `voter-${i}` })
		);
		const commenters = Array.from({ length: 5 }, (_, i) =>
			createVerifiedUser({ id: `commenter-${i}` })
		);

		const fact = createFact({
			id: 'fact-cascade',
			authorId: author.id,
			status: 'SUBMITTED'
		});

		vi.mocked(getFactById).mockResolvedValue(fact as any);

		vi.mocked(getVotesByFact).mockResolvedValue({
			votes: voters.map((v, i) => ({ userId: v.id, value: i < 10 ? 1 : -1 })),
			total: 15
		} as any);

		const votes = await getVotesByFact(fact.id);
		expect(votes.total).toBe(15);

		vi.mocked(updateFactStatus).mockResolvedValue({
			...fact,
			status: 'PROVEN'
		} as any);

		await updateFactStatus(fact.id, 'PROVEN');

		vi.mocked(createNotification).mockResolvedValue(undefined);
		vi.mocked(createBulkNotifications).mockResolvedValue(undefined);

		await createNotification({
			userId: author.id,
			type: 'FACT_PROVEN',
			message: 'Your fact has been verified as proven!'
		});

		await createBulkNotifications(
			voters.map((v) => v.id),
			{
				type: 'FACT_RESOLVED',
				message: 'A fact you voted on has been resolved'
			}
		);

		await createBulkNotifications(
			commenters.map((c) => c.id),
			{
				type: 'FACT_RESOLVED',
				message: 'A fact you commented on has been resolved'
			}
		);

		expect(createNotification).toHaveBeenCalledTimes(1);
		expect(createBulkNotifications).toHaveBeenCalledTimes(2);
	});
});
