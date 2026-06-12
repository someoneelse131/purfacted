import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { setupTestDb, truncateAll } from '../helpers/test-db';
import { createTestRedis } from '../helpers/test-redis';
import { seedCategories, seedConfig } from '../../prisma/seed';
import {
	claimReport,
	listActionLog,
	listOpenReports,
	resolveReport,
	submitReport
} from '../../src/lib/server/services/moderation';
import { getFactDetail } from '../../src/lib/server/services/facts/queries';
import { listFeed } from '../../src/lib/server/services/facts/feed';
import { queueDepth } from '../../src/lib/server/services/email/queue';

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
async function makeUser(role: 'VERIFIED' | 'MODERATOR' = 'VERIFIED') {
	counter += 1;
	return prisma.user.create({
		data: {
			username: `m${counter}`,
			email: `m${counter}@example.com`,
			passwordHash: 'x'.repeat(60),
			role,
			emailVerifiedAt: new Date()
		}
	});
}

async function makeFact(authorId: string, status: 'VERIFIED' | 'UNDER_REVIEW' = 'VERIFIED') {
	counter += 1;
	return prisma.fact.create({
		data: {
			title: `Reportable fact ${counter}`,
			body: 'body',
			status,
			authorId,
			categoryId,
			reviewDeadline: new Date(Date.now() + 86_400_000),
			decidedAt: status === 'VERIFIED' ? new Date() : null
		}
	});
}

describe('reporting (R17)', () => {
	it('accepts reports on all target types and dedupes per reporter', async () => {
		const author = await makeUser();
		const reporter = await makeUser();
		const fact = await makeFact(author.id);
		const comment = await prisma.comment.create({
			data: { factId: fact.id, authorId: author.id, body: 'rude comment' }
		});

		const onFact = await submitReport(deps, {
			targetType: 'FACT',
			targetId: fact.id,
			reporterId: reporter.id,
			reason: 'misinformation'
		});
		expect(onFact.ok).toBe(true);
		const onComment = await submitReport(deps, {
			targetType: 'COMMENT',
			targetId: comment.id,
			reporterId: reporter.id,
			reason: 'harassment'
		});
		expect(onComment.ok).toBe(true);
		const onUser = await submitReport(deps, {
			targetType: 'USER',
			targetId: author.id,
			reporterId: reporter.id,
			reason: 'spam'
		});
		expect(onUser.ok).toBe(true);

		const duplicate = await submitReport(deps, {
			targetType: 'FACT',
			targetId: fact.id,
			reporterId: reporter.id,
			reason: 'spam'
		});
		expect(duplicate.ok).toBe(false);

		const badReason = await submitReport(deps, {
			targetType: 'FACT',
			targetId: fact.id,
			reporterId: author.id,
			reason: 'whatever'
		});
		expect(badReason.ok).toBe(false);

		const queue = await listOpenReports(deps);
		expect(queue).toHaveLength(3);
		expect(queue[0].targetPreview).toContain('Reportable fact');
	});

	it('claiming is exclusive and logged', async () => {
		const author = await makeUser();
		const reporter = await makeUser();
		const mod1 = await makeUser('MODERATOR');
		const mod2 = await makeUser('MODERATOR');
		const fact = await makeFact(author.id);
		const report = await submitReport(deps, {
			targetType: 'FACT',
			targetId: fact.id,
			reporterId: reporter.id,
			reason: 'spam'
		});
		if (!report.ok) throw new Error('report failed');

		expect((await claimReport(deps, { reportId: report.data.id, moderatorId: mod1.id })).ok).toBe(
			true
		);
		expect((await claimReport(deps, { reportId: report.data.id, moderatorId: mod2.id })).ok).toBe(
			false
		);

		const log = await listActionLog(deps);
		expect(log[0].action).toBe('claim_report');
		expect(log[0].moderator).toBe(mod1.username);
	});

	it('resolve removed hides the fact everywhere and notifies the reporter', async () => {
		const author = await makeUser();
		const reporter = await makeUser();
		const moderator = await makeUser('MODERATOR');
		const fact = await makeFact(author.id);
		const report = await submitReport(deps, {
			targetType: 'FACT',
			targetId: fact.id,
			reporterId: reporter.id,
			reason: 'misinformation'
		});
		if (!report.ok) throw new Error('report failed');

		const resolved = await resolveReport(deps, {
			reportId: report.data.id,
			moderatorId: moderator.id,
			outcome: 'removed'
		});
		expect(resolved.ok).toBe(true);

		// hidden from detail and feed
		expect(await getFactDetail(deps, fact.id)).toBeNull();
		const feed = await listFeed(deps, { sort: 'newest', page: 1 });
		expect(feed.entries.map((e) => e.id)).not.toContain(fact.id);

		// notification queued, report closed, action logged
		expect((await queueDepth(redis)).ready).toBe(1);
		const stored = await prisma.report.findUniqueOrThrow({ where: { id: report.data.id } });
		expect(stored.status).toBe('RESOLVED');
		expect(stored.resolvedById).toBe(moderator.id);
		const log = await listActionLog(deps);
		expect(log[0].action).toBe('resolve_report_removed');

		// double resolution is rejected
		expect(
			(
				await resolveReport(deps, {
					reportId: report.data.id,
					moderatorId: moderator.id,
					outcome: 'dismissed'
				})
			).ok
		).toBe(false);
	});

	it('dismiss keeps the content and respects notifyEmail=false', async () => {
		const author = await makeUser();
		const reporter = await makeUser();
		await prisma.user.update({ where: { id: reporter.id }, data: { notifyEmail: false } });
		const moderator = await makeUser('MODERATOR');
		const comment = await prisma.comment.create({
			data: {
				factId: (await makeFact(author.id)).id,
				authorId: author.id,
				body: 'fine comment'
			}
		});
		const report = await submitReport(deps, {
			targetType: 'COMMENT',
			targetId: comment.id,
			reporterId: reporter.id,
			reason: 'other',
			detail: 'not sure'
		});
		if (!report.ok) throw new Error('report failed');

		await resolveReport(deps, {
			reportId: report.data.id,
			moderatorId: moderator.id,
			outcome: 'dismissed'
		});
		const stored = await prisma.comment.findUniqueOrThrow({ where: { id: comment.id } });
		expect(stored.deletedAt).toBeNull();
		expect((await queueDepth(redis)).ready).toBe(0); // unsubscribed reporter
	});

	it('removing a reported comment soft-deletes it', async () => {
		const author = await makeUser();
		const reporter = await makeUser();
		const moderator = await makeUser('MODERATOR');
		const comment = await prisma.comment.create({
			data: {
				factId: (await makeFact(author.id)).id,
				authorId: author.id,
				body: 'nasty comment'
			}
		});
		const report = await submitReport(deps, {
			targetType: 'COMMENT',
			targetId: comment.id,
			reporterId: reporter.id,
			reason: 'harassment'
		});
		if (!report.ok) throw new Error('report failed');
		await resolveReport(deps, {
			reportId: report.data.id,
			moderatorId: moderator.id,
			outcome: 'removed'
		});
		const stored = await prisma.comment.findUniqueOrThrow({ where: { id: comment.id } });
		expect(stored.deletedAt).not.toBeNull();
	});
});
