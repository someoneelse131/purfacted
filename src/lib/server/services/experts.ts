import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { ExpertApplication } from '@prisma/client';
import type { AuthDeps } from './auth/session';
import { getConfigNumber } from './config';
import { expertBadgeKey } from './badges';
import { createNotification } from './notifications';
import { logAction } from './moderation';

// Expert verification (R34). A verified user applies with a credential file
// (PDF/image, stored OUTSIDE the web root), a field/specialty description and
// the categories they claim expertise in. A moderator approves (-> role EXPERT
// + ExpertCategory rows + an "Expert: <field>" badge) or rejects with a note.
// R9 getVoteWeight already grants the 3x weight only inside the granted
// categories, so this requirement is the application + review flow plus the
// role flip. Admins can revoke; re-verification is just a fresh application.

export type ExpertResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

// Allowed credential MIME types: PDF and common image formats.
export const EXPERT_CREDENTIAL_MIMES = [
	'application/pdf',
	'image/png',
	'image/jpeg',
	'image/webp'
] as const;

const MIME_EXTENSION: Record<string, string> = {
	'application/pdf': 'pdf',
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp'
};

// Pure: file extension for a validated credential MIME (no leading dot).
export function extensionForMime(mime: string): string {
	return MIME_EXTENSION[mime] ?? 'bin';
}

// Pure: validate the chosen field text. Returns the trimmed value or an error.
export function validateField(
	field: string,
	min: number,
	max: number
): { ok: true; value: string } | { ok: false; error: string } {
	const value = field.trim();
	if (value.length < min)
		return { ok: false, error: `Describe your field in at least ${min} characters.` };
	if (value.length > max) return { ok: false, error: `Keep your field under ${max} characters.` };
	return { ok: true, value };
}

// Pure: validate an uploaded credential's MIME and size. null = ok.
export function validateCredential(mime: string, size: number, maxBytes: number): string | null {
	if (!EXPERT_CREDENTIAL_MIMES.includes(mime as (typeof EXPERT_CREDENTIAL_MIMES)[number])) {
		return 'Upload a PDF or image (PNG, JPEG, WebP).';
	}
	if (size <= 0) return 'The credential file is empty.';
	if (size > maxBytes) {
		return `The credential must be at most ${Math.floor(maxBytes / 1_000_000)} MB.`;
	}
	return null;
}

// Credential files live OUTSIDE the web root (never under static/ or build/).
// Overridable for prod via EXPERT_UPLOAD_DIR.
export function credentialDir(): string {
	return process.env.EXPERT_UPLOAD_DIR ?? join(process.cwd(), 'uploads', 'credentials');
}

export interface ApplyInput {
	userId: string;
	field: string;
	categoryIds: string[];
	credential: { bytes: Buffer; mime: string };
}

export async function applyForExpert(
	deps: AuthDeps,
	input: ApplyInput
): Promise<ExpertResult<ExpertApplication>> {
	const user = await deps.prisma.user.findUnique({ where: { id: input.userId } });
	if (!user || user.deletedAt) return { ok: false, error: 'Account not found.' };
	if (!user.emailVerifiedAt) return { ok: false, error: 'Verify your email address first.' };
	if (user.bannedUntil && user.bannedUntil > new Date()) {
		return { ok: false, error: 'Banned accounts cannot apply.' };
	}
	if (user.role === 'ORGANIZATION') {
		return { ok: false, error: 'Organization accounts cannot apply for expert status.' };
	}

	// one open application at a time; re-verification waits for a decision
	const pending = await deps.prisma.expertApplication.count({
		where: { userId: input.userId, status: 'PENDING' }
	});
	if (pending > 0) return { ok: false, error: 'You already have a pending application.' };

	const [fieldMin, fieldMax, maxBytes] = await Promise.all([
		getConfigNumber(deps, 'expert.field_min'),
		getConfigNumber(deps, 'expert.field_max'),
		getConfigNumber(deps, 'expert.credential_max_bytes')
	]);

	const field = validateField(input.field, fieldMin, fieldMax);
	if (!field.ok) return { ok: false, error: field.error };

	const credErr = validateCredential(
		input.credential.mime,
		input.credential.bytes.length,
		maxBytes
	);
	if (credErr) return { ok: false, error: credErr };

	// chosen categories must be distinct, existing and ACTIVE
	const categoryIds = [...new Set(input.categoryIds.filter(Boolean))];
	if (categoryIds.length === 0) return { ok: false, error: 'Choose at least one category.' };
	const validCount = await deps.prisma.category.count({
		where: { id: { in: categoryIds }, status: 'ACTIVE' }
	});
	if (validCount !== categoryIds.length) {
		return { ok: false, error: 'One or more chosen categories are invalid.' };
	}

	// write the credential to disk under a random, non-guessable basename
	const dir = credentialDir();
	await mkdir(dir, { recursive: true });
	const credentialFile = `${randomBytes(24).toString('hex')}.${extensionForMime(input.credential.mime)}`;
	await writeFile(join(dir, credentialFile), input.credential.bytes, { mode: 0o600 });

	const application = await deps.prisma.expertApplication.create({
		data: {
			userId: input.userId,
			field: field.value,
			requestedCategoryIds: categoryIds,
			credentialFile,
			credentialMime: input.credential.mime
		}
	});

	return { ok: true, data: application };
}

export interface ExpertApplicationView {
	id: string;
	field: string;
	applicant: string;
	applicantId: string;
	categories: { id: string; name: string }[];
	credentialMime: string;
	createdAt: Date;
}

