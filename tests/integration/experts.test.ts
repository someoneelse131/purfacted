import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PrismaClient, User } from '@prisma/client';
import type { Redis } from 'ioredis';
import { setupTestDb, truncateAll } from '../helpers/test-db';
import { createTestRedis } from '../helpers/test-redis';
import { seedCategories, seedConfig } from '../../prisma/seed';
import {
	applyForExpert,
	listExpertApplications,
	getCredentialFile,
	reviewExpertApplication,
	revokeExpert
} from '../../src/lib/server/services/experts';
import { getVoteWeight, type VotingUser } from '../../src/lib/server/services/vote-weight';

let prisma: PrismaClient;
let redis: Redis;
let deps: { prisma: PrismaClient; redis: Redis };
let scienceId: string;
let politicsId: string;

beforeAll(async () => {
	prisma = await setupTestDb();
	redis = createTestRedis();
	deps = { prisma, redis };
	process.env.EXPERT_UPLOAD_DIR = await mkdtemp(join(tmpdir(), 'purfacted-cred-'));
}, 120_000);

beforeEach(async () => {
	await truncateAll(prisma);
	await redis.flushdb();
	await seedConfig(prisma);
	await seedCategories(prisma);
	scienceId = (await prisma.category.findUniqueOrThrow({ where: { slug: 'science' } })).id;
	politicsId = (await prisma.category.findUniqueOrThrow({ where: { slug: 'politics' } })).id;
});

afterAll(async () => {
	await prisma.$disconnect();
	await redis.quit();
});

let counter = 0;
async function makeUser(overrides: { role?: User['role'] } = {}): Promise<User> {
	counter += 1;
	return prisma.user.create({
		data: {
			username: `ex${counter}`,
			email: `ex${counter}@example.com`,
			passwordHash: 'x'.repeat(60),
			emailVerifiedAt: new Date(),
			...overrides
		}
	});
}

const pdf = { bytes: Buffer.from('%PDF-1.4 fake'), mime: 'application/pdf' };

function votingUser(u: User): VotingUser {
	return {
		id: u.id,
		role: u.role,
		reputation: u.reputation,
		emailVerifiedAt: u.emailVerifiedAt,
		bannedUntil: u.bannedUntil,
		deletedAt: u.deletedAt,
		createdAt: u.createdAt
	};
}

describe('applyForExpert', () => {
	it('creates a PENDING application and writes the credential outside the web root', async () => {
		const user = await makeUser();
		const result = await applyForExpert(deps, {
			userId: user.id,
			field: 'Climate science',
			categoryIds: [scienceId],
			credential: pdf
		});
		expect(result.ok).toBe(true);
		const app = await prisma.expertApplication.findFirstOrThrow({ where: { userId: user.id } });
		expect(app.status).toBe('PENDING');
		expect(app.requestedCategoryIds).toEqual([scienceId]);
		// the file lives under the configured upload dir, not in static/
		const files = await readdir(process.env.EXPERT_UPLOAD_DIR as string);
		expect(files).toContain(app.credentialFile);
		expect(app.credentialFile).not.toContain('/');
	});

	it('rejects a second pending application', async () => {
		const user = await makeUser();
		await applyForExpert(deps, {
			userId: user.id,
			field: 'Field one',
			categoryIds: [scienceId],
			credential: pdf
		});
		const second = await applyForExpert(deps, {
			userId: user.id,
			field: 'Field two',
			categoryIds: [politicsId],
			credential: pdf
		});
		expect(second.ok).toBe(false);
	});

	it('rejects an empty category list and an invalid mime', async () => {
		const user = await makeUser();
		expect(
			(
				await applyForExpert(deps, {
					userId: user.id,
					field: 'X field',
					categoryIds: [],
					credential: pdf
				})
			).ok
		).toBe(false);
		expect(
			(
				await applyForExpert(deps, {
					userId: user.id,
					field: 'X field',
					categoryIds: [scienceId],
					credential: { bytes: Buffer.from('<html>'), mime: 'text/html' }
				})
			).ok
		).toBe(false);
	});
});

