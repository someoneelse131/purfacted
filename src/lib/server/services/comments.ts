import type { Comment } from '@prisma/client';
import type { AuthDeps } from './auth/session';
import { getConfigNumber } from './config';
import { hitRateLimit } from './rate-limit';
import { getVoteWeight, type VotingUser } from './vote-weight';
import { emitActivity } from './activity';

// Threaded comments (R15): max depth from config, edit window, soft delete,
// weighted votes used for sorting only (never reputation).

export type CommentResult<T = Comment> = { ok: true; data: T } | { ok: false; error: string };

function canPost(user: VotingUser): string | null {
	if (!user.emailVerifiedAt) return 'Verify your email address first.';
	if (user.bannedUntil && user.bannedUntil > new Date()) return 'Your account is banned.';
	if (user.deletedAt) return 'Account unavailable.';
	return null;
}

async function depthOf(deps: AuthDeps, commentId: string): Promise<number> {
	let depth = 1;
	let current = await deps.prisma.comment.findUnique({
		where: { id: commentId },
		select: { parentId: true }
	});
	while (current?.parentId) {
		depth += 1;
		if (depth > 10) break; // safety against cycles
		current = await deps.prisma.comment.findUnique({
			where: { id: current.parentId },
			select: { parentId: true }
		});
	}
	return depth;
}

export async function addComment(
	deps: AuthDeps,
	input: { factId: string; parentId: string | null; user: VotingUser; body: string }
): Promise<CommentResult> {
	const blocked = canPost(input.user);
	if (blocked) return { ok: false, error: blocked };

	const [maxLength, maxDepth, maxPerHour] = await Promise.all([
		getConfigNumber(deps, 'comments.max_length'),
		getConfigNumber(deps, 'comments.max_depth'),
		getConfigNumber(deps, 'comments.max_per_hour')
	]);

	const body = input.body.trim();
	if (body.length === 0) return { ok: false, error: 'Comment cannot be empty.' };
	if (body.length > maxLength) {
		return { ok: false, error: `Comment must be at most ${maxLength} characters.` };
	}

	const fact = await deps.prisma.fact.findUnique({ where: { id: input.factId } });
	if (!fact || fact.deletedAt) return { ok: false, error: 'Fact not found.' };

	if (input.parentId) {
		const parent = await deps.prisma.comment.findUnique({ where: { id: input.parentId } });
		if (!parent || parent.factId !== fact.id) {
			return { ok: false, error: 'Parent comment not found.' };
		}
		if (parent.deletedAt) return { ok: false, error: 'Cannot reply to a deleted comment.' };
		const parentDepth = await depthOf(deps, parent.id);
		if (parentDepth >= maxDepth) {
			return { ok: false, error: `Threads are limited to ${maxDepth} levels.` };
		}
	}

	const limit = await hitRateLimit(deps.redis, `comment:${input.user.id}`, maxPerHour, 3600);
	if (!limit.allowed) {
		return { ok: false, error: 'Comment limit reached. Try again later.' };
	}

	const comment = await deps.prisma.comment.create({
		data: {
			factId: fact.id,
			parentId: input.parentId,
			authorId: input.user.id,
			body
		}
	});

	// the spec calls this the "comment reply" event; we record every comment
	// (top-level and reply) and carry parentId so consumers can distinguish
	await emitActivity(deps, {
		type: 'comment_added',
		actorId: input.user.id,
		subjectType: 'COMMENT',
		subjectId: comment.id,
		factId: fact.id,
		categoryId: fact.categoryId,
		payload: { parentId: input.parentId }
	});

	return { ok: true, data: comment };
}

export async function editComment(
	deps: AuthDeps,
	input: { commentId: string; userId: string; body: string }
): Promise<CommentResult> {
	const comment = await deps.prisma.comment.findUnique({ where: { id: input.commentId } });
	if (!comment || comment.deletedAt) return { ok: false, error: 'Comment not found.' };
	if (comment.authorId !== input.userId) {
		return { ok: false, error: 'You can only edit your own comments.' };
	}

	const [maxLength, windowMinutes] = await Promise.all([
		getConfigNumber(deps, 'comments.max_length'),
		getConfigNumber(deps, 'comments.edit_window_minutes')
	]);
	if (Date.now() - comment.createdAt.getTime() > windowMinutes * 60_000) {
		return { ok: false, error: `Comments can only be edited within ${windowMinutes} minutes.` };
	}
	const body = input.body.trim();
	if (body.length === 0 || body.length > maxLength) {
		return { ok: false, error: `Comment must be 1-${maxLength} characters.` };
	}

	const updated = await deps.prisma.comment.update({
		where: { id: comment.id },
		data: { body, editedAt: new Date() }
	});
	return { ok: true, data: updated };
}

