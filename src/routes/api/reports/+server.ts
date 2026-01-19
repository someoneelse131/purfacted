import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createReport,
	getReports,
	getUserReports,
	REPORT_REASONS,
	ReportError
} from '$lib/server/services/report';

/**
 * GET /api/reports - Get reports (for moderators) or user's own reports
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		// Check if user is moderator
		const isModerator = locals.user.userType === 'MODERATOR';
		const myReports = url.searchParams.get('my') === 'true';

		if (myReports || !isModerator) {
			// Get user's own reports
			const reports = await getUserReports(locals.user.id);
			return json({
				success: true,
				data: {
					reports: reports.map((r) => ({
						id: r.id,
						contentType: r.contentType,
						contentId: r.contentId,
						reason: r.reason,
						status: r.status,
						resolution: r.resolution,
						createdAt: r.createdAt,
						resolvedAt: r.resolvedAt
					}))
				}
			});
		}

		// Moderator: get all reports
		const status = url.searchParams.get('status') as any;
		const contentType = url.searchParams.get('contentType') as any;
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '20');

		const result = await getReports({
			status: status || undefined,
			contentType: contentType || undefined,
			page,
			limit
		});

		return json({
			success: true,
			data: {
				reports: result.reports.map((r) => ({
					id: r.id,
					reporter: r.reporter,
					contentType: r.contentType,
					contentId: r.contentId,
					reason: r.reason,
					details: r.details,
					status: r.status,
					reviewedBy: r.reviewedBy,
					resolution: r.resolution,
					createdAt: r.createdAt,
					resolvedAt: r.resolvedAt
				})),
				total: result.total,
				page,
				limit
			}
		});
	} catch (err) {
		console.error('Error fetching reports:', err);
		throw error(500, 'Failed to fetch reports');
	}
};

/**
 * POST /api/reports - Create a new report
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	if (!locals.user.emailVerified) {
		throw error(403, 'Please verify your email before reporting content');
	}

	try {
		const body = await request.json();

		if (!body.contentType) {
			throw error(400, 'Content type is required');
		}

		if (!body.contentId) {
			throw error(400, 'Content ID is required');
		}

		if (!body.reason) {
			throw error(400, 'Reason is required');
		}

		const report = await createReport(locals.user.id, {
			contentType: body.contentType,
			contentId: body.contentId,
			reason: body.reason,
			details: body.details
		});

		return json({
			success: true,
			data: {
				id: report.id,
				status: report.status,
				message: 'Report submitted successfully. Our moderators will review it.'
			}
		});
	} catch (err) {
		if (err instanceof ReportError) {
			if (err.code === 'CONTENT_NOT_FOUND') {
				throw error(404, err.message);
			}
			if (err.code === 'ALREADY_REPORTED') {
				throw error(409, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error creating report:', err);
		throw error(500, 'Failed to submit report');
	}
};
