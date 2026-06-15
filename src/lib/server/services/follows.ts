import type { FollowTargetType } from '@prisma/client';
import type { AuthDeps } from './auth/session';

// Follow system (R29): a user follows other users or categories. The graph is
// polymorphic (targetType + targetId) and feeds the home feed (R30) and
// hotspots (R31). Follower counts are shown on profiles; users manage their own
// follows in settings.

export type { FollowTargetType };

export interface FollowResult {
	ok: boolean;
	error?: string;
	following?: boolean;
}

// Confirms the follow target exists and is followable, returning a normalized
// error otherwise. Users must be active (not soft-deleted); categories active.
async function targetIsFollowable(
	deps: AuthDeps,
	targetType: FollowTargetType,
	targetId: string
): Promise<string | null> {
	if (targetType === 'USER') {
		const user = await deps.prisma.user.findFirst({
			where: { id: targetId, deletedAt: null },
			select: { id: true }
		});
		return user ? null : 'User not found.';
	}
	const category = await deps.prisma.category.findFirst({
		where: { id: targetId, status: 'ACTIVE' },
		select: { id: true }
	});
	return category ? null : 'Category not found.';
}

export async function followTarget(
	deps: AuthDeps,
	input: { followerId: string; targetType: FollowTargetType; targetId: string }
): Promise<FollowResult> {
	if (input.targetType === 'USER' && input.targetId === input.followerId) {
		return { ok: false, error: 'You cannot follow yourself.' };
	}
	const invalid = await targetIsFollowable(deps, input.targetType, input.targetId);
	if (invalid) return { ok: false, error: invalid };

	// Idempotent: re-following an already-followed target is a no-op.
	await deps.prisma.follow.upsert({
		where: {
			followerId_targetType_targetId: {
				followerId: input.followerId,
				targetType: input.targetType,
				targetId: input.targetId
			}
		},
		update: {},
		create: {
			followerId: input.followerId,
			targetType: input.targetType,
			targetId: input.targetId
		}
	});
	return { ok: true, following: true };
}

export async function unfollowTarget(
	deps: AuthDeps,
	input: { followerId: string; targetType: FollowTargetType; targetId: string }
): Promise<FollowResult> {
	await deps.prisma.follow.deleteMany({
		where: {
			followerId: input.followerId,
			targetType: input.targetType,
			targetId: input.targetId
		}
	});
	return { ok: true, following: false };
}

export async function isFollowing(
	deps: AuthDeps,
	followerId: string,
	targetType: FollowTargetType,
	targetId: string
): Promise<boolean> {
	const follow = await deps.prisma.follow.findUnique({
		where: { followerId_targetType_targetId: { followerId, targetType, targetId } },
		select: { id: true }
	});
	return follow !== null;
}

export async function getFollowerCount(
	deps: AuthDeps,
	targetType: FollowTargetType,
	targetId: string
): Promise<number> {
	return deps.prisma.follow.count({ where: { targetType, targetId } });
}

export interface FollowedUser {
	id: string;
	username: string;
	role: string;
	followedAt: Date;
}

export interface FollowedCategory {
	id: string;
	name: string;
	slug: string;
	followedAt: Date;
}

export interface FollowLists {
	users: FollowedUser[];
	categories: FollowedCategory[];
}

// The follows a user manages in settings. Targets that have since been removed
// (deleted user, disabled category) are omitted so the list stays clean.
export async function listFollows(deps: AuthDeps, followerId: string): Promise<FollowLists> {
	const follows = await deps.prisma.follow.findMany({
		where: { followerId },
		orderBy: { createdAt: 'desc' }
	});
	const userIds = follows.filter((f) => f.targetType === 'USER').map((f) => f.targetId);
	const categoryIds = follows.filter((f) => f.targetType === 'CATEGORY').map((f) => f.targetId);

	const [users, categories] = await Promise.all([
		userIds.length
			? deps.prisma.user.findMany({
					where: { id: { in: userIds }, deletedAt: null },
					select: { id: true, username: true, role: true }
				})
			: Promise.resolve([]),
		categoryIds.length
			? deps.prisma.category.findMany({
					where: { id: { in: categoryIds }, status: 'ACTIVE' },
					select: { id: true, name: true, slug: true }
				})
			: Promise.resolve([])
	]);

	const followedAt = new Map(follows.map((f) => [`${f.targetType}:${f.targetId}`, f.createdAt]));
	return {
		users: users
			.map((u) => ({ ...u, followedAt: followedAt.get(`USER:${u.id}`)! }))
			.sort((a, b) => b.followedAt.getTime() - a.followedAt.getTime()),
		categories: categories
			.map((c) => ({ ...c, followedAt: followedAt.get(`CATEGORY:${c.id}`)! }))
			.sort((a, b) => b.followedAt.getTime() - a.followedAt.getTime())
	};
}

// The raw target ids a user follows, for feed consumers (R30/R31).
export async function getFollowedIds(
	deps: AuthDeps,
	followerId: string
): Promise<{ userIds: string[]; categoryIds: string[] }> {
	const follows = await deps.prisma.follow.findMany({
		where: { followerId },
		select: { targetType: true, targetId: true }
	});
	return {
		userIds: follows.filter((f) => f.targetType === 'USER').map((f) => f.targetId),
		categoryIds: follows.filter((f) => f.targetType === 'CATEGORY').map((f) => f.targetId)
	};
}
