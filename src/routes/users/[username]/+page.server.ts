import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { getPublicProfile } from '$lib/server/services/users/profile';
import { submitReport } from '$lib/server/services/moderation';
import { banUser, liftBan } from '$lib/server/services/bans';
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
	return {
		profile,
		profileUserId: target?.id ?? '',
		targetBanned: Boolean(isMod && target?.bannedUntil && target.bannedUntil > new Date())
	};
};

export const actions: Actions = {
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
	}
};
