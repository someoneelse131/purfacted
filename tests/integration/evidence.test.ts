import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient, Role } from '@prisma/client';
import type { Redis } from 'ioredis';
import { setupTestDb, truncateAll } from '../helpers/test-db';
import { createTestRedis } from '../helpers/test-redis';
import { seedCategories, seedConfig } from '../../prisma/seed';
import { submitFact } from '../../src/lib/server/services/facts/submit';
import {
	addSource,
	flagSource,
	removeSourceAsMisleading,
	voteOnSource
} from '../../src/lib/server/services/facts/evidence';
import type { VotingUser } from '../../src/lib/server/services/vote-weight';

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
async function makeUser(role: Role = 'VERIFIED', reputation = 0): Promise<VotingUser> {
	counter += 1;
	return prisma.user.create({
		data: {
			username: `u${counter}`,
			email: `u${counter}@example.com`,
			passwordHash: 'x'.repeat(60),
			role,
			reputation,
			emailVerifiedAt: new Date()
		}
	});
}

const VALID = {
	title: 'Coffee lowers the risk of type 2 diabetes',
	body: 'Moderate daily consumption assumed.',
	source: {
		url: 'https://pubmed.ncbi.nlm.nih.gov/12345/',
		title: 'Meta-analysis on coffee',
		type: 'PEER_REVIEWED'
	}
};

async function makeFact(authorId: string) {
	const result = await submitFact(deps, { userId: authorId, categoryId, ...VALID });
	if (!result.ok) throw new Error(`submit failed: ${result.error}`);
	return result.fact;
}

describe('fact submission (R10)', () => {
	it('creates an UNDER_REVIEW fact with deadline and starting source', async () => {
		const author = await makeUser();
		const fact = await makeFact(author.id);
		expect(fact.status).toBe('UNDER_REVIEW');
		const expectedDeadline = Date.now() + 14 * 86_400_000;
		expect(Math.abs(fact.reviewDeadline.getTime() - expectedDeadline)).toBeLessThan(60_000);

		const sources = await prisma.source.findMany({ where: { factId: fact.id } });
		expect(sources).toHaveLength(1);
		expect(sources[0].credibility).toBe(5); // PEER_REVIEWED from config
		expect(sources[0].side).toBe('PRO');
	});

	it('validates title, body, url, type and category', async () => {
		const author = await makeUser();
		const base = { userId: author.id, categoryId, ...VALID };

		expect((await submitFact(deps, { ...base, title: 'short' })).ok).toBe(false);
		expect((await submitFact(deps, { ...base, title: 'x'.repeat(201) })).ok).toBe(false);
		expect((await submitFact(deps, { ...base, body: '' })).ok).toBe(false);
		expect((await submitFact(deps, { ...base, body: 'x'.repeat(3001) })).ok).toBe(false);
		expect(
			(await submitFact(deps, { ...base, source: { ...VALID.source, url: 'ftp://x.com' } })).ok
		).toBe(false);
		expect(
			(await submitFact(deps, { ...base, source: { ...VALID.source, type: 'NONSENSE' } })).ok
		).toBe(false);
		expect((await submitFact(deps, { ...base, categoryId: 'nope' })).ok).toBe(false);
	});

	it('enforces the daily submission limit from config', async () => {
		const author = await makeUser();
		for (let i = 0; i < 5; i++) {
			const r = await submitFact(deps, {
				userId: author.id,
				categoryId,
				...VALID,
				title: `${VALID.title} ${i}`
			});
			expect(r.ok).toBe(true);
		}
		const sixth = await submitFact(deps, {
			userId: author.id,
			categoryId,
			...VALID,
			title: `${VALID.title} again`
		});
		expect(sixth.ok).toBe(false);
		if (!sixth.ok) expect(sixth.retryAfterSeconds).toBeGreaterThan(0);
	});
});

