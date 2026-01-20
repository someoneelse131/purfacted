/**
 * Debate Service Integration Tests
 *
 * These tests hit the REAL database - no mocks!
 */

import { describe, it, expect } from 'vitest';
import { setupIntegrationTest, testDb, createTestUser, createTestFact } from './db-setup';

describe('Debate Service - Real DB Integration', () => {
	setupIntegrationTest();

	describe('Debate CRUD Operations', () => {
		it('should create a debate between two users', async () => {
			const initiator = await createTestUser({ email: 'initiator@test.com' });
			const participant = await createTestUser({ email: 'participant@test.com' });
			const fact = await createTestFact({ userId: initiator.id });

			const debate = await testDb.debate.create({
				data: {
					factId: fact.id,
					initiatorId: initiator.id,
					participantId: participant.id,
					status: 'PENDING'
				}
			});

			expect(debate.id).toBeDefined();
			expect(debate.status).toBe('PENDING');
			expect(debate.initiatorId).toBe(initiator.id);
			expect(debate.participantId).toBe(participant.id);
		});

		it('should find debates by user', async () => {
			const user1 = await createTestUser({ email: 'user1@test.com' });
			const user2 = await createTestUser({ email: 'user2@test.com' });
			const user3 = await createTestUser({ email: 'user3@test.com' });
			const fact = await createTestFact({ userId: user1.id });

			// User1 initiates debate with user2
			await testDb.debate.create({
				data: {
					factId: fact.id,
					initiatorId: user1.id,
					participantId: user2.id
				}
			});

			// User3 initiates debate with user1
			await testDb.debate.create({
				data: {
					factId: fact.id,
					initiatorId: user3.id,
					participantId: user1.id
				}
			});

			// Find all debates involving user1
			const user1Debates = await testDb.debate.findMany({
				where: {
					OR: [
						{ initiatorId: user1.id },
						{ participantId: user1.id }
					]
				}
			});

			expect(user1Debates).toHaveLength(2);
		});

		it('should update debate status through workflow', async () => {
			const initiator = await createTestUser({ email: 'initiator@test.com' });
			const participant = await createTestUser({ email: 'participant@test.com' });
			const fact = await createTestFact({ userId: initiator.id });

			const debate = await testDb.debate.create({
				data: {
					factId: fact.id,
					initiatorId: initiator.id,
					participantId: participant.id,
					status: 'PENDING'
				}
			});

			// Participant accepts
			let updated = await testDb.debate.update({
				where: { id: debate.id },
				data: { status: 'ACTIVE' }
			});
			expect(updated.status).toBe('ACTIVE');

			// Debate is published
			updated = await testDb.debate.update({
				where: { id: debate.id },
				data: {
					status: 'PUBLISHED',
					title: 'Climate Change Discussion',
					publishedAt: new Date()
				}
			});
			expect(updated.status).toBe('PUBLISHED');
			expect(updated.title).toBe('Climate Change Discussion');
			expect(updated.publishedAt).not.toBeNull();
		});

		it('should delete debate', async () => {
			const initiator = await createTestUser({ email: 'initiator@test.com' });
			const participant = await createTestUser({ email: 'participant@test.com' });
			const fact = await createTestFact({ userId: initiator.id });

			const debate = await testDb.debate.create({
				data: {
					factId: fact.id,
					initiatorId: initiator.id,
					participantId: participant.id
				}
			});

			await testDb.debate.delete({ where: { id: debate.id } });

			const deleted = await testDb.debate.findUnique({ where: { id: debate.id } });
			expect(deleted).toBeNull();
		});
	});

	describe('Debate Messages', () => {
		it('should add messages to a debate', async () => {
			const initiator = await createTestUser({ email: 'initiator@test.com' });
			const participant = await createTestUser({ email: 'participant@test.com' });
			const fact = await createTestFact({ userId: initiator.id });

			const debate = await testDb.debate.create({
				data: {
					factId: fact.id,
					initiatorId: initiator.id,
					participantId: participant.id,
					status: 'ACTIVE'
				}
			});

			// Initiator sends first message
			await testDb.debateMessage.create({
				data: {
					debateId: debate.id,
					userId: initiator.id,
					body: 'I believe this fact is accurate based on multiple sources.'
				}
			});

			// Participant responds
			await testDb.debateMessage.create({
				data: {
					debateId: debate.id,
					userId: participant.id,
					body: 'I disagree. The sources you cited are outdated.'
				}
			});

			const messages = await testDb.debateMessage.findMany({
				where: { debateId: debate.id },
				orderBy: { createdAt: 'asc' }
			});

			expect(messages).toHaveLength(2);
			expect(messages[0].userId).toBe(initiator.id);
			expect(messages[1].userId).toBe(participant.id);
		});

		it('should cascade delete messages when debate is deleted', async () => {
			const initiator = await createTestUser({ email: 'initiator@test.com' });
			const participant = await createTestUser({ email: 'participant@test.com' });
			const fact = await createTestFact({ userId: initiator.id });

			const debate = await testDb.debate.create({
				data: {
					factId: fact.id,
					initiatorId: initiator.id,
					participantId: participant.id
				}
			});

			const message = await testDb.debateMessage.create({
				data: {
					debateId: debate.id,
					userId: initiator.id,
					body: 'Test message'
				}
			});

			await testDb.debate.delete({ where: { id: debate.id } });

			const deletedMessage = await testDb.debateMessage.findUnique({ where: { id: message.id } });
			expect(deletedMessage).toBeNull();
		});

		it('should get debate with messages', async () => {
			const initiator = await createTestUser({ email: 'initiator@test.com' });
			const participant = await createTestUser({ email: 'participant@test.com' });
			const fact = await createTestFact({ userId: initiator.id });

			const debate = await testDb.debate.create({
				data: {
					factId: fact.id,
					initiatorId: initiator.id,
					participantId: participant.id
				}
			});

			await testDb.debateMessage.createMany({
				data: [
					{ debateId: debate.id, userId: initiator.id, body: 'Message 1' },
					{ debateId: debate.id, userId: participant.id, body: 'Message 2' },
					{ debateId: debate.id, userId: initiator.id, body: 'Message 3' }
				]
			});

			const debateWithMessages = await testDb.debate.findUnique({
				where: { id: debate.id },
				include: {
					messages: {
						orderBy: { createdAt: 'asc' }
					},
					initiator: true,
					participant: true
				}
			});

			expect(debateWithMessages?.messages).toHaveLength(3);
			expect(debateWithMessages?.initiator.email).toBe('initiator@test.com');
			expect(debateWithMessages?.participant.email).toBe('participant@test.com');
		});
	});

	describe('Debate Votes', () => {
		it('should vote on a published debate', async () => {
			const initiator = await createTestUser({ email: 'initiator@test.com' });
			const participant = await createTestUser({ email: 'participant@test.com' });
			const voter = await createTestUser({ email: 'voter@test.com' });
			const fact = await createTestFact({ userId: initiator.id });

			const debate = await testDb.debate.create({
				data: {
					factId: fact.id,
					initiatorId: initiator.id,
					participantId: participant.id,
					status: 'PUBLISHED',
					title: 'Test Debate',
					publishedAt: new Date()
				}
			});

			const vote = await testDb.debateVote.create({
				data: {
					debateId: debate.id,
					userId: voter.id,
					value: 1,
					weight: 2.0
				}
			});

			expect(vote.id).toBeDefined();
			expect(vote.value).toBe(1);
		});

		it('should enforce unique debate-user vote constraint', async () => {
			const initiator = await createTestUser({ email: 'initiator@test.com' });
			const participant = await createTestUser({ email: 'participant@test.com' });
			const voter = await createTestUser({ email: 'voter@test.com' });
			const fact = await createTestFact({ userId: initiator.id });

			const debate = await testDb.debate.create({
				data: {
					factId: fact.id,
					initiatorId: initiator.id,
					participantId: participant.id,
					status: 'PUBLISHED'
				}
			});

			await testDb.debateVote.create({
				data: {
					debateId: debate.id,
					userId: voter.id,
					value: 1,
					weight: 2.0
				}
			});

			// Second vote from same user should fail
			await expect(
				testDb.debateVote.create({
					data: {
						debateId: debate.id,
						userId: voter.id,
						value: -1,
						weight: 2.0
					}
				})
			).rejects.toThrow();
		});

		it('should calculate debate vote totals', async () => {
			const initiator = await createTestUser({ email: 'initiator@test.com' });
			const participant = await createTestUser({ email: 'participant@test.com' });
			const fact = await createTestFact({ userId: initiator.id });

			const debate = await testDb.debate.create({
				data: {
					factId: fact.id,
					initiatorId: initiator.id,
					participantId: participant.id,
					status: 'PUBLISHED'
				}
			});

			// Create multiple voters
			const voters = await Promise.all([
				createTestUser({ email: 'voter1@test.com' }),
				createTestUser({ email: 'voter2@test.com' }),
				createTestUser({ email: 'voter3@test.com' }),
				createTestUser({ email: 'voter4@test.com' })
			]);

			// Create votes (3 upvotes, 1 downvote)
			await testDb.debateVote.createMany({
				data: [
					{ debateId: debate.id, userId: voters[0].id, value: 1, weight: 2.0 },
					{ debateId: debate.id, userId: voters[1].id, value: 1, weight: 1.5 },
					{ debateId: debate.id, userId: voters[2].id, value: 1, weight: 1.0 },
					{ debateId: debate.id, userId: voters[3].id, value: -1, weight: 2.0 }
				]
			});

			const debateWithVotes = await testDb.debate.findUnique({
				where: { id: debate.id },
				include: { votes: true }
			});

			const totalScore = debateWithVotes?.votes.reduce((sum, v) => sum + (v.value * v.weight), 0) || 0;
			expect(debateWithVotes?.votes).toHaveLength(4);
			expect(totalScore).toBeCloseTo(2.5); // (2 + 1.5 + 1) - 2 = 2.5
		});
	});

	describe('Debate Status Queries', () => {
		it('should find published debates', async () => {
			const user1 = await createTestUser({ email: 'user1@test.com' });
			const user2 = await createTestUser({ email: 'user2@test.com' });
			const fact = await createTestFact({ userId: user1.id });

			// Create debates in different states
			await testDb.debate.create({
				data: {
					factId: fact.id,
					initiatorId: user1.id,
					participantId: user2.id,
					status: 'PENDING'
				}
			});

			await testDb.debate.create({
				data: {
					factId: fact.id,
					initiatorId: user1.id,
					participantId: user2.id,
					status: 'ACTIVE'
				}
			});

			await testDb.debate.create({
				data: {
					factId: fact.id,
					initiatorId: user1.id,
					participantId: user2.id,
					status: 'PUBLISHED',
					title: 'Published Debate',
					publishedAt: new Date()
				}
			});

			const publishedDebates = await testDb.debate.findMany({
				where: { status: 'PUBLISHED' }
			});

			expect(publishedDebates).toHaveLength(1);
			expect(publishedDebates[0].title).toBe('Published Debate');
		});

		it('should find pending debates for a user', async () => {
			const initiator = await createTestUser({ email: 'initiator@test.com' });
			const participant = await createTestUser({ email: 'participant@test.com' });
			const fact = await createTestFact({ userId: initiator.id });

			await testDb.debate.create({
				data: {
					factId: fact.id,
					initiatorId: initiator.id,
					participantId: participant.id,
					status: 'PENDING'
				}
			});

			await testDb.debate.create({
				data: {
					factId: fact.id,
					initiatorId: initiator.id,
					participantId: participant.id,
					status: 'ACTIVE'
				}
			});

			// Find pending debates where participant needs to accept
			const pendingForParticipant = await testDb.debate.findMany({
				where: {
					participantId: participant.id,
					status: 'PENDING'
				}
			});

			expect(pendingForParticipant).toHaveLength(1);
		});
	});

	describe('Debate with Fact Relationship', () => {
		it('should get debate with related fact', async () => {
			const user1 = await createTestUser({ email: 'user1@test.com' });
			const user2 = await createTestUser({ email: 'user2@test.com' });
			const fact = await createTestFact({
				userId: user1.id,
				title: 'Test Fact for Debate'
			});

			const debate = await testDb.debate.create({
				data: {
					factId: fact.id,
					initiatorId: user1.id,
					participantId: user2.id
				}
			});

			const debateWithFact = await testDb.debate.findUnique({
				where: { id: debate.id },
				include: { fact: true }
			});

			expect(debateWithFact?.fact.title).toBe('Test Fact for Debate');
		});

		it('should cascade delete debates when fact is deleted', async () => {
			const user1 = await createTestUser({ email: 'user1@test.com' });
			const user2 = await createTestUser({ email: 'user2@test.com' });
			const fact = await createTestFact({ userId: user1.id });

			const debate = await testDb.debate.create({
				data: {
					factId: fact.id,
					initiatorId: user1.id,
					participantId: user2.id
				}
			});

			// Delete fact
			await testDb.fact.delete({ where: { id: fact.id } });

			// Debate should be gone
			const deletedDebate = await testDb.debate.findUnique({ where: { id: debate.id } });
			expect(deletedDebate).toBeNull();
		});
	});

	describe('User Blocking in Debates', () => {
		it('should track user blocks', async () => {
			const blocker = await createTestUser({ email: 'blocker@test.com' });
			const blocked = await createTestUser({ email: 'blocked@test.com' });

			const block = await testDb.userBlock.create({
				data: {
					blockerId: blocker.id,
					blockedId: blocked.id
				}
			});

			expect(block.id).toBeDefined();
		});

		it('should check if user is blocked', async () => {
			const user1 = await createTestUser({ email: 'user1@test.com' });
			const user2 = await createTestUser({ email: 'user2@test.com' });
			const user3 = await createTestUser({ email: 'user3@test.com' });

			await testDb.userBlock.create({
				data: {
					blockerId: user1.id,
					blockedId: user2.id
				}
			});

			// Check if user2 is blocked by user1
			const isBlocked = await testDb.userBlock.findUnique({
				where: {
					blockerId_blockedId: {
						blockerId: user1.id,
						blockedId: user2.id
					}
				}
			});

			// Check if user3 is blocked by user1
			const isNotBlocked = await testDb.userBlock.findUnique({
				where: {
					blockerId_blockedId: {
						blockerId: user1.id,
						blockedId: user3.id
					}
				}
			});

			expect(isBlocked).not.toBeNull();
			expect(isNotBlocked).toBeNull();
		});

		it('should enforce unique block constraint', async () => {
			const blocker = await createTestUser({ email: 'blocker@test.com' });
			const blocked = await createTestUser({ email: 'blocked@test.com' });

			await testDb.userBlock.create({
				data: {
					blockerId: blocker.id,
					blockedId: blocked.id
				}
			});

			// Try to create duplicate block
			await expect(
				testDb.userBlock.create({
					data: {
						blockerId: blocker.id,
						blockedId: blocked.id
					}
				})
			).rejects.toThrow();
		});
	});
});
