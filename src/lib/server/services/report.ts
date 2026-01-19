import { db } from '../db';
import type { Report, ContentType, ReportStatus } from '@prisma/client';

// ============================================
// Types
// ============================================

export interface CreateReportInput {
	contentType: ContentType;
	contentId: string;
	reason: string;
	details?: string;
}

export interface ReportWithDetails extends Report {
	reporter: {
		id: string;
		firstName: string;
		lastName: string;
	};
	reviewedBy?: {
		id: string;
		firstName: string;
		lastName: string;
	} | null;
}

// ============================================
// Error Handling
// ============================================

export class ReportError extends Error {
	code: string;

	constructor(message: string, code: string) {
		super(message);
		this.name = 'ReportError';
		this.code = code;
	}
}

// ============================================
// Report Reasons
// ============================================

export const REPORT_REASONS = [
	'Harassment or bullying',
	'Spam or misleading',
	'Hate speech',
	'Misinformation',
	'Violence or threats',
	'Copyright violation',
	'Personal information exposure',
	'Other'
];

// ============================================
// Reporting
// ============================================

/**
 * Create a new report
 */
export async function createReport(
	reporterId: string,
	input: CreateReportInput
): Promise<Report> {
	// Validate content exists
	const contentExists = await verifyContentExists(input.contentType, input.contentId);
	if (!contentExists) {
		throw new ReportError('Content not found', 'CONTENT_NOT_FOUND');
	}

	// Check for duplicate report
	const existingReport = await db.report.findFirst({
		where: {
			reporterId,
			contentType: input.contentType,
			contentId: input.contentId,
			status: { in: ['PENDING', 'REVIEWING'] }
		}
	});

	if (existingReport) {
		throw new ReportError(
			'You have already reported this content',
			'ALREADY_REPORTED'
		);
	}

	return db.report.create({
		data: {
			reporterId,
			contentType: input.contentType,
			contentId: input.contentId,
			reason: input.reason,
			details: input.details || null
		}
	});
}

/**
 * Verify content exists based on type
 */
async function verifyContentExists(
	contentType: ContentType,
	contentId: string
): Promise<boolean> {
	let content: any = null;

	switch (contentType) {
		case 'FACT':
			content = await db.fact.findUnique({ where: { id: contentId } });
			break;
		case 'DISCUSSION':
			content = await db.discussion.findUnique({ where: { id: contentId } });
			break;
		case 'COMMENT':
			content = await db.comment.findUnique({ where: { id: contentId } });
			break;
		case 'DEBATE':
			content = await db.debate.findUnique({ where: { id: contentId } });
			break;
		case 'USER':
			content = await db.user.findUnique({ where: { id: contentId } });
			break;
	}

	return content !== null;
}

/**
 * Get report by ID
 */
export async function getReportById(reportId: string): Promise<ReportWithDetails | null> {
	return db.report.findUnique({
		where: { id: reportId },
		include: {
			reporter: {
				select: { id: true, firstName: true, lastName: true }
			},
			reviewedBy: {
				select: { id: true, firstName: true, lastName: true }
			}
		}
	});
}

/**
 * Get reports for moderation queue
 */
export async function getReports(options?: {
	status?: ReportStatus;
	contentType?: ContentType;
	page?: number;
	limit?: number;
}): Promise<{ reports: ReportWithDetails[]; total: number }> {
	const page = options?.page || 1;
	const limit = Math.min(options?.limit || 20, 50);
	const skip = (page - 1) * limit;

	const where: any = {};

	if (options?.status) {
		where.status = options.status;
	}

	if (options?.contentType) {
		where.contentType = options.contentType;
	}

	const [reports, total] = await Promise.all([
		db.report.findMany({
			where,
			include: {
				reporter: {
					select: { id: true, firstName: true, lastName: true }
				},
				reviewedBy: {
					select: { id: true, firstName: true, lastName: true }
				}
			},
			orderBy: { createdAt: 'desc' },
			skip,
			take: limit
		}),
		db.report.count({ where })
	]);

	return { reports, total };
}

/**
 * Assign report to moderator for review
 */
export async function assignReport(
	reportId: string,
	moderatorId: string
): Promise<Report> {
	const report = await db.report.findUnique({
		where: { id: reportId }
	});

	if (!report) {
		throw new ReportError('Report not found', 'REPORT_NOT_FOUND');
	}

	if (report.status !== 'PENDING') {
		throw new ReportError('Report is already being reviewed', 'ALREADY_ASSIGNED');
	}

	return db.report.update({
		where: { id: reportId },
		data: {
			status: 'REVIEWING',
			reviewedById: moderatorId
		}
	});
}

/**
 * Resolve a report
 */
export async function resolveReport(
	reportId: string,
	moderatorId: string,
	resolution: string,
	dismiss: boolean = false
): Promise<Report> {
	const report = await db.report.findUnique({
		where: { id: reportId }
	});

	if (!report) {
		throw new ReportError('Report not found', 'REPORT_NOT_FOUND');
	}

	if (report.status === 'RESOLVED' || report.status === 'DISMISSED') {
		throw new ReportError('Report has already been resolved', 'ALREADY_RESOLVED');
	}

	return db.report.update({
		where: { id: reportId },
		data: {
			status: dismiss ? 'DISMISSED' : 'RESOLVED',
			reviewedById: moderatorId,
			resolution,
			resolvedAt: new Date()
		}
	});
}

/**
 * Get reports made by a user
 */
export async function getUserReports(userId: string): Promise<Report[]> {
	return db.report.findMany({
		where: { reporterId: userId },
		orderBy: { createdAt: 'desc' }
	});
}

/**
 * Get report count for content
 */
export async function getContentReportCount(
	contentType: ContentType,
	contentId: string
): Promise<number> {
	return db.report.count({
		where: {
			contentType,
			contentId,
			status: { in: ['PENDING', 'REVIEWING', 'RESOLVED'] }
		}
	});
}
