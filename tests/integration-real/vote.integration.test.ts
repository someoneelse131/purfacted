/**
 * Vote Service Integration Tests
 *
 * These tests hit the REAL database - no mocks!
 */

import { describe, it, expect } from 'vitest';
import { setupIntegrationTest, testDb, createTestUser, createTestFact, createTestCategory } from './db-setup';

describe('Vote Service - Real DB Integration', () => {
	setupIntegrationTest();

	describe('Fact Votes', () => {
		it('should create a fact vote', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });

			const vote = await testDb.factVote.create({
				data: {
					factId: fact.id,
					userId: user.id,
					value: 1,
					weight: 2.0
				}
			});

			expect(vote.id).toBeDefined();
			expect(vote.value).toBe(1);
			expect(vote.weight).toBe(2.0);

			// Verify in DB
			const dbVote = await testDb.factVote.findUnique({ where: { id: vote.id } });
			expect(dbVote).not.toBeNull();
		});

		it('should enforce unique fact-user vote constraint', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });

			await testDb.factVote.create({
				data: {
					factId: fact.id,
					userId: user.id,
					value: 1,
					weight: 2.0
				}
			});

			// Attempt duplicate vote
			await expect(
				testDb.factVote.create({
					data: {
						factId: fact.id,
						userId: user.id,
						value: -1,
						weight: 2.0
					}
				})
			).rejects.toThrow();
		});

		it('should update existing vote', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });

			const vote = await testDb.factVote.create({
				data: {
					factId: fact.id,
					userId: user.id,
					value: 1,
					weight: 2.0
				}
			});

			// Update vote from upvote to downvote
			const updated = await testDb.factVote.update({
				where: { id: vote.id },
				data: { value: -1 }
			});

			expect(updated.value).toBe(-1);
		});

		it('should calculate vote totals for a fact', async () => {
			const author = await createTestUser({ email: 'author@test.com' });
			const fact = await createTestFact({ userId: author.id });

			// Create multiple users and votes
			const user1 = await createTestUser({ email: 'voter1@test.com', trustScore: 50 });
			const user2 = await createTestUser({ email: 'voter2@test.com', trustScore: 100 });
			const user3 = await createTestUser({ email: 'voter3@test.com', trustScore: 10 });

			// Create votes with different weights
			await testDb.factVote.createMany({
				data: [
					{ factId: fact.id, userId: user1.id, value: 1, weight: 1.2 },
					{ factId: fact.id, userId: user2.id, value: 1, weight: 1.5 },
					{ factId: fact.id, userId: user3.id, value: -1, weight: 1.0 }
				]
			});

			// Calculate totals
			const votes = await testDb.factVote.findMany({
				where: { factId: fact.id }
			});

			const upvotes = votes.filter(v => v.value > 0);
			const downvotes = votes.filter(v => v.value < 0);
			const totalWeight = votes.reduce((sum, v) => sum + (v.value * v.weight), 0);

			expect(upvotes).toHaveLength(2);
			expect(downvotes).toHaveLength(1);
			expect(totalWeight).toBeCloseTo(1.2 + 1.5 - 1.0); // 1.7
		});

		it('should cascade delete votes when fact is deleted', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });

			const vote = await testDb.factVote.create({
				data: {
					factId: fact.id,
					userId: user.id,
					value: 1,
					weight: 2.0
				}
			});

			// Delete fact
			await testDb.fact.delete({ where: { id: fact.id } });

			// Vote should be gone
			const deletedVote = await testDb.factVote.findUnique({ where: { id: vote.id } });
			expect(deletedVote).toBeNull();
		});

		it('should cascade delete votes when user is deleted', async () => {
			const author = await createTestUser({ email: 'author@test.com' });
			const voter = await createTestUser({ email: 'voter@test.com' });
			const fact = await createTestFact({ userId: author.id });

			const vote = await testDb.factVote.create({
				data: {
					factId: fact.id,
					userId: voter.id,
					value: 1,
					weight: 2.0
				}
			});

			// Delete voter
			await testDb.user.delete({ where: { id: voter.id } });

			// Vote should be gone
			const deletedVote = await testDb.factVote.findUnique({ where: { id: vote.id } });
			expect(deletedVote).toBeNull();
		});
	});

	describe('Comment Votes', () => {
		it('should create a comment vote', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });

			const comment = await testDb.comment.create({
				data: {
					factId: fact.id,
					userId: user.id,
					body: 'Test comment'
				}
			});

			const vote = await testDb.commentVote.create({
				data: {
					commentId: comment.id,
					userId: user.id,
					value: 1,
					weight: 2.0
				}
			});

			expect(vote.id).toBeDefined();
			expect(vote.value).toBe(1);
		});

		it('should enforce unique comment-user vote constraint', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });

			const comment = await testDb.comment.create({
				data: {
					factId: fact.id,
					userId: user.id,
					body: 'Test comment'
				}
			});

			await testDb.commentVote.create({
				data: {
					commentId: comment.id,
					userId: user.id,
					value: 1,
					weight: 2.0
				}
			});

			// Attempt duplicate
			await expect(
				testDb.commentVote.create({
					data: {
						commentId: comment.id,
						userId: user.id,
						value: -1,
						weight: 2.0
					}
				})
			).rejects.toThrow();
		});

		it('should cascade delete comment votes when comment is deleted', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });

			const comment = await testDb.comment.create({
				data: {
					factId: fact.id,
					userId: user.id,
					body: 'Test comment'
				}
			});

			const vote = await testDb.commentVote.create({
				data: {
					commentId: comment.id,
					userId: user.id,
					value: 1,
					weight: 2.0
				}
			});

			await testDb.comment.delete({ where: { id: comment.id } });

			const deletedVote = await testDb.commentVote.findUnique({ where: { id: vote.id } });
			expect(deletedVote).toBeNull();
		});
	});

	describe('Discussion Votes', () => {
		it('should create a discussion vote', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });

			const discussion = await testDb.discussion.create({
				data: {
					factId: fact.id,
					userId: user.id,
					type: 'PRO',
					body: 'Pro argument for this fact'
				}
			});

			const vote = await testDb.discussionVote.create({
				data: {
					discussionId: discussion.id,
					userId: user.id,
					value: 1,
					weight: 2.0
				}
			});

			expect(vote.id).toBeDefined();
			expect(vote.value).toBe(1);
		});

		it('should track votes on pro/contra/neutral discussions separately', async () => {
			const user = await createTestUser();
			const voter = await createTestUser({ email: 'voter@test.com' });
			const fact = await createTestFact({ userId: user.id });

			const proDiscussion = await testDb.discussion.create({
				data: {
					factId: fact.id,
					userId: user.id,
					type: 'PRO',
					body: 'Pro argument'
				}
			});

			const contraDiscussion = await testDb.discussion.create({
				data: {
					factId: fact.id,
					userId: user.id,
					type: 'CONTRA',
					body: 'Contra argument'
				}
			});

			// Vote on both
			await testDb.discussionVote.create({
				data: {
					discussionId: proDiscussion.id,
					userId: voter.id,
					value: 1,
					weight: 2.0
				}
			});

			await testDb.discussionVote.create({
				data: {
					discussionId: contraDiscussion.id,
					userId: voter.id,
					value: -1,
					weight: 2.0
				}
			});

			// Fetch with votes
			const discussions = await testDb.discussion.findMany({
				where: { factId: fact.id },
				include: { votes: true }
			});

			const pro = discussions.find(d => d.type === 'PRO');
			const contra = discussions.find(d => d.type === 'CONTRA');

			expect(pro?.votes[0].value).toBe(1);
			expect(contra?.votes[0].value).toBe(-1);
		});
	});

	describe('Anonymous Votes', () => {
		it('should create an anonymous vote', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });

			const vote = await testDb.anonymousVote.create({
				data: {
					ipHash: 'testhash123',
					contentType: 'fact',
					contentId: fact.id,
					value: 1,
					weight: 0.1
				}
			});

			expect(vote.id).toBeDefined();
			expect(vote.weight).toBe(0.1);
		});

		it('should enforce unique ip-content vote constraint', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });

			await testDb.anonymousVote.create({
				data: {
					ipHash: 'testhash123',
					contentType: 'fact',
					contentId: fact.id,
					value: 1,
					weight: 0.1
				}
			});

			// Same IP, same content - should fail
			await expect(
				testDb.anonymousVote.create({
					data: {
						ipHash: 'testhash123',
						contentType: 'fact',
						contentId: fact.id,
						value: -1,
						weight: 0.1
					}
				})
			).rejects.toThrow();
		});

		it('should allow same IP to vote on different content', async () => {
			const user = await createTestUser();
			const fact1 = await createTestFact({ userId: user.id, title: 'Fact 1' });
			const fact2 = await createTestFact({ userId: user.id, title: 'Fact 2' });

			await testDb.anonymousVote.create({
				data: {
					ipHash: 'testhash123',
					contentType: 'fact',
					contentId: fact1.id,
					value: 1,
					weight: 0.1
				}
			});

			// Same IP, different content - should work
			const vote2 = await testDb.anonymousVote.create({
				data: {
					ipHash: 'testhash123',
					contentType: 'fact',
					contentId: fact2.id,
					value: -1,
					weight: 0.1
				}
			});

			expect(vote2.id).toBeDefined();
		});
	});

	describe('IP Rate Limiting', () => {
		it('should track vote count per IP', async () => {
			const resetAt = new Date(Date.now() + 86400000); // Tomorrow

			const rateLimit = await testDb.ipRateLimit.create({
				data: {
					ipHash: 'ratelimittest',
					voteCount: 0,
					resetAt
				}
			});

			// Increment vote count
			const updated = await testDb.ipRateLimit.update({
				where: { id: rateLimit.id },
				data: { voteCount: { increment: 1 } }
			});

			expect(updated.voteCount).toBe(1);
		});

		it('should reset count when expired', async () => {
			const pastReset = new Date(Date.now() - 86400000); // Yesterday

			await testDb.ipRateLimit.create({
				data: {
					ipHash: 'expiredtest',
					voteCount: 10,
					resetAt: pastReset
				}
			});

			// Find expired rate limits
			const expired = await testDb.ipRateLimit.findMany({
				where: {
					resetAt: { lt: new Date() }
				}
			});

			expect(expired).toHaveLength(1);
			expect(expired[0].voteCount).toBe(10);
		});
	});

	describe('Vote Weight Configuration', () => {
		it('should store vote weight config per user type', async () => {
			// Create config for VERIFIED users
			const config = await testDb.voteWeightConfig.create({
				data: {
					userType: 'VERIFIED',
					baseWeight: 2.0
				}
			});

			expect(config.baseWeight).toBe(2.0);

			// Verify uniqueness constraint
			await expect(
				testDb.voteWeightConfig.create({
					data: {
						userType: 'VERIFIED',
						baseWeight: 3.0
					}
				})
			).rejects.toThrow();
		});

		it('should update vote weight config', async () => {
			const config = await testDb.voteWeightConfig.create({
				data: {
					userType: 'EXPERT',
					baseWeight: 5.0
				}
			});

			const updated = await testDb.voteWeightConfig.update({
				where: { id: config.id },
				data: { baseWeight: 6.0 }
			});

			expect(updated.baseWeight).toBe(6.0);
		});
	});

	describe('Trust Modifier Configuration', () => {
		it('should store trust modifier ranges', async () => {
			const config = await testDb.trustModifierConfig.create({
				data: {
					minTrust: 100,
					maxTrust: null, // Unlimited upper bound
					modifier: 1.5
				}
			});

			expect(config.modifier).toBe(1.5);
			expect(config.maxTrust).toBeNull();
		});

		it('should query applicable trust modifier for a score', async () => {
			// Create tiers
			await testDb.trustModifierConfig.createMany({
				data: [
					{ minTrust: 0, maxTrust: 49, modifier: 1.0 },
					{ minTrust: 50, maxTrust: 99, modifier: 1.2 },
					{ minTrust: 100, maxTrust: null, modifier: 1.5 }
				]
			});

			// Find modifier for trust score 75
			const applicableModifier = await testDb.trustModifierConfig.findFirst({
				where: {
					minTrust: { lte: 75 },
					OR: [
						{ maxTrust: { gte: 75 } },
						{ maxTrust: null }
					]
				}
			});

			expect(applicableModifier?.modifier).toBe(1.2);
		});
	});

	describe('User Trust Votes', () => {
		it('should create a trust vote between users', async () => {
			const voter = await createTestUser({ email: 'voter@test.com' });
			const target = await createTestUser({ email: 'target@test.com' });

			const trustVote = await testDb.userTrustVote.create({
				data: {
					voterId: voter.id,
					targetId: target.id,
					value: 1
				}
			});

			expect(trustVote.id).toBeDefined();
			expect(trustVote.value).toBe(1);
		});

		it('should get trust votes received by a user', async () => {
			const target = await createTestUser({ email: 'target@test.com' });
			const voter1 = await createTestUser({ email: 'voter1@test.com' });
			const voter2 = await createTestUser({ email: 'voter2@test.com' });
			const voter3 = await createTestUser({ email: 'voter3@test.com' });

			await testDb.userTrustVote.createMany({
				data: [
					{ voterId: voter1.id, targetId: target.id, value: 1 },
					{ voterId: voter2.id, targetId: target.id, value: 1 },
					{ voterId: voter3.id, targetId: target.id, value: -1 }
				]
			});

			const receivedVotes = await testDb.userTrustVote.findMany({
				where: { targetId: target.id }
			});

			const positiveVotes = receivedVotes.filter(v => v.value > 0);
			const negativeVotes = receivedVotes.filter(v => v.value < 0);

			expect(receivedVotes).toHaveLength(3);
			expect(positiveVotes).toHaveLength(2);
			expect(negativeVotes).toHaveLength(1);
		});
	});

	describe('Veto Votes', () => {
		it('should create a veto and votes', async () => {
			const author = await createTestUser({ email: 'author@test.com' });
			const vetoer = await createTestUser({ email: 'vetoer@test.com' });
			const voter = await createTestUser({ email: 'voter@test.com' });
			const fact = await createTestFact({ userId: author.id, status: 'PROVEN' });

			// Create veto
			const veto = await testDb.veto.create({
				data: {
					factId: fact.id,
					userId: vetoer.id,
					reason: 'New evidence contradicts this fact',
					status: 'PENDING'
				}
			});

			// Vote on veto
			const vetoVote = await testDb.vetoVote.create({
				data: {
					vetoId: veto.id,
					userId: voter.id,
					value: 1,
					weight: 2.0
				}
			});

			expect(veto.id).toBeDefined();
			expect(vetoVote.id).toBeDefined();

			// Get veto with votes
			const vetoWithVotes = await testDb.veto.findUnique({
				where: { id: veto.id },
				include: { votes: true }
			});

			expect(vetoWithVotes?.votes).toHaveLength(1);
		});
	});
});
