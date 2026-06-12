import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { setupTestDb } from '../helpers/test-db';
import { seedConfig } from '../../prisma/seed';
import { CONFIG_DEFAULTS } from '../../src/lib/server/config-defaults';

let prisma: PrismaClient;

beforeAll(async () => {
	prisma = await setupTestDb();
}, 120_000);

afterAll(async () => {
	await prisma.$disconnect();
});

describe('config seed', () => {
	it('loads all default config values', async () => {
		await seedConfig(prisma);
		const rows = await prisma.config.findMany();
		expect(rows).toHaveLength(CONFIG_DEFAULTS.length);
		const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
		expect(byKey['quorum.min_total_weight']).toBe('15');
		expect(byKey['status.verified_threshold']).toBe('0.5');
		expect(byKey['credibility.peer_reviewed']).toBe('5');
	});

	it('is idempotent and preserves tuned values', async () => {
		await prisma.config.update({
			where: { key: 'quorum.min_reviewers' },
			data: { value: '7' }
		});
		await seedConfig(prisma);
		const row = await prisma.config.findUnique({ where: { key: 'quorum.min_reviewers' } });
		expect(row?.value).toBe('7');
		expect(await prisma.config.count()).toBe(CONFIG_DEFAULTS.length);
	});
});

describe('core schema CRUD', () => {
	it('supports create/read/update/delete across all tables', async () => {
		// users
		const user = await prisma.user.create({
			data: {
				email: 'alice@example.com',
				username: 'alice',
				passwordHash: 'x'.repeat(60)
			}
		});
		expect(user.role).toBe('VERIFIED');
		expect(user.reputation).toBe(0);

		const reviewer = await prisma.user.create({
			data: { email: 'bob@example.com', username: 'bob', passwordHash: 'y'.repeat(60) }
		});

		// sessions (id = token hash, app-assigned)
		const session = await prisma.session.create({
			data: { id: 'sessionhash1', userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) }
		});
		expect(session.userId).toBe(user.id);

		// email_verifications / password_resets
		await prisma.emailVerification.create({
			data: { token: 'verify1', userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) }
		});
		await prisma.passwordReset.create({
			data: { token: 'reset1', userId: user.id, expiresAt: new Date(Date.now() + 3_600_000) }
		});

		// categories (tree)
		const science = await prisma.category.create({ data: { name: 'Science', slug: 'science' } });
		const physics = await prisma.category.create({
			data: { name: 'Physics', slug: 'physics', parentId: science.id }
		});
		const tree = await prisma.category.findUnique({
			where: { id: science.id },
			include: { children: true }
		});
		expect(tree?.children.map((c) => c.id)).toContain(physics.id);

		// facts
		const fact = await prisma.fact.create({
			data: {
				title: 'Water boils at 100 °C at sea level',
				body: 'Standard atmospheric pressure assumed.',
				authorId: user.id,
				categoryId: physics.id,
				reviewDeadline: new Date(Date.now() + 14 * 86_400_000)
			}
		});
		expect(fact.status).toBe('UNDER_REVIEW');

		// sources + votes
		const source = await prisma.source.create({
			data: {
				factId: fact.id,
				side: 'PRO',
				url: 'https://example.org/paper',
				title: 'Peer-reviewed paper',
				type: 'PEER_REVIEWED',
				credibility: 5,
				addedById: user.id
			}
		});
		await prisma.sourceVote.create({
			data: { sourceId: source.id, userId: reviewer.id, value: 1, weight: 1.0 }
		});
		// one vote per user per source
		await expect(
			prisma.sourceVote.create({
				data: { sourceId: source.id, userId: reviewer.id, value: -1, weight: 1.0 }
			})
		).rejects.toThrow();

		// comments (threaded) + votes
		const comment = await prisma.comment.create({
			data: { factId: fact.id, authorId: reviewer.id, body: 'Solid source.' }
		});
		const reply = await prisma.comment.create({
			data: { factId: fact.id, parentId: comment.id, authorId: user.id, body: 'Agreed.' }
		});
		expect(reply.parentId).toBe(comment.id);
		await prisma.commentVote.create({
			data: { commentId: comment.id, userId: user.id, value: 1, weight: 1.0 }
		});

		// vetoes
		const veto = await prisma.veto.create({
			data: { factId: fact.id, submitterId: reviewer.id, reason: 'New contradicting study' }
		});
		expect(veto.status).toBe('OPEN');

		// update
		const updated = await prisma.fact.update({
			where: { id: fact.id },
			data: { status: 'VERIFIED', decidedAt: new Date() }
		});
		expect(updated.status).toBe('VERIFIED');

		// delete cascades: removing the fact takes sources, votes, comments, vetoes
		await prisma.fact.delete({ where: { id: fact.id } });
		expect(await prisma.source.count()).toBe(0);
		expect(await prisma.sourceVote.count()).toBe(0);
		expect(await prisma.comment.count()).toBe(0);
		expect(await prisma.veto.count()).toBe(0);

		// deleting a user cascades sessions/tokens
		await prisma.user.delete({ where: { id: user.id } });
		expect(await prisma.session.count()).toBe(0);
		expect(await prisma.emailVerification.count()).toBe(0);
		expect(await prisma.passwordReset.count()).toBe(0);
	}, 30_000);

	it('enforces unique email, username and category slug', async () => {
		await prisma.user.create({
			data: { email: 'carol@example.com', username: 'carol', passwordHash: 'z'.repeat(60) }
		});
		await expect(
			prisma.user.create({
				data: { email: 'carol@example.com', username: 'carol2', passwordHash: 'z'.repeat(60) }
			})
		).rejects.toThrow();
		await expect(
			prisma.user.create({
				data: { email: 'carol2@example.com', username: 'carol', passwordHash: 'z'.repeat(60) }
			})
		).rejects.toThrow();
		await expect(
			prisma.category.create({ data: { name: 'Physics 2', slug: 'physics' } })
		).rejects.toThrow();
	});
});
