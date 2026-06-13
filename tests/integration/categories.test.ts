import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { setupTestDb, truncateAll } from '../helpers/test-db';
import { createTestRedis } from '../helpers/test-redis';
import { seedCategories, seedConfig, CATEGORY_SEED } from '../../prisma/seed';
import {
	createCategory,
	getCategoryPage,
	getCategoryTree,
	listProposals,
	moveCategory,
	proposeCategory,
	renameCategory,
	resolveProposal,
	setCategoryStatus
} from '../../src/lib/server/services/categories';
import { setConfigValue } from '../../src/lib/server/services/config';

let prisma: PrismaClient;
let redis: Redis;
let deps: { prisma: PrismaClient; redis: Redis };

beforeAll(async () => {
	prisma = await setupTestDb();
	redis = createTestRedis();
	deps = { prisma, redis };
}, 120_000);

beforeEach(async () => {
	await truncateAll(prisma);
	await redis.flushdb();
	await seedConfig(prisma);
	await seedCategories(prisma);
});

afterAll(async () => {
	await prisma.$disconnect();
	await redis.quit();
});

async function makeUser(username = 'alice'): Promise<string> {
	const user = await prisma.user.create({
		data: {
			username,
			email: `${username}@example.com`,
			passwordHash: 'x'.repeat(60),
			emailVerifiedAt: new Date()
		}
	});
	return user.id;
}

describe('category tree (R8)', () => {
	it('seeds ~15 top categories and is idempotent', async () => {
		expect(await prisma.category.count()).toBe(CATEGORY_SEED.length);
		await seedCategories(prisma);
		expect(await prisma.category.count()).toBe(CATEGORY_SEED.length);
	});

	it('returns the active tree with children', async () => {
		const science = await prisma.category.findUniqueOrThrow({ where: { slug: 'science' } });
		await createCategory(deps, { name: 'Physics', parentId: science.id });
		const tree = await getCategoryTree(deps);
		const top = tree.find((t) => t.slug === 'science');
		expect(top?.children.map((c) => c.slug)).toContain('physics');
		// disabled categories disappear
		const physics = await prisma.category.findUniqueOrThrow({ where: { slug: 'physics' } });
		await setCategoryStatus(deps, { categoryId: physics.id, status: 'DISABLED' });
		const tree2 = await getCategoryTree(deps);
		expect(tree2.find((t) => t.slug === 'science')?.children).toHaveLength(0);
	});

	it('enforces max depth 2 on create and move', async () => {
		const science = await prisma.category.findUniqueOrThrow({ where: { slug: 'science' } });
		const physics = await createCategory(deps, { name: 'Physics', parentId: science.id });
		if (!physics.ok) throw new Error('create failed');

		const tooDeep = await createCategory(deps, {
			name: 'Quantum',
			parentId: physics.category.id
		});
		expect(tooDeep.ok).toBe(false);

		// moving a category with children under a parent would exceed depth
		const history = await prisma.category.findUniqueOrThrow({ where: { slug: 'history' } });
		const moved = await moveCategory(deps, {
			categoryId: science.id,
			parentId: history.id
		});
		expect(moved.ok).toBe(false);

		// moving a leaf under a top category is fine
		const sports = await prisma.category.findUniqueOrThrow({ where: { slug: 'sports' } });
		const ok = await moveCategory(deps, { categoryId: sports.id, parentId: history.id });
		expect(ok.ok).toBe(true);
	});

	it('rejects duplicate names via slug collision and renames cleanly', async () => {
		const dup = await createCategory(deps, { name: 'Science', parentId: null });
		expect(dup.ok).toBe(false);

		const science = await prisma.category.findUniqueOrThrow({ where: { slug: 'science' } });
		const renamed = await renameCategory(deps, {
			categoryId: science.id,
			name: 'Natural Sciences'
		});
		expect(renamed.ok).toBe(true);
		if (renamed.ok) expect(renamed.category.slug).toBe('science'); // slug stays stable
	});

	it('rename rejects case-insensitive collisions with existing categories', async () => {
		const sports = await prisma.category.findUniqueOrThrow({ where: { slug: 'sports' } });
		const clash = await renameCategory(deps, { categoryId: sports.id, name: 'sCiEnCe' });
		expect(clash.ok).toBe(false);
		if (!clash.ok) expect(clash.error).toContain('already exists');
		// renaming to its own name (case change only) is allowed
		const own = await renameCategory(deps, { categoryId: sports.id, name: 'SPORTS' });
		expect(own.ok).toBe(true);
	});

	it('returns friendly errors instead of throwing on unknown ids', async () => {
		expect(await renameCategory(deps, { categoryId: 'nope', name: 'Whatever' })).toEqual({
			ok: false,
			error: 'Category not found.'
		});
		expect(await moveCategory(deps, { categoryId: 'nope', parentId: null })).toEqual({
			ok: false,
			error: 'Category not found.'
		});
		expect(await setCategoryStatus(deps, { categoryId: 'nope', status: 'DISABLED' })).toEqual({
			ok: false,
			error: 'Category not found.'
		});
	});
});

