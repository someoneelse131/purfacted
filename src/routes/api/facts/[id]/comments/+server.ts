import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createComment,
	getFactComments,
	CommentError
} from '$lib/server/services/comment';

/**
 * GET /api/facts/:id/comments - Get comments for a fact
 */
export const GET: RequestHandler = async ({ params, url }) => {
	try {
		const sortBy = url.searchParams.get('sortBy') as 'newest' | 'oldest' | 'votes' | null;
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '20');
		const includeReplies = url.searchParams.get('includeReplies') !== 'false';

		const result = await getFactComments(params.id, {
			sortBy: sortBy || 'newest',
			page,
			limit,
			includeReplies
		});

		return json({
			success: true,
			data: {
				comments: result.comments.map(formatComment),
				total: result.total,
				page,
				limit
			}
		});
	} catch (err) {
		console.error('Error fetching comments:', err);
		throw error(500, 'Failed to fetch comments');
	}
};

/**
 * POST /api/facts/:id/comments - Create a new comment
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	// Check authentication
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	// Check email verification
	if (!locals.user.emailVerified) {
		throw error(403, 'Please verify your email before commenting');
	}

	try {
		const body = await request.json();

		if (!body.body) {
			throw error(400, 'Comment body is required');
		}

		const comment = await createComment(locals.user.id, {
			factId: params.id,
			body: body.body,
			parentId: body.parentId || null
		});

		return json({
			success: true,
			data: {
				id: comment.id,
				parentId: comment.parentId,
				message: comment.parentId ? 'Reply posted successfully' : 'Comment posted successfully'
			}
		});
	} catch (err) {
		if (err instanceof CommentError) {
			if (err.code === 'FACT_NOT_FOUND' || err.code === 'PARENT_NOT_FOUND') {
				throw error(404, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error creating comment:', err);
		throw error(500, 'Failed to create comment');
	}
};

function formatComment(c: any): any {
	return {
		id: c.id,
		body: c.body,
		parentId: c.parentId,
		user: c.user,
		voteCount: c._count?.votes || 0,
		replyCount: c._count?.replies || 0,
		voteSummary: c.voteSummary,
		replies: c.replies?.map(formatComment) || [],
		createdAt: c.createdAt,
		updatedAt: c.updatedAt
	};
}