describe('evidence system (R11)', () => {
	it('adds PRO and CONTRA sources, rejects duplicates incl. normalized urls', async () => {
		const author = await makeUser();
		const reviewer = await makeUser();
		const fact = await makeFact(author.id);

		const contra = await addSource(deps, {
			factId: fact.id,
			userId: reviewer.id,
			side: 'CONTRA',
			url: 'https://www.reuters.com/health/coffee-study/',
			title: 'Contradicting cohort study',
			type: 'NEWS'
		});
		expect(contra.ok).toBe(true);

		// exact duplicate of the starting source
		const dup = await addSource(deps, {
			factId: fact.id,
			userId: reviewer.id,
			side: 'CONTRA',
			url: VALID.source.url,
			title: 'Same paper again',
			type: 'PEER_REVIEWED'
		});
		expect(dup.ok).toBe(false);
		if (!dup.ok) expect(dup.error).toContain('already on the fact');

		// trailing-slash variant of the reuters url
		const dup2 = await addSource(deps, {
			factId: fact.id,
			userId: reviewer.id,
			side: 'PRO',
			url: 'https://www.reuters.com/health/coffee-study',
			title: 'Same article',
			type: 'NEWS'
		});
		expect(dup2.ok).toBe(false);
	});

	it('only allows evidence while under review', async () => {
		const author = await makeUser();
		const reviewer = await makeUser();
		const fact = await makeFact(author.id);
		await prisma.fact.update({ where: { id: fact.id }, data: { status: 'VERIFIED' } });
		const result = await addSource(deps, {
			factId: fact.id,
			userId: reviewer.id,
			side: 'CONTRA',
			url: 'https://example.org/x',
			title: 'Too late',
			type: 'OTHER'
		});
		expect(result.ok).toBe(false);
	});

	it('votes snapshot the weight at vote time (expert 3.0)', async () => {
		const author = await makeUser();
		const fact = await makeFact(author.id);
		const source = await prisma.source.findFirstOrThrow({ where: { factId: fact.id } });

		const expert = await makeUser('EXPERT');
		await prisma.expertCategory.create({ data: { userId: expert.id, categoryId } });

		const vote = await voteOnSource(deps, { sourceId: source.id, user: expert, value: 1 });
		expect(vote.ok).toBe(true);
		if (vote.ok) expect(vote.data.weight).toBe(3);

		const stored = await prisma.sourceVote.findUniqueOrThrow({
			where: { sourceId_userId: { sourceId: source.id, userId: expert.id } }
		});
		expect(stored.weight).toBe(3);
		expect(stored.value).toBe(1);

		// changing the vote keeps one row and re-snapshots
		await prisma.user.update({ where: { id: expert.id }, data: { reputation: 200 } });
		const changed = await voteOnSource(deps, {
			sourceId: source.id,
			user: { ...expert, reputation: 200 },
			value: -1
		});
		expect(changed.ok).toBe(true);
		if (changed.ok) expect(changed.data.weight).toBe(4.5);
		expect(await prisma.sourceVote.count({ where: { sourceId: source.id } })).toBe(1);
	});

	it('blocks the author, unverified users and votes on decided facts', async () => {
		const author = await makeUser();
		const fact = await makeFact(author.id);
		const source = await prisma.source.findFirstOrThrow({ where: { factId: fact.id } });

		const own = await voteOnSource(deps, { sourceId: source.id, user: author, value: 1 });
		expect(own.ok).toBe(false);
		if (!own.ok) expect(own.error).toContain('your own fact');

		const unverified = await prisma.user.create({
			data: {
				username: 'fresh',
				email: 'fresh@example.com',
				passwordHash: 'x'.repeat(60)
			}
		});
		expect((await voteOnSource(deps, { sourceId: source.id, user: unverified, value: 1 })).ok).toBe(
			false
		);

		await prisma.fact.update({ where: { id: fact.id }, data: { status: 'VERIFIED' } });
		const reviewer = await makeUser();
		expect((await voteOnSource(deps, { sourceId: source.id, user: reviewer, value: 1 })).ok).toBe(
			false
		);
	});

	it('flags create one open report per user, removal costs -3 reputation', async () => {
		const author = await makeUser();
		const reviewer = await makeUser();
		const fact = await makeFact(author.id);
		const source = await prisma.source.findFirstOrThrow({ where: { factId: fact.id } });

		const flag = await flagSource(deps, {
			sourceId: source.id,
			userId: reviewer.id,
			reason: 'misleading abstract'
		});
		expect(flag.ok).toBe(true);
		const again = await flagSource(deps, {
			sourceId: source.id,
			userId: reviewer.id,
			reason: 'still misleading'
		});
		expect(again.ok).toBe(false);
		expect(await prisma.report.count({ where: { targetId: source.id } })).toBe(1);

		const removed = await removeSourceAsMisleading(deps, { sourceId: source.id });
		expect(removed.ok).toBe(true);
		const updatedSource = await prisma.source.findUniqueOrThrow({ where: { id: source.id } });
		expect(updatedSource.status).toBe('REMOVED');
		const updatedAuthor = await prisma.user.findUniqueOrThrow({ where: { id: author.id } });
		expect(updatedAuthor.reputation).toBe(-3);
	});
});