export async function deleteComment(
	deps: AuthDeps,
	input: { commentId: string; actor: VotingUser }
): Promise<CommentResult<null>> {
	const comment = await deps.prisma.comment.findUnique({ where: { id: input.commentId } });
	if (!comment || comment.deletedAt) return { ok: false, error: 'Comment not found.' };
	const isOwn = comment.authorId === input.actor.id;
	const isMod = input.actor.role === 'MODERATOR' || input.actor.role === 'ADMIN';
	if (!isOwn && !isMod) {
		return { ok: false, error: 'You can only delete your own comments.' };
	}
	await deps.prisma.comment.update({
		where: { id: comment.id },
		data: { deletedAt: new Date() }
	});
	return { ok: true, data: null };
}

export async function voteOnComment(
	deps: AuthDeps,
	input: { commentId: string; user: VotingUser; value: number }
): Promise<CommentResult<{ weight: number }>> {
	if (input.value !== 1 && input.value !== -1) {
		return { ok: false, error: 'Vote must be up or down.' };
	}
	const comment = await deps.prisma.comment.findUnique({
		where: { id: input.commentId },
		include: { fact: { select: { categoryId: true } } }
	});
	if (!comment || comment.deletedAt) return { ok: false, error: 'Comment not found.' };

	const weight = await getVoteWeight(deps, input.user, comment.fact.categoryId);
	if (weight <= 0) {
		return { ok: false, error: 'Your account cannot vote (verify your email first).' };
	}
	await deps.prisma.commentVote.upsert({
		where: { commentId_userId: { commentId: comment.id, userId: input.user.id } },
		create: { commentId: comment.id, userId: input.user.id, value: input.value, weight },
		update: { value: input.value, weight }
	});
	return { ok: true, data: { weight } };
}

export interface CommentNode {
	id: string;
	author: string | null; // null for deleted comments
	body: string | null;
	createdAt: Date;
	editedAt: Date | null;
	deleted: boolean;
	score: number;
	myVote: number;
	depth: number;
	editableUntil: Date | null;
	children: CommentNode[];
}

// Full tree for a fact: siblings sorted by weighted score (desc), then age.
export async function listComments(
	deps: AuthDeps,
	factId: string,
	currentUserId?: string
): Promise<CommentNode[]> {
	const [comments, windowMinutes] = await Promise.all([
		deps.prisma.comment.findMany({
			where: { factId },
			orderBy: { createdAt: 'asc' },
			include: {
				author: { select: { id: true, username: true } },
				votes: { select: { userId: true, value: true, weight: true } }
			}
		}),
		getConfigNumber(deps, 'comments.edit_window_minutes')
	]);

	const nodes = new Map<string, CommentNode>();
	const roots: CommentNode[] = [];
	for (const comment of comments) {
		const deleted = comment.deletedAt !== null;
		const score = comment.votes.reduce((sum, v) => sum + v.value * v.weight, 0);
		const isOwn = currentUserId === comment.author.id;
		nodes.set(comment.id, {
			id: comment.id,
			author: deleted ? null : comment.author.username,
			body: deleted ? null : comment.body,
			createdAt: comment.createdAt,
			editedAt: comment.editedAt,
			deleted,
			score: Math.round(score * 100) / 100,
			myVote: currentUserId
				? (comment.votes.find((v) => v.userId === currentUserId)?.value ?? 0)
				: 0,
			depth: 1,
			editableUntil:
				isOwn && !deleted ? new Date(comment.createdAt.getTime() + windowMinutes * 60_000) : null,
			children: []
		});
	}
	for (const comment of comments) {
		const node = nodes.get(comment.id)!;
		if (comment.parentId && nodes.has(comment.parentId)) {
			const parent = nodes.get(comment.parentId)!;
			node.depth = parent.depth + 1;
			parent.children.push(node);
		} else {
			roots.push(node);
		}
	}
	const sortLevel = (list: CommentNode[]) => {
		list.sort((a, b) => b.score - a.score || a.createdAt.getTime() - b.createdAt.getTime());
		for (const node of list) sortLevel(node.children);
	};
	sortLevel(roots);
	return roots;
}
