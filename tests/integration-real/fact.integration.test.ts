/**
 * Fact Service Integration Tests
 *
 * These tests hit the REAL database - no mocks!
 */

import { describe, it, expect } from 'vitest';
import { setupIntegrationTest, testDb, createTestUser, createTestFact, createTestSource, createTestCategory } from './db-setup';

describe('Fact Service - Real DB Integration', () => {
	setupIntegrationTest();

	describe('Fact CRUD Operations', () => {
		it('should create a fact in the database', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({
				title: 'Test Fact Title',
				body: 'This is the body of the test fact with sufficient content.',
				userId: user.id
			});

			expect(fact.id).toBeDefined();
			expect(fact.title).toBe('Test Fact Title');
			expect(fact.status).toBe('SUBMITTED');
			expect(fact.userId).toBe(user.id);

			// Verify in DB
			const dbFact = await testDb.fact.findUnique({ where: { id: fact.id } });
			expect(dbFact).not.toBeNull();
			expect(dbFact?.title).toBe('Test Fact Title');
		});

		it('should find facts by user', async () => {
			const user1 = await createTestUser({ email: 'user1@test.com' });
			const user2 = await createTestUser({ email: 'user2@test.com' });

			await createTestFact({ userId: user1.id, title: 'User1 Fact 1' });
			await createTestFact({ userId: user1.id, title: 'User1 Fact 2' });
			await createTestFact({ userId: user2.id, title: 'User2 Fact' });

			const user1Facts = await testDb.fact.findMany({
				where: { userId: user1.id }
			});

			expect(user1Facts).toHaveLength(2);
		});

		it('should update fact status', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });

			const updated = await testDb.fact.update({
				where: { id: fact.id },
				data: { status: 'PROVEN' }
			});

			expect(updated.status).toBe('PROVEN');
		});

		it('should delete fact', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });

			await testDb.fact.delete({ where: { id: fact.id } });

			const deleted = await testDb.fact.findUnique({ where: { id: fact.id } });
			expect(deleted).toBeNull();
		});
	});

	describe('Fact with Sources', () => {
		it('should create fact with sources', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });

			await createTestSource({
				factId: fact.id,
				url: 'https://source1.com/article',
				title: 'Source 1',
				type: 'NEWS',
				credibilityScore: 60
			});

			await createTestSource({
				factId: fact.id,
				url: 'https://source2.edu/paper',
				title: 'Source 2',
				type: 'PEER_REVIEWED',
				credibilityScore: 85
			});

			const factWithSources = await testDb.fact.findUnique({
				where: { id: fact.id },
				include: { sources: true }
			});

			expect(factWithSources?.sources).toHaveLength(2);
			expect(factWithSources?.sources.some(s => s.type === 'PEER_REVIEWED')).toBe(true);
		});

		it('should calculate average source credibility', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });

			await createTestSource({ factId: fact.id, credibilityScore: 60 });
			await createTestSource({ factId: fact.id, credibilityScore: 80 });
			await createTestSource({ factId: fact.id, credibilityScore: 100 });

			const sources = await testDb.source.findMany({
				where: { factId: fact.id }
			});

			const avgCredibility = sources.reduce((sum, s) => sum + s.credibility, 0) / sources.length;
			expect(avgCredibility).toBe(80);
		});

		it('should cascade delete sources when fact deleted', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id });
			const source = await createTestSource({ factId: fact.id });

			await testDb.fact.delete({ where: { id: fact.id } });

			const deletedSource = await testDb.source.findUnique({ where: { id: source.id } });
			expect(deletedSource).toBeNull();
		});
	});

	describe('Fact with Category', () => {
		it('should create fact with category', async () => {
			const user = await createTestUser();
			const category = await createTestCategory({ name: 'Science' });
			const fact = await createTestFact({
				userId: user.id,
				categoryId: category.id
			});

			const factWithCategory = await testDb.fact.findUnique({
				where: { id: fact.id },
				include: { category: true }
			});

			expect(factWithCategory?.category?.name).toBe('Science');
		});

		it('should find facts by category', async () => {
			const user = await createTestUser();
			const scienceCat = await createTestCategory({ name: 'Science' });
			const politicsCat = await createTestCategory({ name: 'Politics' });

			await createTestFact({ userId: user.id, categoryId: scienceCat.id });
			await createTestFact({ userId: user.id, categoryId: scienceCat.id });
			await createTestFact({ userId: user.id, categoryId: politicsCat.id });

			const scienceFacts = await testDb.fact.findMany({
				where: { categoryId: scienceCat.id }
			});

			expect(scienceFacts).toHaveLength(2);
		});
	});

	describe('Fact Status Workflow', () => {
		it('should track all status transitions', async () => {
			const user = await createTestUser();
			const fact = await createTestFact({ userId: user.id, status: 'SUBMITTED' });

			// Simulate workflow: SUBMITTED -> IN_REVIEW -> PROVEN
			await testDb.fact.update({
				where: { id: fact.id },
				data: { status: 'IN_REVIEW' }
			});

			let dbFact = await testDb.fact.findUnique({ where: { id: fact.id } });
			expect(dbFact?.status).toBe('IN_REVIEW');

			await testDb.fact.update({
				where: { id: fact.id },
				data: { status: 'PROVEN' }
			});

			dbFact = await testDb.fact.findUnique({ where: { id: fact.id } });
			expect(dbFact?.status).toBe('PROVEN');
		});

		it('should count facts by status', async () => {
			const user = await createTestUser();

			await createTestFact({ userId: user.id, status: 'SUBMITTED' });
			await createTestFact({ userId: user.id, status: 'SUBMITTED' });
			await createTestFact({ userId: user.id, status: 'PROVEN' });
			await createTestFact({ userId: user.id, status: 'DISPROVEN' });

			const statusCounts = await testDb.fact.groupBy({
				by: ['status'],
				_count: { id: true }
			});

			const submitted = statusCounts.find(s => s.status === 'SUBMITTED');
			const proven = statusCounts.find(s => s.status === 'PROVEN');
			const disproven = statusCounts.find(s => s.status === 'DISPROVEN');

			expect(submitted?._count.id).toBe(2);
			expect(proven?._count.id).toBe(1);
			expect(disproven?._count.id).toBe(1);
		});
	});

	describe('Fact Search', () => {
		it('should search facts by title', async () => {
			const user = await createTestUser();

			await createTestFact({ userId: user.id, title: 'Climate Change Impact' });
			await createTestFact({ userId: user.id, title: 'Economic Growth Trends' });
			await createTestFact({ userId: user.id, title: 'Climate Policy Analysis' });

			const climateFacts = await testDb.fact.findMany({
				where: {
					title: { contains: 'Climate', mode: 'insensitive' }
				}
			});

			expect(climateFacts).toHaveLength(2);
		});

		it('should search facts by body content', async () => {
			const user = await createTestUser();

			await createTestFact({
				userId: user.id,
				title: 'Fact 1',
				body: 'This fact discusses renewable energy sources'
			});
			await createTestFact({
				userId: user.id,
				title: 'Fact 2',
				body: 'This fact covers political developments'
			});

			const energyFacts = await testDb.fact.findMany({
				where: {
					body: { contains: 'energy', mode: 'insensitive' }
				}
			});

			expect(energyFacts).toHaveLength(1);
			expect(energyFacts[0].title).toBe('Fact 1');
		});
	});

	describe('Fact Ordering', () => {
		it('should order facts by creation date', async () => {
			const user = await createTestUser();

			const fact1 = await createTestFact({ userId: user.id, title: 'First' });
			// Small delay to ensure different timestamps
			await new Promise(r => setTimeout(r, 10));
			const fact2 = await createTestFact({ userId: user.id, title: 'Second' });
			await new Promise(r => setTimeout(r, 10));
			const fact3 = await createTestFact({ userId: user.id, title: 'Third' });

			const facts = await testDb.fact.findMany({
				orderBy: { createdAt: 'desc' }
			});

			expect(facts[0].title).toBe('Third');
			expect(facts[2].title).toBe('First');
		});
	});
});
