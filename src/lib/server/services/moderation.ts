import type { Report, ReportTargetType } from '@prisma/client';
import { getAppSecret } from '../app-secret';
import type { AuthDeps } from './auth/session';
import { getConfigNumber } from './config';
import { hitRateLimit } from './rate-limit';
import { removeSourceAsMisleading } from './facts/evidence';
import { enqueueEmail } from './email/queue';
import { renderNotificationEmail } from './email/templates';
import { createUnsubscribeToken } from './email/unsubscribe';
import { createNotification } from './notifications';

// Reporting + moderation queue (R17). One queue handles content reports and
// (via the categories service) category proposals; every moderator action
// lands in the append-only audit log.

export type ModResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

export const REPORT_REASONS = ['spam', 'misinformation', 'harassment', 'other'] as const;

async function targetExists(
	deps: AuthDeps,
	targetType: ReportTargetType,
	targetId: string
): Promise<boolean> {
	switch (targetType) {
		case 'FACT':
			return (await deps.prisma.fact.count({ where: { id: targetId, deletedAt: null } })) > 0;
		case 'SOURCE':
			return (await deps.prisma.source.count({ where: { id: targetId, status: 'ACTIVE' } })) > 0;
		case 'COMMENT':
			return (await deps.prisma.comment.count({ where: { id: targetId, deletedAt: null } })) > 0;
		case 'USER':
			return (await deps.prisma.user.count({ where: { id: targetId, deletedAt: null } })) > 0;
	}
}

export async function submitReport(
	deps: AuthDeps,
	input: {
		targetType: ReportTargetType;
		targetId: string;
		reporterId: string;
		reason: string;
		detail?: string;
	}
): Promise<ModResult<Report>> {
	if (!REPORT_REASONS.includes(input.reason as (typeof REPORT_REASONS)[number])) {
		return { ok: false, error: 'Choose a valid reason.' };
	}
	if (!(await targetExists(deps, input.targetType, input.targetId))) {
		return { ok: false, error: 'Reported content not found.' };
	}
	const detailMax = await getConfigNumber(deps, 'moderation.report_detail_max');
	const detail = input.detail?.trim() || null;
	if (detail && detail.length > detailMax) {
		return { ok: false, error: `Details must be at most ${detailMax} characters.` };
	}
	const existing = await deps.prisma.report.findFirst({
		where: {
			targetType: input.targetType,
			targetId: input.targetId,
			reporterId: input.reporterId,
			status: 'OPEN'
		}
	});
	if (existing) return { ok: false, error: 'You already reported this.' };

	const maxPerDay = await getConfigNumber(deps, 'moderation.report_max_per_day');
	const limit = await hitRateLimit(deps.redis, `report:${input.reporterId}`, maxPerDay, 86_400);
	if (!limit.allowed) return { ok: false, error: 'Report limit reached. Try again tomorrow.' };

	const report = await deps.prisma.report.create({
		data: {
			targetType: input.targetType,
			targetId: input.targetId,
			reporterId: input.reporterId,
			reason: input.reason,
			detail
		}
	});
	return { ok: true, data: report };
}

export async function logAction(
	deps: AuthDeps,
	moderatorId: string,
	action: string,
	targetType: string,
	targetId: string,
	detail?: string
): Promise<void> {
	await deps.prisma.moderationAction.create({
		data: { moderatorId, action, targetType, targetId, detail }
	});
}

export async function claimReport(
	deps: AuthDeps,
	input: { reportId: string; moderatorId: string }
): Promise<ModResult> {
	const claimed = await deps.prisma.report.updateMany({
		where: { id: input.reportId, status: 'OPEN', claimedById: null },
		data: { claimedById: input.moderatorId }
	});
	if (claimed.count === 0) {
		return { ok: false, error: 'Report is already claimed or resolved.' };
	}
	await logAction(deps, input.moderatorId, 'claim_report', 'REPORT', input.reportId);
	return { ok: true, data: null };
}

async function removeTarget(
	deps: AuthDeps,
	targetType: ReportTargetType,
	targetId: string
): Promise<void> {
	switch (targetType) {
		case 'SOURCE':
			await removeSourceAsMisleading(deps, { sourceId: targetId });
			break;
		case 'COMMENT':
			await deps.prisma.comment.updateMany({
				where: { id: targetId },
				data: { deletedAt: new Date() }
			});
			break;
		case 'FACT':
			await deps.prisma.fact.updateMany({
				where: { id: targetId },
				data: { deletedAt: new Date() }
			});
			break;
		case 'USER':
			// account sanctions are the ban system's job (R18)
			break;
	}
}

async function notifyReporter(
	deps: AuthDeps,
	report: Report,
	outcome: 'removed' | 'dismissed'
): Promise<void> {
	const reporter = await deps.prisma.user.findUnique({ where: { id: report.reporterId } });
	if (!reporter || !reporter.notifyEmail || !reporter.emailVerifiedAt) return;
	const unsubscribeToken = createUnsubscribeToken(reporter.id, 'moderation', getAppSecret());
	const origin = process.env.ORIGIN ?? 'http://localhost:3000';
	const outcomeText =
		outcome === 'removed'
			? 'the reported content was removed.'
			: 'no action was taken on the reported content.';
	const rendered = renderNotificationEmail({
		username: reporter.username,
		subject: 'Your report was reviewed',
		bodyHtml: `<p>Thanks for helping keep PurFacted clean: ${outcomeText}</p>`,
		bodyText: `Thanks for helping keep PurFacted clean: ${outcomeText}`,
		unsubscribeUrl: `${origin}/unsubscribe/${unsubscribeToken}`
	});
	await enqueueEmail(deps.redis, { to: reporter.email, ...rendered });
}