describe('category proposals (R8)', () => {
	it('runs propose -> approve and the category goes live', async () => {
		const userId = await makeUser();
		const proposal = await proposeCategory(deps, {
			name: 'Cryptozoology',
			parentId: null,
			userId
		});
		expect(proposal.ok).toBe(true);
		if (!proposal.ok) return;

		// proposed categories are not in the public tree yet
		expect((await getCategoryTree(deps)).find((t) => t.slug === 'cryptozoology')).toBeUndefined();

		const proposals = await listProposals(deps);
		expect(proposals.map((p) => p.id)).toContain(proposal.category.id);

		const resolved = await resolveProposal(deps, {
			categoryId: proposal.category.id,
			approve: true
		});
		expect(resolved.ok).toBe(true);
		expect((await getCategoryTree(deps)).find((t) => t.slug === 'cryptozoology')).toBeDefined();
	});

	it('rejection keeps the category out of the tree and re-resolving fails', async () => {
		const userId = await makeUser();
		const proposal = await proposeCategory(deps, { name: 'Astrology', parentId: null, userId });
		if (!proposal.ok) throw new Error('propose failed');
		await resolveProposal(deps, { categoryId: proposal.category.id, approve: false });
		expect((await getCategoryTree(deps)).find((t) => t.slug === 'astrology')).toBeUndefined();
		const again = await resolveProposal(deps, {
			categoryId: proposal.category.id,
			approve: true
		});
		expect(again.ok).toBe(false);
	});

	it('a rejected proposal does not squat its name forever', async () => {
		const userId = await makeUser();
		const proposal = await proposeCategory(deps, { name: 'Astrology', parentId: null, userId });
		if (!proposal.ok) throw new Error('propose failed');
		await resolveProposal(deps, { categoryId: proposal.category.id, approve: false });

		// the same name can be proposed (and created) again
		const second = await proposeCategory(deps, { name: 'Astrology', parentId: null, userId });
		expect(second.ok).toBe(true);
		if (!second.ok) return;
		expect(second.category.slug).toBe('astrology');
		// the rejected row got a tombstone slug
		const rejected = await prisma.category.findUniqueOrThrow({
			where: { id: proposal.category.id }
		});
		expect(rejected.slug).not.toBe('astrology');
	});

	it('rate-limits proposals per user per day from config', async () => {
		await setConfigValue(deps, 'categories.propose_max_per_day', '2');
		const userId = await makeUser();
		for (let i = 0; i < 2; i++) {
			const ok = await proposeCategory(deps, { name: `Proposal ${i}`, parentId: null, userId });
			expect(ok.ok).toBe(true);
		}
		const third = await proposeCategory(deps, { name: 'Proposal 2', parentId: null, userId });
		expect(third.ok).toBe(false);
		if (!third.ok) expect(third.error).toContain('limit');
		// invalid attempts never consume the budget (duplicate name fails first)
		const otherUser = await makeUser('bob');
		await setConfigValue(deps, 'categories.propose_max_per_day', '1');
		const invalid = await proposeCategory(deps, {
			name: 'Science',
			parentId: null,
			userId: otherUser
		});
		expect(invalid.ok).toBe(false);
		const valid = await proposeCategory(deps, {
			name: 'Numerology',
			parentId: null,
			userId: otherUser
		});
		expect(valid.ok).toBe(true);
	});

	it('approval re-validates the parent at resolve time', async () => {
		const userId = await makeUser();
		const science = await prisma.category.findUniqueOrThrow({ where: { slug: 'science' } });
		const proposal = await proposeCategory(deps, {
			name: 'Particle Physics',
			parentId: science.id,
			userId
		});
		if (!proposal.ok) throw new Error('propose failed');

		// the parent gets disabled before a moderator approves
		await setCategoryStatus(deps, { categoryId: science.id, status: 'DISABLED' });
		const approved = await resolveProposal(deps, {
			categoryId: proposal.category.id,
			approve: true
		});
		expect(approved.ok).toBe(false);
		if (!approved.ok) expect(approved.error).toContain('Cannot approve');
		// the proposal stays open for a later decision
		const stored = await prisma.category.findUniqueOrThrow({
			where: { id: proposal.category.id }
		});
		expect(stored.status).toBe('PROPOSED');
		// rejecting still works
		const rejected = await resolveProposal(deps, {
			categoryId: proposal.category.id,
			approve: false
		});
		expect(rejected.ok).toBe(true);
	});
});

