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
	normalizeUrl,
	removeSourceAsMisleading,
	voteOnSource
} from '../../src/lib/server/services/facts/evidence';
import { setConfigValue } from '../../src/lib/server/services/config';
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
			// established account (30d old) so probation never applies here
			createdAt: new Date(Date.now() - 30 * 86_400_000),
			emailVerifiedAt: new Date()
		}
	});
}

// a valid R26 quote (20-500 chars), reused across the source fixtures
const QUOTE = 'The abstract states a 0.7 relative risk across the pooled cohorts.';

const VALID = {
	title: 'Coffee lowers the risk of type 2 diabetes',
	body: 'Moderate daily consumption assumed.',
	source: {
		url: 'https://pubmed.ncbi.nlm.nih.gov/12345/',
		title: 'Meta-analysis on coffee',
		type: 'PEER_REVIEWED',
		quote: QUOTE
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

	it('rejects unverified authors at the service level', async () => {
		const unverified = await prisma.user.create({
			data: {
				username: 'unverified-author',
				email: 'unverified-author@example.com',
				passwordHash: 'x'.repeat(60)
			}
		});
		const result = await submitFact(deps, { userId: unverified.id, categoryId, ...VALID });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('Verify your email');
	});

	it('reads the title minimum from config', async () => {
		const author = await makeUser();
		await setConfigValue(deps, 'facts.title_min', '3');
		const short = await submitFact(deps, {
			userId: author.id,
			categoryId,
			...VALID,
			title: 'short'
		});
		expect(short.ok).toBe(true);
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
			type: 'NEWS',
			quote: 'Cited passage establishing the claim across the pooled study cohorts.'
		});
		expect(contra.ok).toBe(true);

		// exact duplicate of the starting source
		const dup = await addSource(deps, {
			factId: fact.id,
			userId: reviewer.id,
			side: 'CONTRA',
			url: VALID.source.url,
			title: 'Same paper again',
			type: 'PEER_REVIEWED',
			quote: 'Cited passage establishing the claim across the pooled study cohorts.'
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
			type: 'NEWS',
			quote: 'Cited passage establishing the claim across the pooled study cohorts.'
		});
		expect(dup2.ok).toBe(false);

		// scheme/www/default-port/fragment variants must not bypass the check
		for (const variant of [
			'http://reuters.com/health/coffee-study',
			'https://reuters.com:443/health/coffee-study/',
			'http://WWW.Reuters.com:80/health/coffee-study#conclusion'
		]) {
			const bypass = await addSource(deps, {
				factId: fact.id,
				userId: reviewer.id,
				side: 'PRO',
				url: variant,
				title: 'Same article, different spelling',
				type: 'NEWS',
				quote: 'Cited passage establishing the claim across the pooled study cohorts.'
			});
			expect(bypass.ok).toBe(false);
		}
	});

	it('normalizeUrl unifies scheme, www, default ports, slashes and fragments', () => {
		const canonical = 'https://example.org/a/b?q=1';
		for (const variant of [
			'https://example.org/a/b?q=1',
			'http://example.org/a/b?q=1',
			'https://www.example.org/a/b?q=1',
			'https://EXAMPLE.org:443/a/b?q=1',
			'http://example.org:80/a/b/?q=1#frag'
		]) {
			expect(normalizeUrl(variant)).toBe(canonical);
		}
		// non-default ports and different paths stay distinct
		expect(normalizeUrl('https://example.org:8443/a/b?q=1')).not.toBe(canonical);
		expect(normalizeUrl('https://example.org/a/c?q=1')).not.toBe(canonical);
	});

	it('REMOVED sources still count as duplicates (no instant re-adding of junk)', async () => {
		const author = await makeUser();
		const reviewer = await makeUser();
		const fact = await makeFact(author.id);
		const source = await prisma.source.findFirstOrThrow({ where: { factId: fact.id } });
		await removeSourceAsMisleading(deps, { sourceId: source.id });

		const readd = await addSource(deps, {
			factId: fact.id,
			userId: reviewer.id,
			side: 'PRO',
			url: source.url,
			title: 'Same junk again',
			type: 'NEWS',
			quote: 'Cited passage establishing the claim across the pooled study cohorts.'
		});
		expect(readd.ok).toBe(false);
		if (!readd.ok) expect(readd.error).toContain('removed');
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
			type: 'OTHER',
			quote: 'Cited passage establishing the claim across the pooled study cohorts.'
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

		// flags route through submitReport: whitelisted reason, free text in detail
		const report = await prisma.report.findFirstOrThrow({ where: { targetId: source.id } });
		expect(report.reason).toBe('misinformation');
		expect(report.detail).toBe('misleading abstract');

		const removed = await removeSourceAsMisleading(deps, { sourceId: source.id });
		expect(removed.ok).toBe(true);
		const updatedSource = await prisma.source.findUniqueOrThrow({ where: { id: source.id } });
		expect(updatedSource.status).toBe('REMOVED');
		const updatedAuthor = await prisma.user.findUniqueOrThrow({ where: { id: author.id } });
		expect(updatedAuthor.reputation).toBe(-3);
	});

	it('flags respect the daily report limit', async () => {
		await setConfigValue(deps, 'moderation.report_max_per_day', '1');
		const author = await makeUser();
		const reviewer = await makeUser();
		const fact = await makeFact(author.id);
		const second = await addSource(deps, {
			factId: fact.id,
			userId: author.id,
			side: 'CONTRA',
			url: 'https://example.org/second-source',
			title: 'Second source',
			type: 'NEWS',
			quote: 'Cited passage establishing the claim across the pooled study cohorts.'
		});
		if (!second.ok) throw new Error(second.error);
		const sources = await prisma.source.findMany({ where: { factId: fact.id } });

		const first = await flagSource(deps, {
			sourceId: sources[0].id,
			userId: reviewer.id,
			reason: 'spammy link'
		});
		expect(first.ok).toBe(true);
		const limited = await flagSource(deps, {
			sourceId: sources[1].id,
			userId: reviewer.id,
			reason: 'also spammy'
		});
		expect(limited.ok).toBe(false);
		if (!limited.ok) expect(limited.error).toContain('limit');
	});

	it('voting returns the factId of the source (not the page fact)', async () => {
		const author = await makeUser();
		const reviewer = await makeUser();
		const fact = await makeFact(author.id);
		const source = await prisma.source.findFirstOrThrow({ where: { factId: fact.id } });
		const vote = await voteOnSource(deps, { sourceId: source.id, user: reviewer, value: 1 });
		expect(vote.ok).toBe(true);
		if (vote.ok) expect(vote.data.factId).toBe(fact.id);
	});
});

