/**
 * Trust Service Integration Tests
 *
 * These tests hit the REAL database - no mocks!
 */

import { describe, it, expect } from 'vitest';
import { setupIntegrationTest, testDb, createTestUser } from './db-setup';

describe('Trust Service - Real DB Integration', () => {
	setupIntegrationTest();

	describe('Trust Score Configuration', () => {
		it('should create trust score config for an action', async () => {
			const config = await testDb.trustScoreConfig.create({
				data: {
					action: 'FACT_APPROVED',
					points: 10
				}
			});

			expect(config.id).toBeDefined();
			expect(config.action).toBe('FACT_APPROVED');
			expect(config.points).toBe(10);
		});

		it('should enforce unique action constraint', async () => {
			await testDb.trustScoreConfig.create({
				data: {
					action: 'UPVOTED',
					points: 1
				}
			});

			await expect(
				testDb.trustScoreConfig.create({
					data: {
						action: 'UPVOTED',
						points: 2
					}
				})
			).rejects.toThrow();
		});

		it('should update trust config points', async () => {
			const config = await testDb.trustScoreConfig.create({
				data: {
					action: 'FACT_WRONG',
					points: -20
				}
			});

			const updated = await testDb.trustScoreConfig.update({
				where: { id: config.id },
				data: { points: -25 }
			});

			expect(updated.points).toBe(-25);
		});

		it('should store all trust action types', async () => {
			const actions = [
				{ action: 'FACT_APPROVED', points: 10 },
				{ action: 'FACT_WRONG', points: -20 },
				{ action: 'FACT_OUTDATED', points: 0 },
				{ action: 'VETO_SUCCESS', points: 5 },
				{ action: 'VETO_FAIL', points: -5 },
				{ action: 'VERIFICATION_CORRECT', points: 3 },
				{ action: 'VERIFICATION_WRONG', points: -10 },
				{ action: 'UPVOTED', points: 1 },
				{ action: 'DOWNVOTED', points: -1 }
			] as const;

			for (const { action, points } of actions) {
				await testDb.trustScoreConfig.create({
					data: { action, points }
				});
			}

			const allConfigs = await testDb.trustScoreConfig.findMany();
			expect(allConfigs).toHaveLength(9);
		});
	});

	describe('Trust Modifier Configuration', () => {
		it('should create trust modifier tiers', async () => {
			const modifier = await testDb.trustModifierConfig.create({
				data: {
					minTrust: 100,
					maxTrust: null,
					modifier: 1.5
				}
			});

			expect(modifier.id).toBeDefined();
			expect(modifier.modifier).toBe(1.5);
		});

		it('should create complete modifier tier system', async () => {
			await testDb.trustModifierConfig.createMany({
				data: [
					{ minTrust: -50, maxTrust: -26, modifier: 0.25 },
					{ minTrust: -25, maxTrust: -1, modifier: 0.5 },
					{ minTrust: 0, maxTrust: 49, modifier: 1.0 },
					{ minTrust: 50, maxTrust: 99, modifier: 1.2 },
					{ minTrust: 100, maxTrust: null, modifier: 1.5 }
				]
			});

			const modifiers = await testDb.trustModifierConfig.findMany({
				orderBy: { minTrust: 'asc' }
			});

			expect(modifiers).toHaveLength(5);
			expect(modifiers[0].modifier).toBe(0.25);
			expect(modifiers[4].modifier).toBe(1.5);
		});

		it('should find applicable modifier for a trust score', async () => {
			await testDb.trustModifierConfig.createMany({
				data: [
					{ minTrust: 0, maxTrust: 49, modifier: 1.0 },
					{ minTrust: 50, maxTrust: 99, modifier: 1.2 },
					{ minTrust: 100, maxTrust: null, modifier: 1.5 }
				]
			});

			// Find modifier for score 75 (should be 1.2)
			const modifier = await testDb.trustModifierConfig.findFirst({
				where: {
					minTrust: { lte: 75 },
					OR: [
						{ maxTrust: { gte: 75 } },
						{ maxTrust: null }
					]
				}
			});

			expect(modifier?.modifier).toBe(1.2);

			// Find modifier for score 150 (should be 1.5)
			const highModifier = await testDb.trustModifierConfig.findFirst({
				where: {
					minTrust: { lte: 150 },
					OR: [
						{ maxTrust: { gte: 150 } },
						{ maxTrust: null }
					]
				}
			});

			expect(highModifier?.modifier).toBe(1.5);
		});
	});

	describe('User Trust Score Operations', () => {
		it('should get users by trust score range', async () => {
			await createTestUser({ email: 'low@test.com', trustScore: 10 });
			await createTestUser({ email: 'medium@test.com', trustScore: 50 });
			await createTestUser({ email: 'high@test.com', trustScore: 100 });

			const highTrustUsers = await testDb.user.findMany({
				where: {
					trustScore: { gte: 50 },
					deletedAt: null
				},
				orderBy: { trustScore: 'desc' }
			});

			expect(highTrustUsers).toHaveLength(2);
			expect(highTrustUsers[0].trustScore).toBe(100);
		});

		it('should get top trusted users', async () => {
			await createTestUser({ email: 'user1@test.com', trustScore: 50 });
			await createTestUser({ email: 'user2@test.com', trustScore: 100 });
			await createTestUser({ email: 'user3@test.com', trustScore: 75 });
			await createTestUser({ email: 'user4@test.com', trustScore: 25 });

			const topUsers = await testDb.user.findMany({
				where: { deletedAt: null },
				orderBy: { trustScore: 'desc' },
				take: 3
			});

			expect(topUsers).toHaveLength(3);
			expect(topUsers[0].trustScore).toBe(100);
			expect(topUsers[1].trustScore).toBe(75);
			expect(topUsers[2].trustScore).toBe(50);
		});

		it('should update user trust score directly', async () => {
			const user = await createTestUser({ trustScore: 50 });

			// Simulate FACT_APPROVED (+10)
			const updated = await testDb.user.update({
				where: { id: user.id },
				data: { trustScore: { increment: 10 } }
			});

			expect(updated.trustScore).toBe(60);
		});

		it('should allow negative trust scores', async () => {
			const user = await createTestUser({ trustScore: 10 });

			// Simulate FACT_WRONG (-20)
			const updated = await testDb.user.update({
				where: { id: user.id },
				data: { trustScore: { decrement: 20 } }
			});

			expect(updated.trustScore).toBe(-10);
		});

		it('should apply multiple trust changes', async () => {
			const user = await createTestUser({ trustScore: 50 });

			// Apply multiple actions
			// FACT_APPROVED (+10)
			await testDb.user.update({
				where: { id: user.id },
				data: { trustScore: { increment: 10 } }
			});

			// UPVOTED (+1)
			await testDb.user.update({
				where: { id: user.id },
				data: { trustScore: { increment: 1 } }
			});

			// FACT_WRONG (-20)
			await testDb.user.update({
				where: { id: user.id },
				data: { trustScore: { decrement: 20 } }
			});

			const finalUser = await testDb.user.findUnique({ where: { id: user.id } });
			expect(finalUser?.trustScore).toBe(41); // 50 + 10 + 1 - 20 = 41
		});
	});

	describe('Trust Score Impact on Voting', () => {
		it('should calculate vote weight based on user type and trust', async () => {
			// Create vote weight configs
			await testDb.voteWeightConfig.createMany({
				data: [
					{ userType: 'ANONYMOUS', baseWeight: 0.1 },
					{ userType: 'VERIFIED', baseWeight: 2.0 },
					{ userType: 'EXPERT', baseWeight: 5.0 }
				]
			});

			// Create trust modifier configs
			await testDb.trustModifierConfig.createMany({
				data: [
					{ minTrust: 0, maxTrust: 49, modifier: 1.0 },
					{ minTrust: 50, maxTrust: 99, modifier: 1.2 },
					{ minTrust: 100, maxTrust: null, modifier: 1.5 }
				]
			});

			// Create a VERIFIED user with trust 75
			const user = await createTestUser({
				email: 'voter@test.com',
				userType: 'VERIFIED',
				trustScore: 75
			});

			// Get base weight
			const weightConfig = await testDb.voteWeightConfig.findUnique({
				where: { userType: user.userType }
			});

			// Get trust modifier
			const modifierConfig = await testDb.trustModifierConfig.findFirst({
				where: {
					minTrust: { lte: user.trustScore },
					OR: [
						{ maxTrust: { gte: user.trustScore } },
						{ maxTrust: null }
					]
				}
			});

			const finalWeight = (weightConfig?.baseWeight || 1) * (modifierConfig?.modifier || 1);

			expect(weightConfig?.baseWeight).toBe(2.0);
			expect(modifierConfig?.modifier).toBe(1.2);
			expect(finalWeight).toBeCloseTo(2.4);
		});

		it('should give zero weight to users with very low trust', async () => {
			// Create a modifier that gives 0 weight to users below -50
			await testDb.trustModifierConfig.create({
				data: {
					minTrust: -999,
					maxTrust: -51,
					modifier: 0.0
				}
			});

			const user = await createTestUser({
				email: 'baduser@test.com',
				trustScore: -60
			});

			const modifier = await testDb.trustModifierConfig.findFirst({
				where: {
					minTrust: { lte: user.trustScore },
					OR: [
						{ maxTrust: { gte: user.trustScore } },
						{ maxTrust: null }
					]
				}
			});

			expect(modifier?.modifier).toBe(0.0);
		});
	});

	describe('Trust Score History', () => {
		it('should track trust changes via user trust votes', async () => {
			const target = await createTestUser({ email: 'target@test.com' });
			const voter1 = await createTestUser({ email: 'voter1@test.com' });
			const voter2 = await createTestUser({ email: 'voter2@test.com' });

			// Record trust votes
			await testDb.userTrustVote.createMany({
				data: [
					{ voterId: voter1.id, targetId: target.id, value: 1 },
					{ voterId: voter2.id, targetId: target.id, value: -1 }
				]
			});

			const trustVotes = await testDb.userTrustVote.findMany({
				where: { targetId: target.id }
			});

			const totalVotes = trustVotes.reduce((sum, v) => sum + v.value, 0);
			expect(trustVotes).toHaveLength(2);
			expect(totalVotes).toBe(0); // +1 and -1 cancel out
		});
	});

	describe('Expert and Organization Trust', () => {
		it('should track expert verification status', async () => {
			const user = await createTestUser({
				email: 'expert@test.com',
				userType: 'VERIFIED'
			});

			// Create expert verification request
			const verification = await testDb.expertVerification.create({
				data: {
					userId: user.id,
					type: 'EXPERT',
					field: 'Climate Science',
					status: 'PENDING',
					documentUrl: 'https://example.com/diploma.pdf'
				}
			});

			expect(verification.status).toBe('PENDING');

			// Approve and upgrade user
			await testDb.expertVerification.update({
				where: { id: verification.id },
				data: {
					status: 'APPROVED'
				}
			});

			await testDb.user.update({
				where: { id: user.id },
				data: { userType: 'EXPERT' }
			});

			const expertUser = await testDb.user.findUnique({ where: { id: user.id } });
			expect(expertUser?.userType).toBe('EXPERT');
		});

		it('should handle organization high-weight votes', async () => {
			await testDb.voteWeightConfig.create({
				data: {
					userType: 'ORGANIZATION',
					baseWeight: 100.0
				}
			});

			const orgUser = await createTestUser({
				email: 'org@company.com',
				userType: 'ORGANIZATION',
				trustScore: 50
			});

			const weightConfig = await testDb.voteWeightConfig.findUnique({
				where: { userType: orgUser.userType }
			});

			expect(weightConfig?.baseWeight).toBe(100.0);
		});
	});

	describe('Trust Score Queries', () => {
		it('should count users by trust tier', async () => {
			await createTestUser({ email: 'low1@test.com', trustScore: 10 });
			await createTestUser({ email: 'low2@test.com', trustScore: 25 });
			await createTestUser({ email: 'medium1@test.com', trustScore: 50 });
			await createTestUser({ email: 'medium2@test.com', trustScore: 75 });
			await createTestUser({ email: 'high1@test.com', trustScore: 100 });

			const lowTrustCount = await testDb.user.count({
				where: {
					trustScore: { lt: 50 },
					deletedAt: null
				}
			});

			const mediumTrustCount = await testDb.user.count({
				where: {
					trustScore: { gte: 50, lt: 100 },
					deletedAt: null
				}
			});

			const highTrustCount = await testDb.user.count({
				where: {
					trustScore: { gte: 100 },
					deletedAt: null
				}
			});

			expect(lowTrustCount).toBe(2);
			expect(mediumTrustCount).toBe(2);
			expect(highTrustCount).toBe(1);
		});

		it('should calculate average trust score', async () => {
			await createTestUser({ email: 'u1@test.com', trustScore: 20 });
			await createTestUser({ email: 'u2@test.com', trustScore: 40 });
			await createTestUser({ email: 'u3@test.com', trustScore: 60 });

			const result = await testDb.user.aggregate({
				where: { deletedAt: null },
				_avg: { trustScore: true }
			});

			expect(result._avg.trustScore).toBe(40);
		});
	});
});
