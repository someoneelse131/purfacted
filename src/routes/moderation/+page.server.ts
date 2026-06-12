import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { listProposals, resolveProposal } from '$lib/server/services/categories';
import {
	claimReport,
	listActionLog,
	listOpenReports,
	resolveReport
} from '$lib/server/services/moderation';
import { requireModerator } from '$lib/server/guards';

export const load: PageServerLoad = async ({ locals, url }) => {
	requireModerator(locals.user);
	const deps = authDeps();
	const tab = url.searchParams.get('tab') === 'categories' ? 'categories' : 'reports';
	const [reports, proposals, actionLog] = await Promise.all([
		listOpenReports(deps),
		listProposals(deps),
		listActionLog(deps)
	]);
	return { tab, reports, proposals, actionLog };
};

export const actions: Actions = {
	resolveProposal: async ({ request, locals }) => {
		const moderator = requireModerator(locals.user);
		const form = await request.formData();
		const deps = authDeps();
		const categoryId = String(form.get('categoryId') ?? '');
		const approve = form.get('decision') === 'approve';
		const result = await resolveProposal(deps, { categoryId, approve });
		if (!result.ok) return fail(400, { error: result.error });
		await deps.prisma.moderationAction.create({
			data: {
				moderatorId: moderator.id,
				action: approve ? 'approve_category' : 'reject_category',
				targetType: 'CATEGORY',
				targetId: categoryId,
				detail: result.category.name
			}
		});
		return { resolved: true };
	},

	claimReport: async ({ request, locals }) => {
		const moderator = requireModerator(locals.user);
		const form = await request.formData();
		const result = await claimReport(authDeps(), {
			reportId: String(form.get('reportId') ?? ''),
			moderatorId: moderator.id
		});
		if (!result.ok) return fail(400, { error: result.error });
		return { resolved: true };
	},

	resolveReport: async ({ request, locals }) => {
		const moderator = requireModerator(locals.user);
		const form = await request.formData();
		const outcome = form.get('outcome') === 'removed' ? 'removed' : 'dismissed';
		const result = await resolveReport(authDeps(), {
			reportId: String(form.get('reportId') ?? ''),
			moderatorId: moderator.id,
			outcome
		});
		if (!result.ok) return fail(400, { error: result.error });
		return { resolved: true };
	}
};
