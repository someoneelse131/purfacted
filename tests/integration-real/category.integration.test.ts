/**
 * Category Service Integration Tests
 *
 * These tests hit the REAL database - no mocks!
 */

import { describe, it, expect } from 'vitest';
import { setupIntegrationTest, testDb, createTestUser, createTestFact, createTestCategory } from './db-setup';

describe('Category Service - Real DB Integration', () => {
	setupIntegrationTest();

	describe('Category CRUD Operations', () => {
		it('should create a category', async () => {
			const category = await createTestCategory({ name: 'Science' });

			expect(category.id).toBeDefined();
			expect(category.name).toBe('Science');
		});

		it('should enforce unique category name', async () => {
			await createTestCategory({ name: 'Politics' });

			await expect(
				createTestCategory({ name: 'Politics' })
			).rejects.toThrow();
		});

		it('should find category by name', async () => {
			await createTestCategory({ name: 'Technology' });

			const found = await testDb.category.findUnique({
				where: { name: 'Technology' }
			});

			expect(found).not.toBeNull();
			expect(found?.name).toBe('Technology');
		});

		it('should update category name', async () => {
			const category = await createTestCategory({ name: 'OldName' });

			const updated = await testDb.category.update({
				where: { id: category.id },
				data: { name: 'NewName' }
			});

			expect(updated.name).toBe('NewName');
		});

		it('should delete category', async () => {
			const category = await createTestCategory({ name: 'ToDelete' });

			await testDb.category.delete({ where: { id: category.id } });

			const deleted = await testDb.category.findUnique({ where: { id: category.id } });
			expect(deleted).toBeNull();
		});
	});

	describe('Category Hierarchy', () => {
		it('should create category with parent', async () => {
			const parent = await createTestCategory({ name: 'Science' });
			const child = await createTestCategory({
				name: 'Physics',
				parentId: parent.id
			});

			expect(child.parentId).toBe(parent.id);
		});

		it('should get category with parent', async () => {
			const parent = await createTestCategory({ name: 'Technology' });
			const child = await createTestCategory({
				name: 'AI',
				parentId: parent.id
			});

			const childWithParent = await testDb.category.findUnique({
				where: { id: child.id },
				include: { parent: true }
			});

			expect(childWithParent?.parent?.name).toBe('Technology');
		});

		it('should get category with children', async () => {
			const parent = await createTestCategory({ name: 'Sports' });
			await createTestCategory({ name: 'Football', parentId: parent.id });
			await createTestCategory({ name: 'Basketball', parentId: parent.id });
			await createTestCategory({ name: 'Tennis', parentId: parent.id });

			const parentWithChildren = await testDb.category.findUnique({
				where: { id: parent.id },
				include: { children: true }
			});

			expect(parentWithChildren?.children).toHaveLength(3);
		});

		it('should create multi-level hierarchy', async () => {
			const grandparent = await createTestCategory({ name: 'Academic' });
			const parent = await createTestCategory({
				name: 'Natural Sciences',
				parentId: grandparent.id
			});
			const child = await createTestCategory({
				name: 'Biology',
				parentId: parent.id
			});

			const fullTree = await testDb.category.findUnique({
				where: { id: child.id },
				include: {
					parent: {
						include: { parent: true }
					}
				}
			});

			expect(fullTree?.parent?.name).toBe('Natural Sciences');
			expect(fullTree?.parent?.parent?.name).toBe('Academic');
		});
	});

	describe('Category Aliases', () => {
		it('should create alias for category', async () => {
			const category = await createTestCategory({ name: 'Computer Science' });

			const alias = await testDb.categoryAlias.create({
				data: {
					name: 'CS',
					categoryId: category.id
				}
			});

			expect(alias.id).toBeDefined();
			expect(alias.name).toBe('CS');
		});

		it('should enforce unique alias name', async () => {
			const cat1 = await createTestCategory({ name: 'Category1' });
			const cat2 = await createTestCategory({ name: 'Category2' });

			await testDb.categoryAlias.create({
				data: {
					name: 'Alias1',
					categoryId: cat1.id
				}
			});

			// Same alias name for different category should fail
			await expect(
				testDb.categoryAlias.create({
					data: {
						name: 'Alias1',
						categoryId: cat2.id
					}
				})
			).rejects.toThrow();
		});

		it('should get category with aliases', async () => {
			const category = await createTestCategory({ name: 'Artificial Intelligence' });

			await testDb.categoryAlias.createMany({
				data: [
					{ name: 'AI', categoryId: category.id },
					{ name: 'Machine Learning', categoryId: category.id }
				]
			});

			const categoryWithAliases = await testDb.category.findUnique({
				where: { id: category.id },
				include: { aliases: true }
			});

			expect(categoryWithAliases?.aliases).toHaveLength(2);
		});

		it('should cascade delete aliases when category deleted', async () => {
			const category = await createTestCategory({ name: 'ToDeleteWithAliases' });

			const alias = await testDb.categoryAlias.create({
				data: {
					name: 'DeletedAlias',
					categoryId: category.id
				}
			});

			await testDb.category.delete({ where: { id: category.id } });

			const deletedAlias = await testDb.categoryAlias.findUnique({ where: { id: alias.id } });
			expect(deletedAlias).toBeNull();
		});

		it('should find category by alias', async () => {
			const category = await createTestCategory({ name: 'Climate Change' });

			await testDb.categoryAlias.create({
				data: {
					name: 'Global Warming',
					categoryId: category.id
				}
			});

			const alias = await testDb.categoryAlias.findUnique({
				where: { name: 'Global Warming' },
				include: { category: true }
			});

			expect(alias?.category.name).toBe('Climate Change');
		});
	});

	describe('Category Merge Requests', () => {
		it('should create merge request', async () => {
			const user = await createTestUser();
			const fromCategory = await createTestCategory({ name: 'ToMerge' });
			const toCategory = await createTestCategory({ name: 'Target' });

			const mergeRequest = await testDb.categoryMergeRequest.create({
				data: {
					fromCategoryId: fromCategory.id,
					toCategoryId: toCategory.id,
					requestedById: user.id,
					status: 'PENDING'
				}
			});

			expect(mergeRequest.id).toBeDefined();
			expect(mergeRequest.status).toBe('PENDING');
		});

		it('should vote on merge request', async () => {
			const requestor = await createTestUser({ email: 'requestor@test.com' });
			const voter = await createTestUser({ email: 'voter@test.com' });
			const fromCategory = await createTestCategory({ name: 'FromCat' });
			const toCategory = await createTestCategory({ name: 'ToCat' });

			const mergeRequest = await testDb.categoryMergeRequest.create({
				data: {
					fromCategoryId: fromCategory.id,
					toCategoryId: toCategory.id,
					requestedById: requestor.id
				}
			});

			const vote = await testDb.categoryMergeVote.create({
				data: {
					mergeRequestId: mergeRequest.id,
					userId: voter.id,
					value: 1
				}
			});

			expect(vote.id).toBeDefined();
			expect(vote.value).toBe(1);
		});

		it('should enforce unique vote per user per request', async () => {
			const user = await createTestUser();
			const voter = await createTestUser({ email: 'voter@test.com' });
			const fromCategory = await createTestCategory({ name: 'From' });
			const toCategory = await createTestCategory({ name: 'To' });

			const mergeRequest = await testDb.categoryMergeRequest.create({
				data: {
					fromCategoryId: fromCategory.id,
					toCategoryId: toCategory.id,
					requestedById: user.id
				}
			});

			await testDb.categoryMergeVote.create({
				data: {
					mergeRequestId: mergeRequest.id,
					userId: voter.id,
					value: 1
				}
			});

			// Second vote from same user should fail
			await expect(
				testDb.categoryMergeVote.create({
					data: {
						mergeRequestId: mergeRequest.id,
						userId: voter.id,
						value: -1
					}
				})
			).rejects.toThrow();
		});

		it('should update merge request status', async () => {
			const user = await createTestUser();
			const fromCategory = await createTestCategory({ name: 'Pending' });
			const toCategory = await createTestCategory({ name: 'Target2' });

			const mergeRequest = await testDb.categoryMergeRequest.create({
				data: {
					fromCategoryId: fromCategory.id,
					toCategoryId: toCategory.id,
					requestedById: user.id,
					status: 'PENDING'
				}
			});

			const updated = await testDb.categoryMergeRequest.update({
				where: { id: mergeRequest.id },
				data: {
					status: 'APPROVED',
					resolvedAt: new Date()
				}
			});

			expect(updated.status).toBe('APPROVED');
			expect(updated.resolvedAt).not.toBeNull();
		});

		it('should get merge request with votes', async () => {
			const requestor = await createTestUser({ email: 'requestor@test.com' });
			const fromCategory = await createTestCategory({ name: 'MergeFrom' });
			const toCategory = await createTestCategory({ name: 'MergeTo' });

			const mergeRequest = await testDb.categoryMergeRequest.create({
				data: {
					fromCategoryId: fromCategory.id,
					toCategoryId: toCategory.id,
					requestedById: requestor.id
				}
			});

			// Create multiple voters
			const voters = await Promise.all([
				createTestUser({ email: 'v1@test.com' }),
				createTestUser({ email: 'v2@test.com' }),
				createTestUser({ email: 'v3@test.com' })
			]);

			await testDb.categoryMergeVote.createMany({
				data: [
					{ mergeRequestId: mergeRequest.id, userId: voters[0].id, value: 1 },
					{ mergeRequestId: mergeRequest.id, userId: voters[1].id, value: 1 },
					{ mergeRequestId: mergeRequest.id, userId: voters[2].id, value: -1 }
				]
			});

			const requestWithVotes = await testDb.categoryMergeRequest.findUnique({
				where: { id: mergeRequest.id },
				include: { votes: true }
			});

			const approveVotes = requestWithVotes?.votes.filter(v => v.value > 0);
			const rejectVotes = requestWithVotes?.votes.filter(v => v.value < 0);

			expect(requestWithVotes?.votes).toHaveLength(3);
			expect(approveVotes).toHaveLength(2);
			expect(rejectVotes).toHaveLength(1);
		});
	});

	describe('Category with Facts', () => {
		it('should get category with facts', async () => {
			const user = await createTestUser();
			const category = await createTestCategory({ name: 'FactCategory' });

			await createTestFact({ userId: user.id, categoryId: category.id, title: 'Fact 1' });
			await createTestFact({ userId: user.id, categoryId: category.id, title: 'Fact 2' });

			const categoryWithFacts = await testDb.category.findUnique({
				where: { id: category.id },
				include: { facts: true }
			});

			expect(categoryWithFacts?.facts).toHaveLength(2);
		});

		it('should count facts per category', async () => {
			const user = await createTestUser();
			const cat1 = await createTestCategory({ name: 'Category A' });
			const cat2 = await createTestCategory({ name: 'Category B' });

			await createTestFact({ userId: user.id, categoryId: cat1.id });
			await createTestFact({ userId: user.id, categoryId: cat1.id });
			await createTestFact({ userId: user.id, categoryId: cat1.id });
			await createTestFact({ userId: user.id, categoryId: cat2.id });

			const categoriesWithCounts = await testDb.category.findMany({
				include: {
					_count: { select: { facts: true } }
				}
			});

			const catACount = categoriesWithCounts.find(c => c.name === 'Category A')?._count.facts;
			const catBCount = categoriesWithCounts.find(c => c.name === 'Category B')?._count.facts;

			expect(catACount).toBe(3);
			expect(catBCount).toBe(1);
		});
	});

	describe('Category Search', () => {
		it('should search categories by name', async () => {
			await createTestCategory({ name: 'Science Fiction' });
			await createTestCategory({ name: 'Political Science' });
			await createTestCategory({ name: 'Art History' });

			const scienceCategories = await testDb.category.findMany({
				where: {
					name: { contains: 'Science', mode: 'insensitive' }
				}
			});

			expect(scienceCategories).toHaveLength(2);
		});

		it('should search categories by alias', async () => {
			const category = await createTestCategory({ name: 'Machine Learning' });

			await testDb.categoryAlias.createMany({
				data: [
					{ name: 'ML', categoryId: category.id },
					{ name: 'Deep Learning', categoryId: category.id }
				]
			});

			// Find by alias
			const aliases = await testDb.categoryAlias.findMany({
				where: {
					name: { contains: 'Learning', mode: 'insensitive' }
				},
				include: { category: true }
			});

			expect(aliases).toHaveLength(1);
			expect(aliases[0].category.name).toBe('Machine Learning');
		});
	});

	describe('Category Queries', () => {
		it('should get top-level categories (no parent)', async () => {
			const parent1 = await createTestCategory({ name: 'TopLevel1' });
			const parent2 = await createTestCategory({ name: 'TopLevel2' });
			await createTestCategory({ name: 'Child1', parentId: parent1.id });
			await createTestCategory({ name: 'Child2', parentId: parent2.id });

			const topLevel = await testDb.category.findMany({
				where: { parentId: null }
			});

			expect(topLevel.length).toBeGreaterThanOrEqual(2);
			expect(topLevel.some(c => c.name === 'TopLevel1')).toBe(true);
			expect(topLevel.some(c => c.name === 'TopLevel2')).toBe(true);
		});

		it('should get categories created by user', async () => {
			const user1 = await createTestUser({ email: 'user1@test.com' });
			const user2 = await createTestUser({ email: 'user2@test.com' });

			await testDb.category.create({
				data: {
					name: 'User1Category',
					createdByUserId: user1.id
				}
			});

			await testDb.category.create({
				data: {
					name: 'User2Category',
					createdByUserId: user2.id
				}
			});

			const user1Categories = await testDb.category.findMany({
				where: { createdByUserId: user1.id }
			});

			expect(user1Categories).toHaveLength(1);
			expect(user1Categories[0].name).toBe('User1Category');
		});
	});
});