// Pending applications for the moderation queue, with applicant + category names.
export async function listExpertApplications(deps: AuthDeps): Promise<ExpertApplicationView[]> {
	const apps = await deps.prisma.expertApplication.findMany({
		where: { status: 'PENDING' },
		orderBy: { createdAt: 'asc' }
	});
	const userIds = [...new Set(apps.map((a) => a.userId))];
	const categoryIds = [...new Set(apps.flatMap((a) => a.requestedCategoryIds))];
	const [users, categories] = await Promise.all([
		deps.prisma.user.findMany({
			where: { id: { in: userIds } },
			select: { id: true, username: true }
		}),
		deps.prisma.category.findMany({
			where: { id: { in: categoryIds } },
			select: { id: true, name: true }
		})
	]);
	const usernames = new Map(users.map((u) => [u.id, u.username]));
	const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
	return apps.map((a) => ({
		id: a.id,
		field: a.field,
		applicant: usernames.get(a.userId) ?? 'unknown',
		applicantId: a.userId,
		categories: a.requestedCategoryIds.map((id) => ({
			id,
			name: categoryNames.get(id) ?? '[removed]'
		})),
		credentialMime: a.credentialMime,
		createdAt: a.createdAt
	}));
}

// Resolve a credential to an absolute path + MIME for the moderator-only
// download route. basename() defends against any path traversal in the stored
// value. Returns null if the application or the file is gone.
export async function getCredentialFile(
	deps: AuthDeps,
	applicationId: string
): Promise<{ absPath: string; mime: string } | null> {
	const app = await deps.prisma.expertApplication.findUnique({ where: { id: applicationId } });
	if (!app) return null;
	const absPath = join(credentialDir(), basename(app.credentialFile));
	if (!existsSync(absPath)) return null;
	return { absPath, mime: app.credentialMime };
}

export async function readCredential(absPath: string): Promise<Buffer> {
	return readFile(absPath);
}

// Applications belonging to a user (own status view), newest first.
export async function listOwnApplications(deps: AuthDeps, userId: string) {
	return deps.prisma.expertApplication.findMany({
		where: { userId },
		orderBy: { createdAt: 'desc' }
	});
}

export interface ReviewInput {
	applicationId: string;
	moderatorId: string;
	decision: 'approve' | 'reject';
	note?: string;
}

export async function reviewExpertApplication(
	deps: AuthDeps,
	input: ReviewInput
): Promise<ExpertResult> {
	const app = await deps.prisma.expertApplication.findUnique({
		where: { id: input.applicationId }
	});
	if (!app || app.status !== 'PENDING') {
		return { ok: false, error: 'Application not found or already reviewed.' };
	}

	const note = input.note?.trim() || null;
	const status = input.decision === 'approve' ? 'APPROVED' : 'REJECTED';

	// claim PENDING -> decided atomically so two moderators can't both act
	const claimed = await deps.prisma.expertApplication.updateMany({
		where: { id: app.id, status: 'PENDING' },
		data: { status, note, reviewedById: input.moderatorId, reviewedAt: new Date() }
	});
	if (claimed.count === 0) {
		return { ok: false, error: 'Another moderator already reviewed this application.' };
	}

	if (input.decision === 'approve') {
		// only grant categories that still exist and are ACTIVE
		const validCategories = await deps.prisma.category.findMany({
			where: { id: { in: app.requestedCategoryIds }, status: 'ACTIVE' },
			select: { id: true }
		});
		await deps.prisma.$transaction([
			deps.prisma.user.update({ where: { id: app.userId }, data: { role: 'EXPERT' } }),
			deps.prisma.expertCategory.createMany({
				data: validCategories.map((c) => ({ userId: app.userId, categoryId: c.id })),
				skipDuplicates: true
			})
		]);
		// "Expert: <field>" badge (R34/R22); idempotent on re-verification
		try {
			await deps.prisma.userBadge.create({
				data: { userId: app.userId, badge: expertBadgeKey(app.field) }
			});
		} catch (err) {
			if (
				!(
					typeof err === 'object' &&
					err !== null &&
					'code' in err &&
					(err as { code?: string }).code === 'P2002'
				)
			) {
				throw err;
			}
		}
	}

	await logAction(
		deps,
		input.moderatorId,
		input.decision === 'approve' ? 'approve_expert' : 'reject_expert',
		'EXPERT_APPLICATION',
		app.id,
		app.field
	);
	await createNotification(deps, {
		userId: app.userId,
		type: input.decision === 'approve' ? 'expert_approved' : 'expert_rejected',
		actorId: input.moderatorId,
		subjectId: app.id,
		payload: { field: app.field, note }
	});

	return { ok: true, data: null };
}

// Admin revokes expert status: role back to VERIFIED, drop ExpertCategory
// grants and the expert badge(s). Logged. Idempotent.
export async function revokeExpert(
	deps: AuthDeps,
	input: { userId: string; adminId: string }
): Promise<ExpertResult> {
	const user = await deps.prisma.user.findUnique({ where: { id: input.userId } });
	if (!user) return { ok: false, error: 'User not found.' };
	if (user.role !== 'EXPERT') return { ok: false, error: 'User is not an expert.' };

	await deps.prisma.$transaction([
		deps.prisma.user.update({ where: { id: input.userId }, data: { role: 'VERIFIED' } }),
		deps.prisma.expertCategory.deleteMany({ where: { userId: input.userId } }),
		deps.prisma.userBadge.deleteMany({
			where: { userId: input.userId, badge: { startsWith: 'expert:' } }
		})
	]);
	await logAction(deps, input.adminId, 'revoke_expert', 'USER', input.userId);
	return { ok: true, data: null };
}