describe('category page (R8)', () => {
	it('lists facts from the category and its children', async () => {
		const userId = await makeUser();
		const science = await prisma.category.findUniqueOrThrow({ where: { slug: 'science' } });
		const physics = await createCategory(deps, { name: 'Physics', parentId: science.id });
		if (!physics.ok) throw new Error('create failed');

		const mkFact = (title: string, categoryId: string) =>
			prisma.fact.create({
				data: {
					title,
					body: 'body',
					authorId: userId,
					categoryId,
					reviewDeadline: new Date(Date.now() + 14 * 86_400_000)
				}
			});
		await mkFact('Top-level fact', science.id);
		await mkFact('Child fact', physics.category.id);
		await mkFact(
			'Unrelated fact',
			(await prisma.category.findUniqueOrThrow({ where: { slug: 'sports' } })).id
		);

		const page = await getCategoryPage(deps, 'science');
		expect(page?.facts.map((f) => f.title).sort()).toEqual(['Child fact', 'Top-level fact']);
		expect(page?.children.map((c) => c.slug)).toContain('physics');
		expect(page?.total).toBe(2);
		expect(page?.totalPages).toBe(1);

		expect(await getCategoryPage(deps, 'does-not-exist')).toBeNull();
	});

	it('paginates facts with the page size from config', async () => {
		await setConfigValue(deps, 'categories.page_size', '2');
		const userId = await makeUser();
		const science = await prisma.category.findUniqueOrThrow({ where: { slug: 'science' } });
		for (let i = 0; i < 3; i++) {
			await prisma.fact.create({
				data: {
					title: `Paged fact ${i}`,
					body: 'body',
					authorId: userId,
					categoryId: science.id,
					reviewDeadline: new Date(Date.now() + 14 * 86_400_000)
				}
			});
		}
		const page1 = await getCategoryPage(deps, 'science', 1);
		expect(page1?.facts).toHaveLength(2);
		expect(page1?.total).toBe(3);
		expect(page1?.totalPages).toBe(2);
		const page2 = await getCategoryPage(deps, 'science', 2);
		expect(page2?.facts).toHaveLength(1);
	});
});