export async function resolveReport(
	deps: AuthDeps,
	input: { reportId: string; moderatorId: string; outcome: 'removed' | 'dismissed' }
): Promise<ModResult> {
	const report = await deps.prisma.report.findUnique({ where: { id: input.reportId } });
	if (!report || report.status !== 'OPEN') {
		return { ok: false, error: 'Report not found or already resolved.' };
	}

	// claim OPEN -> resolved atomically BEFORE touching the target, so two
	// moderators can never both resolve (and remove) the same report
	const claimed = await deps.prisma.report.updateMany({
		where: { id: report.id, status: 'OPEN' },
		data: {
			status: input.outcome === 'removed' ? 'RESOLVED' : 'DISMISSED',
			resolvedAt: new Date(),
			resolvedById: input.moderatorId
		}
	});
	if (claimed.count === 0) {
		return { ok: false, error: 'Another moderator already resolved this report.' };
	}

	if (input.outcome === 'removed') {
		await removeTarget(deps, report.targetType, report.targetId);
	}
	await logAction(
		deps,
		input.moderatorId,
		`resolve_report_${input.outcome}`,
		report.targetType,
		report.targetId,
		report.reason
	);
	await notifyReporter(deps, report, input.outcome);
	// in-app notification to the reporter (R32); link to the fact when the
	// report targeted one (or the fact a removed source/comment belonged to)
	await createNotification(deps, {
		userId: report.reporterId,
		type: 'moderation_outcome',
		actorId: input.moderatorId,
		factId: report.targetType === 'FACT' ? report.targetId : null,
		subjectId: report.id,
		payload: { outcome: input.outcome }
	});
	return { ok: true, data: null };
}

export interface QueueReport {
	id: string;
	targetType: ReportTargetType;
	targetId: string;
	reason: string;
	detail: string | null;
	reporter: string;
	claimedBy: string | null;
	createdAt: Date;
	targetPreview: string;
}

export interface ReportQueuePage {
	entries: QueueReport[];
	page: number;
	pageSize: number;
	total: number;
	totalPages: number;
}

export async function listOpenReports(deps: AuthDeps, pageParam = 1): Promise<ReportQueuePage> {
	const pageSize = await getConfigNumber(deps, 'moderation.queue_page_size');
	const page = Math.max(1, pageParam);
	const total = await deps.prisma.report.count({ where: { status: 'OPEN' } });
	const reports = await deps.prisma.report.findMany({
		where: { status: 'OPEN' },
		orderBy: { createdAt: 'asc' },
		skip: (page - 1) * pageSize,
		take: pageSize
	});
	const userIds = [
		...new Set(reports.flatMap((r) => [r.reporterId, ...(r.claimedById ? [r.claimedById] : [])]))
	];
	const users = await deps.prisma.user.findMany({
		where: { id: { in: userIds } },
		select: { id: true, username: true }
	});
	const usernames = new Map(users.map((u) => [u.id, u.username]));

	const previews = new Map<string, string>();
	for (const report of reports) {
		previews.set(report.id, await previewOf(deps, report.targetType, report.targetId));
	}

	return {
		entries: reports.map((report) => ({
			id: report.id,
			targetType: report.targetType,
			targetId: report.targetId,
			reason: report.reason,
			detail: report.detail,
			reporter: usernames.get(report.reporterId) ?? 'unknown',
			claimedBy: report.claimedById ? (usernames.get(report.claimedById) ?? 'unknown') : null,
			createdAt: report.createdAt,
			targetPreview: previews.get(report.id) ?? ''
		})),
		page,
		pageSize,
		total,
		totalPages: Math.max(1, Math.ceil(total / pageSize))
	};
}

async function previewOf(
	deps: AuthDeps,
	targetType: ReportTargetType,
	targetId: string
): Promise<string> {
	switch (targetType) {
		case 'FACT': {
			const fact = await deps.prisma.fact.findUnique({ where: { id: targetId } });
			return fact ? fact.title : '[gone]';
		}
		case 'SOURCE': {
			const source = await deps.prisma.source.findUnique({ where: { id: targetId } });
			return source ? `${source.title} (${source.url})` : '[gone]';
		}
		case 'COMMENT': {
			const comment = await deps.prisma.comment.findUnique({ where: { id: targetId } });
			return comment ? comment.body.slice(0, 120) : '[gone]';
		}
		case 'USER': {
			const user = await deps.prisma.user.findUnique({ where: { id: targetId } });
			return user ? `@${user.username}` : '[gone]';
		}
	}
}

export async function listActionLog(deps: AuthDeps, take = 20) {
	const actions = await deps.prisma.moderationAction.findMany({
		orderBy: { createdAt: 'desc' },
		take
	});
	const moderatorIds = [...new Set(actions.map((a) => a.moderatorId))];
	const moderators = await deps.prisma.user.findMany({
		where: { id: { in: moderatorIds } },
		select: { id: true, username: true }
	});
	const names = new Map(moderators.map((m) => [m.id, m.username]));
	return actions.map((action) => ({
		id: action.id,
		moderator: names.get(action.moderatorId) ?? 'unknown',
		action: action.action,
		targetType: action.targetType,
		detail: action.detail,
		createdAt: action.createdAt
	}));
}
