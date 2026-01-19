import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createDiscussion,
	getFactDiscussions,
	getFactDiscussionsByType,
	DiscussionError
} from '$lib/server/services/discussion';
import type { DiscussionType } from '@prisma/client';

/**
 * GET /api/facts/:id/discussions - Get discussions for a fact
 */
export const GET: RequestHandler = async ({ params, url }) => {
	try {
		const type = url.searchParams.get('type') as DiscussionType | null;
		const sortBy = url.searchParams.get('sortBy') as 'newest' | 'oldest' | 'votes' | null;
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '20');
		const grouped = url.searchParams.get('grouped') === 'true';

		// If grouped=true, return discussions grouped by type
		if (grouped) {
			const grouped = await getFactDiscussionsByType(params.id);
			return json({
				success: true,
				data: {
					pro: grouped.pro.map(formatDiscussion),
					contra: grouped.contra.map(formatDiscussion),
					neutral: grouped.neutral.map(formatDiscussion)
				}
			});
		}

		const result = await getFactDiscussions(params.id, {
			type: type || undefined,
			sortBy: sortBy || 'newest',
			page,
			limit
		});

		return json({
			success: true,
			data: {
				discussions: result.discussions.map(formatDiscussion),
				total: result.total,
				page,
				limit
			}
		});
	} catch (err) {
		console.error('Error fetching discussions:', err);
		throw error(500, 'Failed to fetch discussions');
	}
};

/**
 * POST /api/facts/:id/discussions - Create a new discussion
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	// Check authentication
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	// Check email verification
	if (!locals.user.emailVerified) {
		throw error(403, 'Please verify your email before posting discussions');
	}

	try {
		const body = await request.json();

		if (!body.type) {
			throw error(400, 'Discussion type is required (PRO, CONTRA, or NEUTRAL)');
		}

		if (!body.body) {
			throw error(400, 'Discussion body is required');
		}

		const discussion = await createDiscussion(locals.user.id, {
			factId: params.id,
			type: body.type,
			body: body.body
		});

		return json({
			success: true,
			data: {
				id: discussion.id,
				type: discussion.type,
				message: 'Discussion posted successfully'
			}
		});
	} catch (err) {
		if (err instanceof DiscussionError) {
			if (err.code === 'FACT_NOT_FOUND') {
				throw error(404, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error creating discussion:', err);
		throw error(500, 'Failed to create discussion');
	}
};

function formatDiscussion(d: any) {
	return {
		id: d.id,
		type: d.type,
		body: d.body,
		user: d.user,
		voteCount: d._count?.votes || 0,
		voteSummary: d.voteSummary,
		createdAt: d.createdAt,
		updatedAt: d.updatedAt
	};
}