describe('reviewExpertApplication', () => {
	it('approval flips the role, grants the categories + badge, and is reflected in vote weight', async () => {
		const user = await makeUser();
		const mod = await makeUser({ role: 'MODERATOR' });
		await applyForExpert(deps, {
			userId: user.id,
			field: 'Epidemiology',
			categoryIds: [scienceId],
			credential: pdf
		});
		const app = await prisma.expertApplication.findFirstOrThrow({ where: { userId: user.id } });

		const result = await reviewExpertApplication(deps, {
			applicationId: app.id,
			moderatorId: mod.id,
			decision: 'approve',
			note: 'Looks good'
		});
		expect(result.ok).toBe(true);

		const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
		expect(updated.role).toBe('EXPERT');
		expect(await prisma.expertCategory.count({ where: { userId: user.id } })).toBe(1);
		expect(
			await prisma.userBadge.count({ where: { userId: user.id, badge: 'expert:Epidemiology' } })
		).toBe(1);

		// 3x weight inside the granted category, 1x elsewhere (R9)
		const vu = votingUser(updated);
		expect(await getVoteWeight(deps, vu, scienceId)).toBeGreaterThan(2.9);
		expect(await getVoteWeight(deps, vu, politicsId)).toBeLessThan(1.1);
	});

	it('rejection records the note and leaves the role unchanged', async () => {
		const user = await makeUser();
		const mod = await makeUser({ role: 'MODERATOR' });
		await applyForExpert(deps, {
			userId: user.id,
			field: 'Astrology',
			categoryIds: [scienceId],
			credential: pdf
		});
		const app = await prisma.expertApplication.findFirstOrThrow({ where: { userId: user.id } });
		await reviewExpertApplication(deps, {
			applicationId: app.id,
			moderatorId: mod.id,
			decision: 'reject',
			note: 'Insufficient evidence'
		});
		const reviewed = await prisma.expertApplication.findUniqueOrThrow({ where: { id: app.id } });
		expect(reviewed.status).toBe('REJECTED');
		expect(reviewed.note).toBe('Insufficient evidence');
		expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe('VERIFIED');
	});

	it('a second review is rejected (atomic claim)', async () => {
		const user = await makeUser();
		const mod = await makeUser({ role: 'MODERATOR' });
		await applyForExpert(deps, {
			userId: user.id,
			field: 'Genetics',
			categoryIds: [scienceId],
			credential: pdf
		});
		const app = await prisma.expertApplication.findFirstOrThrow({ where: { userId: user.id } });
		await reviewExpertApplication(deps, {
			applicationId: app.id,
			moderatorId: mod.id,
			decision: 'approve'
		});
		const again = await reviewExpertApplication(deps, {
			applicationId: app.id,
			moderatorId: mod.id,
			decision: 'reject'
		});
		expect(again.ok).toBe(false);
	});
});

describe('listExpertApplications + credential access', () => {
	it('lists pending applications with applicant + category names and resolves the file', async () => {
		const user = await makeUser();
		await applyForExpert(deps, {
			userId: user.id,
			field: 'Virology',
			categoryIds: [scienceId, politicsId],
			credential: pdf
		});
		const list = await listExpertApplications(deps);
		expect(list).toHaveLength(1);
		expect(list[0].applicant).toBe(user.username);
		expect(list[0].categories.map((c) => c.name).sort()).toEqual(['Politics', 'Science']);

		const file = await getCredentialFile(deps, list[0].id);
		expect(file).not.toBeNull();
		expect(file?.mime).toBe('application/pdf');
	});
});

describe('revokeExpert', () => {
	it('drops the role, categories and expert badge', async () => {
		const user = await makeUser();
		const mod = await makeUser({ role: 'MODERATOR' });
		const admin = await makeUser({ role: 'ADMIN' });
		await applyForExpert(deps, {
			userId: user.id,
			field: 'Botany',
			categoryIds: [scienceId],
			credential: pdf
		});
		const app = await prisma.expertApplication.findFirstOrThrow({ where: { userId: user.id } });
		await reviewExpertApplication(deps, {
			applicationId: app.id,
			moderatorId: mod.id,
			decision: 'approve'
		});

		const result = await revokeExpert(deps, { userId: user.id, adminId: admin.id });
		expect(result.ok).toBe(true);
		const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
		expect(after.role).toBe('VERIFIED');
		expect(await prisma.expertCategory.count({ where: { userId: user.id } })).toBe(0);
		expect(
			await prisma.userBadge.count({ where: { userId: user.id, badge: { startsWith: 'expert:' } } })
		).toBe(0);

		// revoking a non-expert is rejected
		expect((await revokeExpert(deps, { userId: user.id, adminId: admin.id })).ok).toBe(false);
	});
});
