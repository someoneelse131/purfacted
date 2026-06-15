import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Category, PrismaClient, User } from '@prisma/client';
import type { Redis } from 'ioredis';
import { setupTestDb, truncateAll } from '../helpers/test-db';
import { createTestRedis } from '../helpers/test-redis';
import { seedCategories, seedConfig } from '../../prisma/seed';
import { emitActivity } from '../../src/lib/server/services/activity';
import { followTarget } from '../../src/lib/server/services/follows';
import { getHomeFeed } from '../../src/lib/server/services/home-feed';

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

let counter = 0;
async function makeUser(): Promise<User> {
	counter += 1;
	return prisma.user.create({
		data: {
			username: `hf${counter}`,
			email: `hf${counter}@example.com`,
			passwordHash: 'x'.repeat(60),
			emailVerifiedAt: new Date()
		}
	});
}

async function makeFact(authorId: string, categoryId: string, title: string) {
	return prisma.fact.create({
		data: {
			title,
			body: 'body text for the claim',
			authorId,
			categoryId,
			reviewDeadline: new Date(Date.now() + 14 * 86_400_000)
		}
	});
}

async function category(slug: string): Promise<Category> {
	return prisma.category.findUniqueOrThrow({ where: { slug } });
}

describe('home feed', () => {
	it('shows activity from a followed user but not from an unfollowed one', async () => {
		const viewer = await makeUser();
		const followed = await makeUser();
		const stranger = await makeUser();
		const sci = await category('science');

		const followedFact = await makeFact(followed.id, sci.id, 'Followed authored claim');
		const strangerFact = await makeFact(stranger.id, sci.id, 'Stranger authored claim');

		await emitActivity(deps, {
			type: 'fact_submitted',
			actorId: followed.id,
			subjectType: 'FACT',
			subjectId: followedFact.id,
			factId: followedFact.id,
			categoryId: sci.id
		});
		await emitActivity(deps, {
			type: 'fact_submitted',
			actorId: stranger.id,
			subjectType: 'FACT',
			subjectId: strangerFact.id,
			factId: strangerFact.id,
			categoryId: sci.id
		});

		await followTarget(deps, {
			followerId: viewer.id,
			targetType: 'USER',
			targetId: followed.id
		});

		const feed = await getHomeFeed(deps, { userId: viewer.id });
		expect(feed.tab).toBe('following');
		expect(feed.fellBack).toBe(false);
		expect(feed.items.map((i) => i.factTitle)).toEqual(['Followed authored claim']);
		expect(feed.items[0].actorUsername).toBe(followed.username);
		expect(feed.items[0].summary).toBe('submitted a new claim');
	});

	it('shows status changes in a followed category even without an actor', async () => {
		const viewer = await makeUser();
		const author = await makeUser();
		const sci = await category('science');
		const other = await category('history');

		const inSci = await makeFact(author.id, sci.id, 'Science claim decided');
		const inHist = await makeFact(author.id, other.id, 'History claim decided');

		// system decision events (no actor) - matched purely via categoryId
		await emitActivity(deps, {
			type: 'fact_decided',
			subjectType: 'FACT',
			subjectId: inSci.id,
			factId: inSci.id,
			categoryId: sci.id,
			payload: { status: 'VERIFIED' }
		});
		await emitActivity(deps, {
			type: 'fact_decided',
			subjectType: 'FACT',
			subjectId: inHist.id,
			factId: inHist.id,
			categoryId: other.id,
			payload: { status: 'VERIFIED' }
		});

		await followTarget(deps, {
			followerId: viewer.id,
			targetType: 'CATEGORY',
			targetId: sci.id
		});

		const feed = await getHomeFeed(deps, { userId: viewer.id });
		expect(feed.fellBack).toBe(false);
		expect(feed.items.map((i) => i.factTitle)).toEqual(['Science claim decided']);
		expect(feed.items[0].actorUsername).toBeNull();
		expect(feed.items[0].summary).toBe('was verified');
	});

	it('falls back to global activity when the user follows nothing', async () => {
		const viewer = await makeUser();
		const author = await makeUser();
		const sci = await category('science');
		const fact = await makeFact(author.id, sci.id, 'Some global claim');
		await emitActivity(deps, {
			type: 'fact_submitted',
			actorId: author.id,
			subjectType: 'FACT',
			subjectId: fact.id,
			factId: fact.id,
			categoryId: sci.id
		});

		const feed = await getHomeFeed(deps, { userId: viewer.id });
		expect(feed.tab).toBe('following');
		expect(feed.fellBack).toBe(true);
		expect(feed.items.map((i) => i.factTitle)).toEqual(['Some global claim']);
	});

	it('falls back to global when followed targets have no activity yet', async () => {
		const viewer = await makeUser();
		const followed = await makeUser();
		const author = await makeUser();
		const sci = await category('science');
		const fact = await makeFact(author.id, sci.id, 'Unrelated global claim');
		await emitActivity(deps, {
			type: 'fact_submitted',
			actorId: author.id,
			subjectType: 'FACT',
			subjectId: fact.id,
			factId: fact.id,
			categoryId: sci.id
		});
		// follow someone who has done nothing
		await followTarget(deps, {
			followerId: viewer.id,
			targetType: 'USER',
			targetId: followed.id
		});

		const feed = await getHomeFeed(deps, { userId: viewer.id });
		expect(feed.fellBack).toBe(true);
		expect(feed.items.map((i) => i.factTitle)).toEqual(['Unrelated global claim']);
	});

	it('global tab shows everyone regardless of follows and never marks fallback', async () => {
		const viewer = await makeUser();
		const a = await makeUser();
		const b = await makeUser();
		const sci = await category('science');
		const fa = await makeFact(a.id, sci.id, 'Claim A');
		const fb = await makeFact(b.id, sci.id, 'Claim B');
		for (const [actor, fact] of [
			[a, fa],
			[b, fb]
		] as const) {
			await emitActivity(deps, {
				type: 'fact_submitted',
				actorId: actor.id,
				subjectType: 'FACT',
				subjectId: fact.id,
				factId: fact.id,
				categoryId: sci.id
			});
		}

		const feed = await getHomeFeed(deps, { userId: viewer.id, tab: 'global' });
		expect(feed.tab).toBe('global');
		expect(feed.fellBack).toBe(false);
		expect(feed.items.map((i) => i.factTitle).sort()).toEqual(['Claim A', 'Claim B']);
	});

	it('excludes comment/badge events and soft-deleted facts', async () => {
		const viewer = await makeUser();
		const author = await makeUser();
		const sci = await category('science');
		await followTarget(deps, {
			followerId: viewer.id,
			targetType: 'CATEGORY',
			targetId: sci.id
		});

		const live = await makeFact(author.id, sci.id, 'Live claim');
		const removed = await makeFact(author.id, sci.id, 'Removed claim');
		await prisma.fact.update({ where: { id: removed.id }, data: { deletedAt: new Date() } });

		await emitActivity(deps, {
			type: 'fact_submitted',
			actorId: author.id,
			subjectType: 'FACT',
			subjectId: live.id,
			factId: live.id,
			categoryId: sci.id
		});
		await emitActivity(deps, {
			type: 'fact_submitted',
			actorId: author.id,
			subjectType: 'FACT',
			subjectId: removed.id,
			factId: removed.id,
			categoryId: sci.id
		});
		// a comment event in the same category must not surface in the feed
		await emitActivity(deps, {
			type: 'comment_added',
			actorId: author.id,
			subjectType: 'COMMENT',
			subjectId: 'cmt1',
			factId: live.id,
			categoryId: sci.id
		});

		const feed = await getHomeFeed(deps, { userId: viewer.id });
		expect(feed.items.map((i) => i.factTitle)).toEqual(['Live claim']);
	});
});
