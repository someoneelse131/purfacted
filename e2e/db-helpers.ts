import { PrismaClient } from '@prisma/client';

// E2E tests run against the local dev stack; this client talks straight to
// the dev database for fixtures that have no UI (e.g. promoting moderators).
const prisma = new PrismaClient({
	datasourceUrl:
		process.env.DATABASE_URL ?? 'postgresql://purfacted:devpassword@localhost:5432/purfacted'
});

export async function promoteToModerator(username: string): Promise<void> {
	await prisma.user.update({ where: { username }, data: { role: 'MODERATOR' } });
}

export async function promoteToAdmin(username: string): Promise<void> {
	await prisma.user.update({ where: { username }, data: { role: 'ADMIN' } });
}

// Read the activity spine (R25) for a fact - the spine has no UI yet, so E2E
// flows verify it was written by reading the table directly.
export async function activityEventsForFact(
	factId: string
): Promise<{ type: string; actorId: string | null; subjectType: string }[]> {
	return prisma.activityEvent.findMany({
		where: { factId },
		orderBy: { createdAt: 'asc' },
		select: { type: true, actorId: true, subjectType: true }
	});
}

export async function factIdByTitle(title: string): Promise<string> {
	const fact = await prisma.fact.findFirstOrThrow({ where: { title } });
	return fact.id;
}

// Stamp a source's archive snapshot URL (R26) - simulates the fire-and-forget
// archive job completing, so the E2E can assert the "archived copy" link
// renders without depending on a real archive.org round-trip.
export async function setSourceArchiveUrl(factTitle: string, archiveUrl: string): Promise<void> {
	const fact = await prisma.fact.findFirstOrThrow({ where: { title: factTitle } });
	const source = await prisma.source.findFirstOrThrow({ where: { factId: fact.id } });
	await prisma.source.update({ where: { id: source.id }, data: { archiveUrl } });
}

// Add a second PRO source to a fact, stamped with the same createdAt as its
// existing source. This reproduces two activity events on one fact within the
// same second - the case that used to collide the profile's activity {#each}
// key and crash the client-side render with `each_key_duplicate`.
export async function addSameSecondSource(factTitle: string): Promise<void> {
	const fact = await prisma.fact.findFirstOrThrow({ where: { title: factTitle } });
	const existing = await prisma.source.findFirstOrThrow({ where: { factId: fact.id } });
	await prisma.source.create({
		data: {
			factId: fact.id,
			side: 'PRO',
			url: `https://example.org/dup-${Date.now().toString(36)}`,
			title: 'Second source same second',
			type: 'NEWS',
			credibility: 3,
			addedById: existing.addedById,
			createdAt: existing.createdAt
		}
	});
}

// Force a fact into UNSUBSTANTIATED (as if its review window expired).
export async function expireFactByTitle(title: string): Promise<void> {
	await prisma.fact.updateMany({
		where: { title },
		data: { status: 'UNSUBSTANTIATED', decidedAt: new Date() }
	});
}

// Seed a self-contained leaderboard fixture (R28) in a fresh category so the
// assertions are isolated from reputation other specs accumulate on the shared
// dev DB. Creates two users with reputation_events keyed on facts in the new
// category (so the per-category board only sees these two). Returns the
// category slug plus the two usernames.
export async function seedLeaderboardFixture(tag: string): Promise<{
	slug: string;
	leader: string;
	runnerUp: string;
}> {
	const slug = `lb-${tag}`;
	const leader = `lblead_${tag}`;
	const runnerUp = `lbrun_${tag}`;
	const DAY = 86_400_000;

	const category = await prisma.category.create({ data: { name: `LB ${tag}`, slug } });
	const author = await prisma.user.create({
		data: {
			username: `lbauthor_${tag}`,
			email: `lbauthor_${tag}@example.com`,
			passwordHash: 'x'.repeat(60)
		}
	});
	async function makeFact(title: string) {
		return prisma.fact.create({
			data: {
				title,
				body: 'b',
				authorId: author.id,
				categoryId: category.id,
				reviewDeadline: new Date(Date.now() + 14 * DAY)
			}
		});
	}
	const factFresh = await makeFact(`LB fresh ${tag}`);
	const factOld = await makeFact(`LB old ${tag}`);

	const u1 = await prisma.user.create({
		data: { username: leader, email: `${leader}@example.com`, passwordHash: 'x'.repeat(60) }
	});
	const u2 = await prisma.user.create({
		data: { username: runnerUp, email: `${runnerUp}@example.com`, passwordHash: 'x'.repeat(60) }
	});

	// runnerUp earns 40 this week; leader earns 10 this week + 100 long ago.
	// => week board: runnerUp (40) > leader (10); all-time: leader (110) > runnerUp (40)
	await prisma.reputationEvent.createMany({
		data: [
			{ userId: u1.id, action: 'fact_verified', subjectId: factFresh.id, points: 10 },
			{
				userId: u1.id,
				action: 'fact_verified',
				subjectId: factOld.id,
				points: 100,
				createdAt: new Date(Date.now() - 20 * DAY)
			},
			{ userId: u2.id, action: 'fact_verified', subjectId: factFresh.id, points: 40 }
		]
	});

	return { slug, leader, runnerUp };
}

// Drop all rate-limit state (failed-login lockouts etc.) so a spec that
// triggers limits does not starve the specs running after it.
export async function clearRateLimits(): Promise<void> {
	const { Redis } = await import('ioredis');
	const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
	const keys = await redis.keys('ratelimit:*');
	if (keys.length > 0) await redis.del(...keys);
	await redis.quit();
}

// Tune config values for a test (and clear the app's Redis config cache so
// the change is visible immediately). Returns a restore function.
export async function overrideConfig(values: Record<string, string>): Promise<() => Promise<void>> {
	const { Redis } = await import('ioredis');
	const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
	const previous: Record<string, string> = {};
	for (const [key, value] of Object.entries(values)) {
		const row = await prisma.config.findUniqueOrThrow({ where: { key } });
		previous[key] = row.value;
		await prisma.config.update({ where: { key }, data: { value } });
		await redis.del(`config:${key}`);
	}
	return async () => {
		for (const [key, value] of Object.entries(previous)) {
			await prisma.config.update({ where: { key }, data: { value } });
			await redis.del(`config:${key}`);
		}
		await redis.quit();
	};
}
