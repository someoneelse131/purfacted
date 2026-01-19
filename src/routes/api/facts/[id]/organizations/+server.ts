import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	tagOrganization,
	getFactOrganizations,
	disputeFact,
	postOfficialComment,
	getFactOfficialComments,
	addOrgSource,
	OrgCommentError
} from '$lib/server/services/organizationComment';

/**
 * GET /api/facts/:id/organizations - Get organizations tagged in a fact
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const [organizations, officialComments] = await Promise.all([
			getFactOrganizations(params.id),
			getFactOfficialComments(params.id)
		]);

		return json({
			success: true,
			data: {
				organizations: organizations.map((o) => ({
					id: o.id,
					orgUser: o.orgUser,
					taggedBy: o.taggedBy,
					isDisputed: o.isDisputed,
					createdAt: o.createdAt
				})),
				officialComments: officialComments.map((c) => ({
					id: c.id,
					orgUser: c.orgUser,
					body: c.body,
					createdAt: c.createdAt,
					updatedAt: c.updatedAt
				}))
			}
		});
	} catch (err) {
		console.error('Error fetching organizations:', err);
		throw error(500, 'Failed to fetch organizations');
	}
};

/**
 * POST /api/facts/:id/organizations - Tag an organization or post official comment
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		const body = await request.json();

		// Tag organization
		if (body.action === 'tag') {
			if (!body.orgUserId) {
				throw error(400, 'Organization user ID is required');
			}

			const tag = await tagOrganization(params.id, body.orgUserId, locals.user.id);

			return json({
				success: true,
				data: {
					id: tag.id,
					message: 'Organization tagged successfully'
				}
			});
		}

		// Dispute fact (org only)
		if (body.action === 'dispute') {
			if (locals.user.userType !== 'ORGANIZATION') {
				throw error(403, 'Only organizations can dispute facts');
			}

			const tag = await disputeFact(locals.user.id, params.id);

			return json({
				success: true,
				data: {
					id: tag.id,
					message: 'Fact disputed. It will be reviewed by moderators.'
				}
			});
		}

		// Post official comment (org only)
		if (body.action === 'comment') {
			if (locals.user.userType !== 'ORGANIZATION') {
				throw error(403, 'Only organizations can post official comments');
			}

			if (!body.body) {
				throw error(400, 'Comment body is required');
			}

			const comment = await postOfficialComment(locals.user.id, params.id, body.body);

			return json({
				success: true,
				data: {
					id: comment.id,
					message: 'Official comment posted successfully'
				}
			});
		}

		// Add source (org only)
		if (body.action === 'addSource') {
			if (locals.user.userType !== 'ORGANIZATION') {
				throw error(403, 'Only organizations can add sources');
			}

			if (!body.url) {
				throw error(400, 'Source URL is required');
			}

			await addOrgSource(locals.user.id, params.id, body.url, body.title);

			return json({
				success: true,
				data: {
					message: 'Source added successfully'
				}
			});
		}

		throw error(400, 'Action must be "tag", "dispute", "comment", or "addSource"');
	} catch (err) {
		if (err instanceof OrgCommentError) {
			if (err.code === 'FACT_NOT_FOUND' || err.code === 'ORG_NOT_FOUND') {
				throw error(404, err.message);
			}
			if (err.code === 'NOT_ORGANIZATION') {
				throw error(403, err.message);
			}
			if (err.code === 'ALREADY_TAGGED') {
				throw error(409, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error processing organization action:', err);
		throw error(500, 'Failed to process request');
	}
};
