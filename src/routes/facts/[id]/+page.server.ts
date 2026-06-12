import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { authDeps } from '$lib/server/auth-deps';
import { getFactDetail } from '$lib/server/services/facts/queries';
import { addSource, flagSource, voteOnSource } from '$lib/server/services/facts/evidence';
import { evaluateFact } from '$lib/server/services/facts/status-engine';
import { sourceScore } from '$lib/server/services/facts/scoring';
import { suggestSourceType } from '$lib/server/services/facts/source-type';
import { requireVerified } from '$lib/server/guards';

export const load: PageServerLoad = async ({ params, locals }) => {
	const fact = await getFactDetail(authDeps(), params.id);
	if (!fact) error(404, 'Fact not found');

	const sources = fact.sources.map((source) => ({
		id: source.id,
		side: source.side,
		url: source.url,
		title: source.title,
		type: source.type,
		credibility: source.credibility,
		addedBy: source.addedBy.username,
		score: sourceScore({
			side: source.side,
			credibility: source.credibility,
			votes: source.votes
		}),
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
			isOwn: locals.user?.id === fact.authorId
		},
		pro: sources.filter((s) => s.side === 'PRO'),
		contra: sources.filter((s) => s.side === 'CONTRA')
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
			type: type || suggestSourceType(url)
		});
		if (!result.ok) return fail(400, { action: 'addSource', error: result.error });
		return { action: 'addSource', saved: true };
	},

	vote: async ({ request, params, locals }) => {
		const user = requireVerified(locals.user);
		const form = await request.formData();
		const deps = authDeps();
		const result = await voteOnSource(deps, {
			sourceId: String(form.get('sourceId') ?? ''),
			user,
			value: Number(form.get('value'))
		});
		if (!result.ok) return fail(400, { action: 'vote', error: result.error });
		// a vote can complete the quorum - check immediately (R12)
		await evaluateFact(deps, params.id);
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
	}
};
