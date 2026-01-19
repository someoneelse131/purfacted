import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getReportById,
	assignReport,
	resolveReport,
	ReportError
} from '$lib/server/services/report';

/**
 * GET /api/reports/:id - Get report details (moderator only)
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	if (locals.user.userType !== 'MODERATOR') {
		throw error(403, 'Only moderators can view report details');
	}

	try {
		const report = await getReportById(params.id);

		if (!report) {
			throw error(404, 'Report not found');
		}

		return json({
			success: true,
			data: {
				id: report.id,
				reporter: report.reporter,
				contentType: report.contentType,
				contentId: report.contentId,
				reason: report.reason,
				details: report.details,
				status: report.status,
				reviewedBy: report.reviewedBy,
				resolution: report.resolution,
				createdAt: report.createdAt,
				resolvedAt: report.resolvedAt
			}
		});
	} catch (err) {
		if ((err as any).status) {
			throw err;
		}
		console.error('Error fetching report:', err);
		throw error(500, 'Failed to fetch report');
	}
};

/**
 * PATCH /api/reports/:id - Update report (assign, resolve, dismiss)
 */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	if (locals.user.userType !== 'MODERATOR') {
		throw error(403, 'Only moderators can manage reports');
	}

	try {
		const body = await request.json();

		let report;

		if (body.action === 'assign') {
			report = await assignReport(params.id, locals.user.id);
			return json({
				success: true,
				data: {
					id: report.id,
					status: report.status,
					message: 'Report assigned to you'
				}
			});
		}

		if (body.action === 'resolve' || body.action === 'dismiss') {
			if (!body.resolution) {
				throw error(400, 'Resolution is required');
			}

			report = await resolveReport(
				params.id,
				locals.user.id,
				body.resolution,
				body.action === 'dismiss'
			);

			return json({
				success: true,
				data: {
					id: report.id,
					status: report.status,
					message: body.action === 'dismiss' ? 'Report dismissed' : 'Report resolved'
				}
			});
		}

		throw error(400, 'Action must be "assign", "resolve", or "dismiss"');
	} catch (err) {
		if (err instanceof ReportError) {
			if (err.code === 'REPORT_NOT_FOUND') {
				throw error(404, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error updating report:', err);
		throw error(500, 'Failed to update report');
	}
};
