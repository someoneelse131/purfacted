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

		expect(await getCategoryPage(deps, 'does-not-exist')).toBeNull();
	});
});
