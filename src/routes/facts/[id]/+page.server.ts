import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { getFactDetail } from '$lib/server/services/facts/queries';
import { addSource, flagSource, voteOnSource } from '$lib/server/services/facts/evidence';
import { editFact, hasForeignInteraction } from '$lib/server/services/facts/submit';
import { evaluateFact } from '$lib/server/services/facts/status-engine';
import {
	addComment,
	deleteComment,
	editComment,
	listComments,
	voteOnComment,
	type CommentNode
} from '$lib/server/services/comments';
import { getConfigNumber } from '$lib/server/services/config';
import { getOpenVeto, submitVeto } from '$lib/server/services/facts/veto';
import { submitReport } from '$lib/server/services/moderation';
import { sourceScore } from '$lib/server/services/facts/scoring';
import { suggestSourceType } from '$lib/server/services/facts/source-type';
import { requireVerified } from '$lib/server/guards';

export const load: PageServerLoad = async ({ params, locals }) => {
	const deps = authDeps();
	const fact = await getFactDetail(deps, params.id);
	if (!fact) error(404, 'Fact not found');
	const comments = await listComments(deps, fact.id, locals.user?.id);
	const openVeto = await getOpenVeto(deps, fact.id);

	// Claim immutability (R24): the author can edit only while UNDER_REVIEW and
	// before anyone else has interacted; moderators can always edit.
	const isModerator = locals.user?.role === 'MODERATOR' || locals.user?.role === 'ADMIN';
	const isAuthor = locals.user?.id === fact.authorId;
	const authorCanEdit =
		isAuthor &&
		fact.status === 'UNDER_REVIEW' &&
		!(await hasForeignInteraction(deps, fact.id, fact.authorId));
	const canEditClaim = Boolean(isModerator || authorCanEdit);
	// UI limits come from the same config the server enforces, so they cannot drift
	const [commentMaxLength, commentMaxDepth, reportDetailMax, quoteMin, quoteMax] =
		await Promise.all([
			getConfigNumber(deps, 'comments.max_length'),
			getConfigNumber(deps, 'comments.max_depth'),
			getConfigNumber(deps, 'moderation.report_detail_max'),
			getConfigNumber(deps, 'sources.quote_min'),
			getConfigNumber(deps, 'sources.quote_max')
		]);

	const countThread = (nodes: CommentNode[]): number =>
		nodes.reduce((sum, node) => sum + 1 + countThread(node.children), 0);

	// Blind review (R24): while UNDER_REVIEW the per-source score and the
	// overall balance stay hidden from everyone. Only neutral participation
	// (how many people voted) and the viewer's own vote are visible.
	const blind = fact.status === 'UNDER_REVIEW';

	const sources = fact.sources.map((source) => ({
		id: source.id,
		side: source.side,
		url: source.url,
		title: source.title,
		type: source.type,
		credibility: source.credibility,
		quote: source.quote,
		archiveUrl: source.archiveUrl,
		addedBy: source.addedBy.username,
		score: blind
			? null
			: sourceScore({
					side: source.side,
					credibility: source.credibility,
					votes: source.votes
				}),
		voteCount: source.votes.length,
		myVote: locals.user ? (source.votes.find((v) => v.userId === locals.user!.id)?.value ?? 0) : 0
	}));

	return {
		fact: {
			id: fact.id,
			title: fact.title,
			body: fact.body,
			status: fact.status,
			author: fact.author,
			category: fact.category,
			createdAt: fact.createdAt,
			reviewDeadline: fact.reviewDeadline,
			isOwn: locals.user?.id === fact.authorId,
			revivable: fact.status === 'UNSUBSTANTIATED' && fact.revivedAt === null,
			canEditClaim
		},
		pro: sources.filter((s) => s.side === 'PRO'),
		contra: sources.filter((s) => s.side === 'CONTRA'),
		comments,
		commentCount: countThread(comments),
		limits: { commentMaxLength, commentMaxDepth, reportDetailMax, quoteMin, quoteMax },
		openVeto: openVeto ? { reason: openVeto.reason, submitter: openVeto.submitter.username } : null
	};
};

