import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { setupTestDb, truncateAll } from '../helpers/test-db';
import { createTestRedis } from '../helpers/test-redis';
import { seedCategories, seedConfig } from '../../prisma/seed';
import {
	addComment,
	deleteComment,
	editComment,
	listComments,
	voteOnComment
} from '../../src/lib/server/services/comments';
import type { VotingUser } from '../../src/lib/server/services/vote-weight';

let prisma: PrismaClient;
let redis: Redis;
let deps: { prisma: PrismaClient; redis: Redis };
let factId: string;

beforeAll(async () => {
	prisma = await setupTestDb();
	redis = createTestRedis();
	deps = { prisma, redis };
}, 120_000);

let counter = 0;
async function makeUser(role: 'VERIFIED' | 'MODERATOR' = 'VERIFIED'): Promise<VotingUser> {
	counter += 1;
	return prisma.user.create({
		data: {
			username: `c${counter}`,
			email: `c${counter}@example.com`,
			passwordHash: 'x'.repeat(60),
			role,
			emailVerifiedAt: new Date()
		}
	});
}

beforeEach(async () => {
	await truncateAll(prisma);
	await redis.flushdb();
	await seedConfig(prisma);
	await seedCategories(prisma);
	const categoryId = (await prisma.category.findUniqueOrThrow({ where: { slug: 'science' } })).id;
	const author = await makeUser();
	factId = (
		await prisma.fact.create({
			data: {
				title: 'Fact with discussion',
				body: 'body',
				authorId: author.id,
				categoryId,
				reviewDeadline: new Date(Date.now() + 86_400_000)
			}
		})
	).id;
});

afterAll(async () => {
	await prisma.$disconnect();
	await redis.quit();
});

describe('comments (R15)', () => {
	it('adds comments and threaded replies up to depth 4', async () => {
		const user = await makeUser();
		const c1 = await addComment(deps, { factId, parentId: null, user, body: 'Level 1' });
		expect(c1.ok).toBe(true);
		if (!c1.ok) return;
		const c2 = await addComment(deps, { factId, parentId: c1.data.id, user, body: 'Level 2' });
		if (!c2.ok) throw new Error(c2.error);
		const c3 = await addComment(deps, { factId, parentId: c2.data.id, user, body: 'Level 3' });
		if (!c3.ok) throw new Error(c3.error);
		const c4 = await addComment(deps, { factId, parentId: c3.data.id, user, body: 'Level 4' });
		if (!c4.ok) throw new Error(c4.error);

		const tooDeep = await addComment(deps, {
			factId,
			parentId: c4.data.id,
			user,
			body: 'Level 5'
		});
		expect(tooDeep.ok).toBe(false);
		if (!tooDeep.ok) expect(tooDeep.error).toContain('4 levels');

		const tree = await listComments(deps, factId);
		expect(tree).toHaveLength(1);
		expect(tree[0].children[0].children[0].children[0].body).toBe('Level 4');
		expect(tree[0].children[0].children[0].children[0].depth).toBe(4);
	});

	it('rejects empty, over-long and unverified comments', async () => {
		const user = await makeUser();
		expect((await addComment(deps, { factId, parentId: null, user, body: '   ' })).ok).toBe(false);
		expect(
			(await addComment(deps, { factId, parentId: null, user, body: 'x'.repeat(2001) })).ok
		).toBe(false);

		const unverified = await prisma.user.create({
			data: { username: 'nover', email: 'nover@example.com', passwordHash: 'x'.repeat(60) }
		});
		expect(
			(await addComment(deps, { factId, parentId: null, user: unverified, body: 'hi' })).ok
		).toBe(false);
	});

	it('enforces the hourly rate limit', async () => {
		const user = await makeUser();
		for (let i = 0; i < 30; i++) {
			const r = await addComment(deps, { factId, parentId: null, user, body: `Comment ${i}` });
			expect(r.ok).toBe(true);
		}
		const blocked = await addComment(deps, { factId, parentId: null, user, body: 'One too many' });
		expect(blocked.ok).toBe(false);
	});

	it('edits only own comments within the window', async () => {
		const user = await makeUser();
		const other = await makeUser();
		const comment = await addComment(deps, { factId, parentId: null, user, body: 'Original' });
		if (!comment.ok) throw new Error('add failed');

		const foreign = await editComment(deps, {
			commentId: comment.data.id,
			userId: other.id,
			body: 'Hijacked'
		});
		expect(foreign.ok).toBe(false);

		const edited = await editComment(deps, {
			commentId: comment.data.id,
			userId: user.id,
			body: 'Fixed typo'
		});
		expect(edited.ok).toBe(true);
		if (edited.ok) expect(edited.data.editedAt).not.toBeNull();

		// age the comment past the 15 min window
		await prisma.comment.update({
			where: { id: comment.data.id },
			data: { createdAt: new Date(Date.now() - 16 * 60_000) }
		});
		const late = await editComment(deps, {
			commentId: comment.data.id,
			userId: user.id,
			body: 'Too late'
		});
		expect(late.ok).toBe(false);
	});

	it('soft deletes (own or moderator) and hides author/body in the tree', async () => {
		const user = await makeUser();
		const stranger = await makeUser();
		const moderator = await makeUser('MODERATOR');
		const a = await addComment(deps, { factId, parentId: null, user, body: 'Mine' });
		const b = await addComment(deps, { factId, parentId: null, user, body: 'Also mine' });
		if (!a.ok || !b.ok) throw new Error('add failed');

		expect((await deleteComment(deps, { commentId: a.data.id, actor: stranger })).ok).toBe(false);
		expect((await deleteComment(deps, { commentId: a.data.id, actor: user })).ok).toBe(true);
		expect((await deleteComment(deps, { commentId: b.data.id, actor: moderator })).ok).toBe(true);

		const tree = await listComments(deps, factId);
		expect(tree.every((n) => n.deleted && n.body === null && n.author === null)).toBe(true);
		// replying to deleted comments is blocked
		const reply = await addComment(deps, {
			factId,
			parentId: a.data.id,
			user,
			body: 'Necro'
		});
		expect(reply.ok).toBe(false);
	});

	it('weighted votes sort siblings without touching reputation', async () => {
		const user = await makeUser();
		const expertVoter = await makeUser();
		const first = await addComment(deps, { factId, parentId: null, user, body: 'First' });
		const second = await addComment(deps, { factId, parentId: null, user, body: 'Second' });
		if (!first.ok || !second.ok) throw new Error('add failed');

		// upvote the second comment so it outranks the first
		const vote = await voteOnComment(deps, {
			commentId: second.data.id,
			user: expertVoter,
			value: 1
		});
		expect(vote.ok).toBe(true);

		const tree = await listComments(deps, factId, expertVoter.id);
		expect(tree.map((n) => n.body)).toEqual(['Second', 'First']);
		expect(tree[0].score).toBe(1);
		expect(tree[0].myVote).toBe(1);

		// reputation untouched (comments never affect reputation)
		const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
		expect(refreshed.reputation).toBe(0);

		// switching the vote flips the order back
		await voteOnComment(deps, { commentId: second.data.id, user: expertVoter, value: -1 });
		const tree2 = await listComments(deps, factId);
		expect(tree2.map((n) => n.body)).toEqual(['First', 'Second']);
	});
});
