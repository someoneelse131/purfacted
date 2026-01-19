import { db } from '../db';
import type { FactEdit, FactEditStatus, Fact } from '@prisma/client';

export class FactEditError extends Error {
	constructor(
		message: string,
		public code: string
	) {
		super(message);
		this.name = 'FactEditError';
	}
}

/**
 * Request an edit to a fact (author only)
 */
export async function requestFactEdit(
	factId: string,
	userId: string,
	newBody: string
): Promise<FactEdit> {
	// Get the fact
	const fact = await db.fact.findUnique({
		where: { id: factId }
	});

	if (!fact) {
		throw new FactEditError('Fact not found', 'FACT_NOT_FOUND');
	}

	// Only author can request edits
	if (fact.userId !== userId) {
		throw new FactEditError('Only the author can request edits', 'NOT_AUTHOR');
	}

	// Cannot edit if body hasn't changed
	if (fact.body === newBody) {
		throw new FactEditError('No changes detected', 'NO_CHANGES');
	}

	// Check for pending edits
	const pendingEdit = await db.factEdit.findFirst({
		where: {
			factId,
			status: 'PENDING'
		}
	});

	if (pendingEdit) {
		throw new FactEditError('There is already a pending edit request', 'PENDING_EDIT_EXISTS');
	}

	// Create edit request
	return db.factEdit.create({
		data: {
			factId,
			userId,
			oldBody: fact.body,
			newBody,
			status: 'PENDING'
		}
	});
}

/**
 * Get pending edit for a fact
 */
export async function getPendingEdit(factId: string): Promise<FactEdit | null> {
	return db.factEdit.findFirst({
		where: {
			factId,
			status: 'PENDING'
		}
	});
}

/**
 * Get all edits for a fact
 */
export async function getFactEdits(factId: string): Promise<FactEdit[]> {
	return db.factEdit.findMany({
		where: { factId },
		orderBy: { createdAt: 'desc' }
	});
}

/**
 * Get edit by ID
 */
export async function getEditById(editId: string): Promise<FactEdit | null> {
	return db.factEdit.findUnique({
		where: { id: editId }
	});
}

/**
 * Review an edit request (moderator action)
 */
export async function reviewFactEdit(
	editId: string,
	reviewerId: string,
	approved: boolean
): Promise<{ edit: FactEdit; fact?: Fact }> {
	const edit = await db.factEdit.findUnique({
		where: { id: editId }
	});

	if (!edit) {
		throw new FactEditError('Edit request not found', 'EDIT_NOT_FOUND');
	}

	if (edit.status !== 'PENDING') {
		throw new FactEditError('Edit has already been reviewed', 'ALREADY_REVIEWED');
	}

	// Update edit status
	const status: FactEditStatus = approved ? 'APPROVED' : 'REJECTED';
	const updatedEdit = await db.factEdit.update({
		where: { id: editId },
		data: {
			status,
			reviewedById: reviewerId,
			reviewedAt: new Date()
		}
	});

	// If approved, update the fact
	let updatedFact: Fact | undefined;
	if (approved) {
		updatedFact = await db.fact.update({
			where: { id: edit.factId },
			data: { body: edit.newBody }
		});
	}

	return { edit: updatedEdit, fact: updatedFact };
}

/**
 * Cancel an edit request (author only)
 */
export async function cancelFactEdit(editId: string, userId: string): Promise<void> {
	const edit = await db.factEdit.findUnique({
		where: { id: editId }
	});

	if (!edit) {
		throw new FactEditError('Edit request not found', 'EDIT_NOT_FOUND');
	}

	if (edit.userId !== userId) {
		throw new FactEditError('Only the author can cancel edit requests', 'NOT_AUTHOR');
	}

	if (edit.status !== 'PENDING') {
		throw new FactEditError('Cannot cancel a reviewed edit', 'ALREADY_REVIEWED');
	}

	await db.factEdit.delete({
		where: { id: editId }
	});
}

/**
 * Get pending edits for moderation queue
 */
export async function getPendingEditsForModeration(options: {
	limit?: number;
	offset?: number;
}): Promise<{
	edits: Array<
		FactEdit & {
			fact: { id: string; title: string; status: string };
			user: { id: string; firstName: string; lastName: string };
		}
	>;
	total: number;
}> {
	const limit = options.limit || 20;
	const offset = options.offset || 0;

	const [edits, total] = await Promise.all([
		db.factEdit.findMany({
			where: { status: 'PENDING' },
			include: {
				fact: {
					select: { id: true, title: true, status: true }
				},
				user: {
					select: { id: true, firstName: true, lastName: true }
				}
			},
			orderBy: { createdAt: 'asc' },
			take: limit,
			skip: offset
		}),
		db.factEdit.count({ where: { status: 'PENDING' } })
	]);

	return { edits, total };
}

/**
 * Generate a diff between old and new body
 */
export function generateDiff(
	oldBody: string,
	newBody: string
): Array<{ type: 'unchanged' | 'added' | 'removed'; text: string }> {
	const oldLines = oldBody.split('\n');
	const newLines = newBody.split('\n');
	const diff: Array<{ type: 'unchanged' | 'added' | 'removed'; text: string }> = [];

	// Simple line-by-line diff (could use a proper diff library for production)
	const maxLength = Math.max(oldLines.length, newLines.length);

	for (let i = 0; i < maxLength; i++) {
		const oldLine = oldLines[i];
		const newLine = newLines[i];

		if (oldLine === undefined) {
			diff.push({ type: 'added', text: newLine });
		} else if (newLine === undefined) {
			diff.push({ type: 'removed', text: oldLine });
		} else if (oldLine === newLine) {
			diff.push({ type: 'unchanged', text: oldLine });
		} else {
			diff.push({ type: 'removed', text: oldLine });
			diff.push({ type: 'added', text: newLine });
		}
	}

	return diff;
}