describe('soft-deleted facts are inert (R17)', () => {
	it('rejects new sources and votes on removed facts', async () => {
		const author = await makeUser();
		const reviewer = await makeUser();
		const fact = await makeFact(author.id);
		const source = await prisma.source.findFirstOrThrow({ where: { factId: fact.id } });
		await prisma.fact.update({ where: { id: fact.id }, data: { deletedAt: new Date() } });

		const add = await addSource(deps, {
			factId: fact.id,
			userId: reviewer.id,
			side: 'CONTRA',
			url: 'https://example.org/too-late',
			title: 'Too late',
			type: 'NEWS',
			quote: 'Cited passage establishing the claim across the pooled study cohorts.'
		});
		expect(add.ok).toBe(false);
		if (!add.ok) expect(add.error).toContain('not found');

		const vote = await voteOnSource(deps, { sourceId: source.id, user: reviewer, value: 1 });
		expect(vote.ok).toBe(false);
		if (!vote.ok) expect(vote.error).toContain('not found');
	});
});

describe('revival of UNSUBSTANTIATED facts (R13)', () => {
	it('new evidence revives exactly once via an atomic claim', async () => {
		const author = await makeUser();
		const reviewer = await makeUser();
		const fact = await makeFact(author.id);
		await prisma.fact.update({
			where: { id: fact.id },
			data: { status: 'UNSUBSTANTIATED', decidedAt: new Date() }
		});

		const revive = await addSource(deps, {
			factId: fact.id,
			userId: reviewer.id,
			side: 'PRO',
			url: 'https://example.org/new-evidence',
			title: 'New evidence',
			type: 'NEWS',
			quote: 'Cited passage establishing the claim across the pooled study cohorts.'
		});
		expect(revive.ok).toBe(true);
		const revived = await prisma.fact.findUniqueOrThrow({ where: { id: fact.id } });
		expect(revived.status).toBe('UNDER_REVIEW');
		expect(revived.revivedAt).not.toBeNull();
		expect(revived.decidedAt).toBeNull();

		// once consumed, a second revival is impossible
		await prisma.fact.update({
			where: { id: fact.id },
			data: { status: 'UNSUBSTANTIATED' }
		});
		const second = await addSource(deps, {
			factId: fact.id,
			userId: reviewer.id,
			side: 'PRO',
			url: 'https://example.org/yet-another',
			title: 'Yet another',
			type: 'NEWS',
			quote: 'Cited passage establishing the claim across the pooled study cohorts.'
		});
		expect(second.ok).toBe(false);
	});
});

