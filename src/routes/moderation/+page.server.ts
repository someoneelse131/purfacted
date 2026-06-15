import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import {
	createCategory,
	listManagedCategories,
	listProposals,
	moveCategory,
	renameCategory,
	resolveProposal,
	setCategoryStatus
} from '$lib/server/services/categories';
import {
	claimReport,
	listActionLog,
	listOpenReports,
	resolveReport
} from '$lib/server/services/moderation';
import { listExpertApplications, reviewExpertApplication } from '$lib/server/services/experts';
import { requireModerator } from '$lib/server/guards';

export const load: PageServerLoad = async ({ locals, url }) => {
	requireModerator(locals.user);
	const deps = authDeps();
	const tabParam = url.searchParams.get('tab');
	const tab =
		tabParam === 'categories' || tabParam === 'manage' || tabParam === 'experts'
			? tabParam
			: 'reports';
	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const [reportQueue, proposals, categories, expertApplications, actionLog] = await Promise.all([
		listOpenReports(deps, page),
		listProposals(deps),
		listManagedCategories(deps),
		listExpertApplications(deps),
		listActionLog(deps)
	]);
	return { tab, reportQueue, proposals, categories, expertApplications, actionLog };
};

async function logCategoryAction(
	deps: ReturnType<typeof authDeps>,
	moderatorId: string,
	action: string,
	targetId: string,
	detail: string
): Promise<void> {
	await deps.prisma.moderationAction.create({
		data: { moderatorId, action, targetType: 'CATEGORY', targetId, detail }
	});
}

export const actions: Actions = {
	resolveProposal: async ({ request, locals }) => {
		const moderator = requireModerator(locals.user);
		const form = await request.formData();
		const deps = authDeps();
		const categoryId = String(form.get('categoryId') ?? '');
		const approve = form.get('decision') === 'approve';
		const result = await resolveProposal(deps, { categoryId, approve });
		if (!result.ok) return fail(400, { error: result.error });
		await logCategoryAction(
			deps,
			moderator.id,
			approve ? 'approve_category' : 'reject_category',
			categoryId,
			result.category.name
		);
		return { resolved: true };
	},

	createCategory: async ({ request, locals }) => {
		const moderator = requireModerator(locals.user);
		const form = await request.formData();
		const deps = authDeps();
		const parentIdRaw = String(form.get('parentId') ?? '');
		const result = await createCategory(deps, {
			name: String(form.get('name') ?? ''),
			parentId: parentIdRaw === '' ? null : parentIdRaw
		});
		if (!result.ok) return fail(400, { error: result.error });
		await logCategoryAction(
			deps,
			moderator.id,
			'create_category',
			result.category.id,
			result.category.name
		);
		return { resolved: true };
	},

	renameCategory: async ({ request, locals }) => {
		const moderator = requireModerator(locals.user);
		const form = await request.formData();
		const deps = authDeps();
		const result = await renameCategory(deps, {
			categoryId: String(form.get('categoryId') ?? ''),
			name: String(form.get('name') ?? '')
		});
		if (!result.ok) return fail(400, { error: result.error });
		await logCategoryAction(
			deps,
			moderator.id,
			'rename_category',
			result.category.id,
			result.category.name
		);
		return { resolved: true };
	},

	moveCategory: async ({ request, locals }) => {
		const moderator = requireModerator(locals.user);
		const form = await request.formData();
		const deps = authDeps();
		const parentIdRaw = String(form.get('parentId') ?? '');
		const result = await moveCategory(deps, {
			categoryId: String(form.get('categoryId') ?? ''),
			parentId: parentIdRaw === '' ? null : parentIdRaw
		});
		if (!result.ok) return fail(400, { error: result.error });
		await logCategoryAction(
			deps,
			moderator.id,
			'move_category',
			result.category.id,
			result.category.name
		);
		return { resolved: true };
	},

	setCategoryStatus: async ({ request, locals }) => {
		const moderator = requireModerator(locals.user);
		const form = await request.formData();
		const deps = authDeps();
		const status = form.get('status') === 'ACTIVE' ? 'ACTIVE' : 'DISABLED';
		const result = await setCategoryStatus(deps, {
			categoryId: String(form.get('categoryId') ?? ''),
			status
		});
		if (!result.ok) return fail(400, { error: result.error });
		await logCategoryAction(
			deps,
			moderator.id,
			status === 'DISABLED' ? 'disable_category' : 'enable_category',
			result.category.id,
			result.category.name
		);
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
	},

	reviewExpert: async ({ request, locals }) => {
		const moderator = requireModerator(locals.user);
		const form = await request.formData();
		const decision = form.get('decision') === 'approve' ? 'approve' : 'reject';
		const result = await reviewExpertApplication(authDeps(), {
			applicationId: String(form.get('applicationId') ?? ''),
			moderatorId: moderator.id,
			decision,
			note: String(form.get('note') ?? '')
		});
		if (!result.ok) return fail(400, { error: result.error });
		return { resolved: true };
	}
};