export const actions: Actions = {
	addSource: async ({ request, params, locals }) => {
		const user = requireVerified(locals.user);
		const form = await request.formData();
		const url = String(form.get('url') ?? '');
		const type = String(form.get('type') ?? '');
		const result = await addSource(authDeps(), {
			factId: params.id,
			userId: user.id,
			side: String(form.get('side') ?? ''),
			url,
			title: String(form.get('title') ?? ''),
			type: type || suggestSourceType(url),
			quote: String(form.get('quote') ?? '')
		});
		if (!result.ok) return fail(400, { action: 'addSource', error: result.error });
		return { action: 'addSource', saved: true };
	},

	editFact: async ({ request, params, locals }) => {
		const user = requireVerified(locals.user);
		const form = await request.formData();
		const result = await editFact(authDeps(), {
			factId: params.id,
			userId: user.id,
			role: user.role,
			title: String(form.get('title') ?? ''),
			body: String(form.get('body') ?? '')
		});
		if (!result.ok) return fail(400, { action: 'editFact', error: result.error });
		return { action: 'editFact', saved: true };
	},

	vote: async ({ request, locals }) => {
		const user = requireVerified(locals.user);
		const form = await request.formData();
		const deps = authDeps();
		const result = await voteOnSource(deps, {
			sourceId: String(form.get('sourceId') ?? ''),
			user,
			value: Number(form.get('value'))
		});
		if (!result.ok) return fail(400, { action: 'vote', error: result.error });
		// a vote can complete the quorum - check immediately (R12); evaluate the
		// fact the source actually belongs to, not the page's fact
		await evaluateFact(deps, result.data.factId);
		return { action: 'vote', saved: true };
	},

	flag: async ({ request, locals }) => {
		const user = requireVerified(locals.user);
		const form = await request.formData();
		const result = await flagSource(authDeps(), {
			sourceId: String(form.get('sourceId') ?? ''),
			userId: user.id,
			reason: String(form.get('reason') ?? 'spam/misleading')
		});
		if (!result.ok) return fail(400, { action: 'flag', error: result.error });
		return { action: 'flag', saved: true };
	},

	veto: async ({ request, params, locals }) => {
		const user = requireVerified(locals.user);
		const form = await request.formData();
		const url = String(form.get('vetoSourceUrl') ?? '');
		const type = String(form.get('vetoSourceType') ?? '');
		const result = await submitVeto(authDeps(), {
			factId: params.id,
			user,
			reason: String(form.get('reason') ?? ''),
			source: {
				side: String(form.get('vetoSide') ?? 'CONTRA'),
				url,
				title: String(form.get('vetoSourceTitle') ?? ''),
				type: type || suggestSourceType(url),
				quote: String(form.get('vetoSourceQuote') ?? '')
			}
		});
		if (!result.ok) return fail(400, { action: 'veto', error: result.error });
		return { action: 'veto', saved: true };
	},

	report: async ({ request, params, locals }) => {
		const user = requireVerified(locals.user);
		const form = await request.formData();
		const targetTypeRaw = String(form.get('targetType') ?? 'FACT');
		const targetType =
			targetTypeRaw === 'COMMENT' ? 'COMMENT' : targetTypeRaw === 'SOURCE' ? 'SOURCE' : 'FACT';
		const result = await submitReport(authDeps(), {
			targetType,
			targetId: String(form.get('targetId') ?? params.id),
			reporterId: user.id,
			reason: String(form.get('reason') ?? ''),
			detail: String(form.get('detail') ?? '')
		});
		if (!result.ok) return fail(400, { action: 'report', error: result.error });
		return { action: 'report', saved: true };
	},

	comment: async ({ request, params, locals }) => {
		const user = requireVerified(locals.user);
		const form = await request.formData();
		const parentIdRaw = String(form.get('parentId') ?? '');
		const result = await addComment(authDeps(), {
			factId: params.id,
			parentId: parentIdRaw === '' ? null : parentIdRaw,
			user,
			body: String(form.get('body') ?? '')
		});
		if (!result.ok) return fail(400, { action: 'comment', error: result.error });
		return { action: 'comment', saved: true };
	},

	editComment: async ({ request, locals }) => {
		const user = requireVerified(locals.user);
		const form = await request.formData();
		const result = await editComment(authDeps(), {
			commentId: String(form.get('commentId') ?? ''),
			userId: user.id,
			body: String(form.get('body') ?? '')
		});
		if (!result.ok) return fail(400, { action: 'comment', error: result.error });
		return { action: 'comment', saved: true };
	},

	deleteComment: async ({ request, locals }) => {
		const user = requireVerified(locals.user);
		const form = await request.formData();
		const result = await deleteComment(authDeps(), {
			commentId: String(form.get('commentId') ?? ''),
			actor: user
		});
		if (!result.ok) return fail(400, { action: 'comment', error: result.error });
		return { action: 'comment', saved: true };
	},

	voteComment: async ({ request, locals }) => {
		const user = requireVerified(locals.user);
		const form = await request.formData();
		const result = await voteOnComment(authDeps(), {
			commentId: String(form.get('commentId') ?? ''),
			user,
			value: Number(form.get('value'))
		});
		if (!result.ok) return fail(400, { action: 'comment', error: result.error });
		return { action: 'comment', saved: true };
	}
};
