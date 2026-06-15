import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { getPublicProfile } from '$lib/server/services/users/profile';
import { submitReport } from '$lib/server/services/moderation';
import { banUser, liftBan } from '$lib/server/services/bans';
import { revokeExpert } from '$lib/server/services/experts';
import { followTarget, isFollowing, unfollowTarget } from '$lib/server/services/follows';
import { requireAdmin, requireModerator, requireVerified } from '$lib/server/guards';

export const load: PageServerLoad = async ({ params, locals }) => {
	const deps = authDeps();
	const profile = await getPublicProfile(deps, params.username);
	if (!profile) error(404, 'User not found');
	const target = await deps.prisma.user.findFirst({
		where: { username: params.username },
		select: { id: true, bannedUntil: true }
	});
	const isMod = locals.user?.role === 'MODERATOR' || locals.user?.role === 'ADMIN';
	const following =
		locals.user && target && locals.user.id !== target.id
			? await isFollowing(deps, locals.user.id, 'USER', target.id)
			: false;
	return {
		profile,
		profileUserId: target?.id ?? '',
		following,
		targetBanned: Boolean(isMod && target?.bannedUntil && target.bannedUntil > new Date())
	};
};

export const actions: Actions = {
	follow: async ({ request, locals }) => {
		const user = requireVerified(locals.user);
		const form = await request.formData();
		const result = await followTarget(authDeps(), {
			followerId: user.id,
			targetType: 'USER',
			targetId: String(form.get('targetId') ?? '')
		});
		if (!result.ok) return fail(400, { error: result.error });
		return { following: true };
	},

	unfollow: async ({ request, locals }) => {
		const user = requireVerified(locals.user);
		const form = await request.formData();
		await unfollowTarget(authDeps(), {
			followerId: user.id,
			targetType: 'USER',
			targetId: String(form.get('targetId') ?? '')
		});
		return { following: false };
	},

	report: async ({ request, locals }) => {
		const user = requireVerified(locals.user);
		const form = await request.formData();
		const result = await submitReport(authDeps(), {
			targetType: 'USER',
			targetId: String(form.get('targetId') ?? ''),
			reporterId: user.id,
			reason: String(form.get('reason') ?? ''),
			detail: String(form.get('detail') ?? '')
		});
		if (!result.ok) return fail(400, { error: result.error });
		return { reported: true };
	},

	ban: async ({ request, locals }) => {
		const moderator = requireModerator(locals.user);
		const form = await request.formData();
		const result = await banUser(authDeps(), {
			userId: String(form.get('targetId') ?? ''),
			moderatorId: moderator.id,
			reason: String(form.get('reason') ?? '')
		});
		if (!result.ok) return fail(400, { error: result.error });
		return { banned: true, level: result.level };
	},

	liftBan: async ({ request, locals }) => {
		const admin = requireAdmin(locals.user);
		const form = await request.formData();
		const result = await liftBan(authDeps(), {
			userId: String(form.get('targetId') ?? ''),
			adminId: admin.id
		});
		if (!result.ok) return fail(400, { error: result.error });
		return { liftedBan: true };
	},

	revokeExpert: async ({ request, locals }) => {
		const admin = requireAdmin(locals.user);
		const form = await request.formData();
		const result = await revokeExpert(authDeps(), {
			userId: String(form.get('targetId') ?? ''),
			adminId: admin.id
		});
		if (!result.ok) return fail(400, { error: result.error });
		return { revokedExpert: true };
	}
};
