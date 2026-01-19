import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getCommentById,
	updateComment,
	deleteComment,
	getUserCommentVote,
	getCommentReplies,
	CommentError
} from '$lib/server/services/comment';

/**
 * GET /api/comments/:id - Get comment details
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
	try {
		const comment = await getCommentById(params.id);

		if (!comment) {
			throw error(404, 'Comment not found');
		}

		// Get user's vote if authenticated
		let userVote = null;
		if (locals.user) {
			userVote = await getUserCommentVote(locals.user.id, params.id);
		}

		// Optionally include replies
		const includeReplies = url.searchParams.get('includeReplies') === 'true';
		let replies = undefined;
		if (includeReplies && comment._count.replies > 0) {
			replies = await getCommentReplies(params.id);
		}

		return json({
			success: true,
			data: {
				id: comment.id,
				factId: comment.factId,
				parentId: comment.parentId,
				body: comment.body,
				user: comment.user,
				voteSummary: comment.voteSummary,
				replyCount: comment._count.replies,
				replies: replies?.map(formatComment),
				userVote: userVote ? { value: userVote.value } : null,
				createdAt: comment.createdAt,
				updatedAt: comment.updatedAt
			}
		});
	} catch (err) {
		if ((err as any).status === 404) {
			throw err;
		}
		console.error('Error fetching comment:', err);
		throw error(500, 'Failed to fetch comment');
	}
};

/**
 * PATCH /api/comments/:id - Update a comment
 */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	// Check authentication
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		const body = await request.json();

		if (!body.body) {
			throw error(400, 'Comment body is required');
		}

		const comment = await updateComment(locals.user.id, params.id, body.body);

		return json({
			success: true,
			data: {
				id: comment.id,
				body: comment.body,
				updatedAt: comment.updatedAt,
				message: 'Comment updated successfully'
			}
		});
	} catch (err) {
		if (err instanceof CommentError) {
			if (err.code === 'COMMENT_NOT_FOUND') {
				throw error(404, err.message);
			}
			if (err.code === 'NOT_AUTHOR') {
				throw error(403, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error updating comment:', err);
		throw error(500, 'Failed to update comment');
	}
};

/**
 * DELETE /api/comments/:id - Delete a comment
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	// Check authentication
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		await deleteComment(locals.user.id, params.id);

		return json({
			success: true,
			data: {
				message: 'Comment deleted successfully'
			}
		});
	} catch (err) {
		if (err instanceof CommentError) {
			if (err.code === 'COMMENT_NOT_FOUND') {
				throw error(404, err.message);
			}
			if (err.code === 'NOT_AUTHOR') {
				throw error(403, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error deleting comment:', err);
		throw error(500, 'Failed to delete comment');
	}
};

function formatComment(c: any): any {
	return {
		id: c.id,
		body: c.body,
		parentId: c.parentId,
		user: c.user,
		voteSummary: c.voteSummary,
		replyCount: c._count?.replies || 0,
		replies: c.replies?.map(formatComment) || [],
		createdAt: c.createdAt,
		updatedAt: c.updatedAt
	};
}