describe('service-level caller checks (defense in depth)', () => {
	it('addSource rejects unverified, banned and deleted callers', async () => {
		const author = await makeUser();
		const fact = await makeFact(author.id);
		const input = (userId: string) => ({
			factId: fact.id,
			userId,
			side: 'CONTRA' as const,
			url: 'https://example.org/blocked-caller',
			title: 'Blocked caller',
			type: 'NEWS',
			quote: 'Cited passage establishing the claim across the pooled study cohorts.'
		});

		const unverified = await prisma.user.create({
			data: { username: 'unv1', email: 'unv1@example.com', passwordHash: 'x'.repeat(60) }
		});
		expect((await addSource(deps, input(unverified.id))).ok).toBe(false);

		const banned = await makeUser();
		await prisma.user.update({
			where: { id: banned.id },
			data: { bannedUntil: new Date(Date.now() + 86_400_000) }
		});
		expect((await addSource(deps, input(banned.id))).ok).toBe(false);

		const deleted = await makeUser();
		await prisma.user.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });
		expect((await addSource(deps, input(deleted.id))).ok).toBe(false);
	});
});

describe('source quote & archiving (R26)', () => {
	it('requires a quote of valid length on a new source', async () => {
		const author = await makeUser();
		const reviewer = await makeUser();
		const fact = await makeFact(author.id);
		const base = {
			factId: fact.id,
			userId: reviewer.id,
			side: 'CONTRA' as const,
			url: 'https://example.org/quote-check',
			title: 'A source needing a quote',
			type: 'NEWS' as const
		};

		const tooShort = await addSource(deps, { ...base, quote: 'too short' });
		expect(tooShort.ok).toBe(false);
		if (!tooShort.ok) expect(tooShort.error).toMatch(/20-500/);

		const tooLong = await addSource(deps, { ...base, quote: 'x'.repeat(501) });
		expect(tooLong.ok).toBe(false);

		const valid = await addSource(deps, {
			...base,
			quote: 'This paragraph of the source directly contradicts the claim with data.'
		});
		expect(valid.ok).toBe(true);
		if (valid.ok) {
			const stored = await prisma.source.findUniqueOrThrow({ where: { id: valid.data.id } });
			expect(stored.quote).toBe(
				'This paragraph of the source directly contradicts the claim with data.'
			);
		}
	});

	it('the starting source stores its quote and the limits come from config', async () => {
		const author = await makeUser();
		const fact = await makeFact(author.id);
		const starting = await prisma.source.findFirstOrThrow({ where: { factId: fact.id } });
		expect(starting.quote).toBe(QUOTE);

		// raising the minimum makes a previously-valid quote too short
		await setConfigValue(deps, 'sources.quote_min', '200');
		const reviewer = await makeUser();
		const rejected = await addSource(deps, {
			factId: fact.id,
			userId: reviewer.id,
			side: 'CONTRA',
			url: 'https://example.org/config-quote',
			title: 'Quote too short now',
			type: 'NEWS',
			quote: QUOTE
		});
		expect(rejected.ok).toBe(false);
	});

	it('enqueues an archive job when the flag is on, skips when off', async () => {
		const author = await makeUser();
		const reviewer = await makeUser();
		const fact = await makeFact(author.id);

		// flag on (default): adding a source queues a snapshot
		await redis.del('archive:queue');
		const added = await addSource(deps, {
			factId: fact.id,
			userId: reviewer.id,
			side: 'CONTRA',
			url: 'https://example.org/archive-on',
			title: 'Archived source',
			type: 'NEWS',
			quote: 'A clear justification of how this source supports the contra side.'
		});
		expect(added.ok).toBe(true);
		expect(await redis.llen('archive:queue')).toBe(1);

		// flag off: no snapshot queued
		await setConfigValue(deps, 'sources.archive_enabled', 'false');
		await redis.del('archive:queue');
		const added2 = await addSource(deps, {
			factId: fact.id,
			userId: reviewer.id,
			side: 'PRO',
			url: 'https://example.org/archive-off',
			title: 'Unarchived source',
			type: 'NEWS',
			quote: 'A clear justification of how this source supports the pro side.'
		});
		expect(added2.ok).toBe(true);
		expect(await redis.llen('archive:queue')).toBe(0);
	});
});
