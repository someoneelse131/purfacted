import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Fact, PrismaClient, Role } from '@prisma/client';
import type { Redis } from 'ioredis';
import { setupTestDb, truncateAll } from '../helpers/test-db';
import { createTestRedis } from '../helpers/test-redis';
import { seedCategories, seedConfig } from '../../prisma/seed';
import { findSimilarFacts } from '../../src/lib/server/services/facts/similarity';
import { mergeFacts } from '../../src/lib/server/services/facts/merge';
import { setConfigValue } from '../../src/lib/server/services/config';

let prisma: PrismaClient;
let redis: Redis;
let deps: { prisma: PrismaClient; redis: Redis };
let categoryId: string;

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
	categoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: 'science' } })).id;
});

afterAll(async () => {
	await prisma.$disconnect();
	await redis.quit();
});

let counter = 0;
async function makeUser(role: Role = 'VERIFIED'): Promise<string> {
	counter += 1;
	const user = await prisma.user.create({
		data: {
			username: `dd${counter}`,
			email: `dd${counter}@example.com`,
			passwordHash: 'x'.repeat(60),
			emailVerifiedAt: new Date(),
			role
		}
	});
	return user.id;
}

async function makeFact(title: string, opts?: { duplicateOfId?: string; deleted?: boolean }) {
	const authorId = await makeUser();
	return prisma.fact.create({
		data: {
			title,
			body: 'context',
			authorId,
			categoryId,
			reviewDeadline: new Date(Date.now() + 86_400_000),
			duplicateOfId: opts?.duplicateOfId ?? null,
			deletedAt: opts?.deleted ? new Date() : null
		}
	});
}

async function addSource(factId: string, url: string): Promise<string> {
	const addedById = await makeUser();
	const source = await prisma.source.create({
		data: {
			factId,
			side: 'PRO',
			url,
			title: 'Source',
			type: 'NEWS',
			credibility: 3,
			addedById
		}
	});
	return source.id;
}

describe('similarity ranking (R27)', () => {
	it('ranks similar titles above unrelated ones and respects the threshold', async () => {
		await makeFact('Do vaccines cause autism in children');
		await makeFact('The earth is flat');
		await makeFact('Coffee lowers the risk of type 2 diabetes');

		const matches = await findSimilarFacts(deps, 'vaccines cause autism');
		expect(matches.length).toBeGreaterThanOrEqual(1);
		expect(matches[0].title).toBe('Do vaccines cause autism in children');
		// the unrelated claims fall below the default 0.3 threshold
		expect(matches.map((m) => m.title)).not.toContain('The earth is flat');
		// similarity is a 0-1 score, descending
		expect(matches[0].similarity).toBeGreaterThan(0.3);
	});

	it('excludes merged duplicates and removed facts from candidates', async () => {
		const canonical = await makeFact('Climate change is human-caused');
		await makeFact('Climate change is human caused', { duplicateOfId: canonical.id });
		await makeFact('Climate change is human-driven', { deleted: true });

		const matches = await findSimilarFacts(deps, 'Climate change is human-caused');
		const ids = matches.map((m) => m.id);
		expect(ids).toContain(canonical.id);
		expect(matches.every((m) => m.id === canonical.id)).toBe(true);
	});

	it('returns nothing for a blank or whitespace title', async () => {
		await makeFact('Some existing claim about water');
		expect(await findSimilarFacts(deps, '   ')).toEqual([]);
	});

	it('honors the candidate limit', async () => {
		for (let i = 0; i < 6; i++) await makeFact(`Tea is healthy for the heart number ${i}`);
		await setConfigValue(deps, 'dedup.candidate_limit', '2');
		const matches = await findSimilarFacts(deps, 'Tea is healthy for the heart');
		expect(matches.length).toBe(2);
	});
});

describe('merge service (R27)', () => {
	let moderatorId: string;

	beforeEach(async () => {
		moderatorId = await makeUser('MODERATOR');
	});

	async function freshPair(): Promise<{ canonical: Fact; duplicate: Fact }> {
		const canonical = await makeFact('Original canonical claim');
		const duplicate = await makeFact('Original canonical claim duplicate');
		return { canonical, duplicate };
	}

	it('marks the duplicate, moves a new source and leaves a shared-URL source behind', async () => {
		const { canonical, duplicate } = await freshPair();
		await addSource(canonical.id, 'https://example.com/shared');
		const sharedOnDup = await addSource(duplicate.id, 'https://www.example.com/shared/'); // same normalized URL
		const uniqueOnDup = await addSource(duplicate.id, 'https://example.com/unique');

		const result = await mergeFacts(deps, {
			duplicateId: duplicate.id,
			canonicalId: canonical.id,
			moderatorId
		});
		expect(result).toEqual({ ok: true, canonicalId: canonical.id, movedSources: 1 });

		const moved = await prisma.source.findUniqueOrThrow({ where: { id: uniqueOnDup } });
		expect(moved.factId).toBe(canonical.id);
		const stayed = await prisma.source.findUniqueOrThrow({ where: { id: sharedOnDup } });
		expect(stayed.factId).toBe(duplicate.id);

		const reloaded = await prisma.fact.findUniqueOrThrow({ where: { id: duplicate.id } });
		expect(reloaded.duplicateOfId).toBe(canonical.id);

		const logged = await prisma.moderationAction.findFirst({
			where: { action: 'merge_fact', targetId: duplicate.id }
		});
		expect(logged).not.toBeNull();
	});

	it('is idempotent when re-merging the same pair', async () => {
		const { canonical, duplicate } = await freshPair();
		await addSource(duplicate.id, 'https://example.com/a');
		await mergeFacts(deps, { duplicateId: duplicate.id, canonicalId: canonical.id, moderatorId });
		const second = await mergeFacts(deps, {
			duplicateId: duplicate.id,
			canonicalId: canonical.id,
			moderatorId
		});
		expect(second).toEqual({ ok: true, canonicalId: canonical.id, movedSources: 0 });
		const actions = await prisma.moderationAction.count({
			where: { action: 'merge_fact', targetId: duplicate.id }
		});
		// the no-op second merge does not log again
		expect(actions).toBe(1);
	});

	it('rejects self-merge, chains and non-moderators', async () => {
		const { canonical, duplicate } = await freshPair();

		expect(
			await mergeFacts(deps, { duplicateId: canonical.id, canonicalId: canonical.id, moderatorId })
		).toEqual({ ok: false, error: expect.stringContaining('itself') });

		const verifiedId = await makeUser('VERIFIED');
		expect(
			await mergeFacts(deps, {
				duplicateId: duplicate.id,
				canonicalId: canonical.id,
				moderatorId: verifiedId
			})
		).toEqual({ ok: false, error: expect.stringContaining('moderators') });

		// merge duplicate -> canonical, then try to merge canonical -> duplicate (a chain)
		await mergeFacts(deps, { duplicateId: duplicate.id, canonicalId: canonical.id, moderatorId });
		const chain = await mergeFacts(deps, {
			duplicateId: canonical.id,
			canonicalId: duplicate.id,
			moderatorId
		});
		expect(chain.ok).toBe(false);
	});
});
