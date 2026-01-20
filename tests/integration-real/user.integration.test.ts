/**
 * User Service Integration Tests
 *
 * These tests hit the REAL database - no mocks!
 */

import { describe, it, expect } from 'vitest';
import { setupIntegrationTest, testDb, createTestUser } from './db-setup';

describe('User Service - Real DB Integration', () => {
	setupIntegrationTest();

	describe('User CRUD Operations', () => {
		it('should create a user in the database', async () => {
			const user = await createTestUser({
				email: 'create-test@example.com',
				firstName: 'John',
				lastName: 'Doe'
			});

			expect(user.id).toBeDefined();
			expect(user.email).toBe('create-test@example.com');
			expect(user.firstName).toBe('John');
			expect(user.lastName).toBe('Doe');
			expect(user.trustScore).toBe(10);
			expect(user.userType).toBe('VERIFIED');

			// Verify it's actually in the DB
			const dbUser = await testDb.user.findUnique({ where: { id: user.id } });
			expect(dbUser).not.toBeNull();
			expect(dbUser?.email).toBe('create-test@example.com');
		});

		it('should find user by email', async () => {
			await createTestUser({ email: 'findme@example.com' });

			const user = await testDb.user.findUnique({
				where: { email: 'findme@example.com' }
			});

			expect(user).not.toBeNull();
			expect(user?.email).toBe('findme@example.com');
		});

		it('should update user trust score', async () => {
			const user = await createTestUser({ trustScore: 10 });

			const updated = await testDb.user.update({
				where: { id: user.id },
				data: { trustScore: 50 }
			});

			expect(updated.trustScore).toBe(50);

			// Verify in DB
			const dbUser = await testDb.user.findUnique({ where: { id: user.id } });
			expect(dbUser?.trustScore).toBe(50);
		});

		it('should soft delete user', async () => {
			const user = await createTestUser();

			await testDb.user.update({
				where: { id: user.id },
				data: { deletedAt: new Date() }
			});

			const dbUser = await testDb.user.findUnique({ where: { id: user.id } });
			expect(dbUser?.deletedAt).not.toBeNull();
		});

		it('should enforce unique email constraint', async () => {
			await createTestUser({ email: 'unique@example.com' });

			await expect(
				createTestUser({ email: 'unique@example.com' })
			).rejects.toThrow();
		});
	});

	describe('User Types', () => {
		it('should create users with different types', async () => {
			const verified = await createTestUser({ userType: 'VERIFIED' });
			const expert = await createTestUser({ userType: 'EXPERT' });
			const phd = await createTestUser({ userType: 'PHD' });
			const org = await createTestUser({ userType: 'ORGANIZATION' });
			const mod = await createTestUser({ userType: 'MODERATOR' });

			expect(verified.userType).toBe('VERIFIED');
			expect(expert.userType).toBe('EXPERT');
			expect(phd.userType).toBe('PHD');
			expect(org.userType).toBe('ORGANIZATION');
			expect(mod.userType).toBe('MODERATOR');
		});
	});

	describe('User Relationships', () => {
		it('should create user with facts', async () => {
			const user = await createTestUser();

			// Create facts for user
			await testDb.fact.create({
				data: {
					title: 'User Fact 1',
					body: 'Test body content here',
					userId: user.id
				}
			});

			await testDb.fact.create({
				data: {
					title: 'User Fact 2',
					body: 'Another test body content',
					userId: user.id
				}
			});

			// Fetch user with facts
			const userWithFacts = await testDb.user.findUnique({
				where: { id: user.id },
				include: { facts: true }
			});

			expect(userWithFacts?.facts).toHaveLength(2);
		});

		it('should cascade delete user facts when user deleted', async () => {
			const user = await createTestUser();

			const fact = await testDb.fact.create({
				data: {
					title: 'Will be deleted',
					body: 'Test body',
					userId: user.id
				}
			});

			// Delete user (cascade should delete facts)
			await testDb.user.delete({ where: { id: user.id } });

			// Fact should be gone
			const deletedFact = await testDb.fact.findUnique({ where: { id: fact.id } });
			expect(deletedFact).toBeNull();
		});
	});

	describe('Trust Score Operations', () => {
		it('should increment trust score', async () => {
			const user = await createTestUser({ trustScore: 10 });

			const updated = await testDb.user.update({
				where: { id: user.id },
				data: { trustScore: { increment: 5 } }
			});

			expect(updated.trustScore).toBe(15);
		});

		it('should decrement trust score', async () => {
			const user = await createTestUser({ trustScore: 10 });

			const updated = await testDb.user.update({
				where: { id: user.id },
				data: { trustScore: { decrement: 3 } }
			});

			expect(updated.trustScore).toBe(7);
		});

		it('should allow negative trust scores', async () => {
			const user = await createTestUser({ trustScore: 5 });

			const updated = await testDb.user.update({
				where: { id: user.id },
				data: { trustScore: { decrement: 10 } }
			});

			expect(updated.trustScore).toBe(-5);
		});
	});

	describe('Ban System', () => {
		it('should ban user with level and expiry', async () => {
			const user = await createTestUser();
			const banUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

			const banned = await testDb.user.update({
				where: { id: user.id },
				data: {
					banLevel: 1,
					bannedUntil: banUntil
				}
			});

			expect(banned.banLevel).toBe(1);
			expect(banned.bannedUntil).toEqual(banUntil);
		});

		it('should query for banned users', async () => {
			await createTestUser({ email: 'notbanned@test.com' });

			const bannedUser = await createTestUser({ email: 'banned@test.com' });
			await testDb.user.update({
				where: { id: bannedUser.id },
				data: { banLevel: 2, bannedUntil: new Date(Date.now() + 86400000) }
			});

			const bannedUsers = await testDb.user.findMany({
				where: { banLevel: { gt: 0 } }
			});

			expect(bannedUsers).toHaveLength(1);
			expect(bannedUsers[0].email).toBe('banned@test.com');
		});
	});
});
