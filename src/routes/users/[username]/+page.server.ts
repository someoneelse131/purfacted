import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { getPublicProfile } from '$lib/server/services/users/profile';
import { submitReport } from '$lib/server/services/moderation';
import { requireVerified } from '$lib/server/guards';

export const load: PageServerLoad = async ({ params }) => {
	const deps = authDeps();
	const profile = await getPublicProfile(deps, params.username);
	if (!profile) error(404, 'User not found');
	const target = await deps.prisma.user.findFirst({
		where: { username: params.username },
		select: { id: true }
	});
	return { profile, profileUserId: target?.id ?? '' };
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
	}
};
