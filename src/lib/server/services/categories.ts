import type { Category, CategoryStatus, FactStatus } from '@prisma/client';
import { z } from 'zod';
import type { AuthDeps } from './auth/session';

// Curated category tree (R8): max depth 2 (top level + one child level).
// Moderators manage the tree; users can propose categories.

export type CategoryResult = { ok: true; category: Category } | { ok: false; error: string };

export interface CategoryNode {
	id: string;
	name: string;
	slug: string;
	children: { id: string; name: string; slug: string }[];
}

const nameSchema = z
	.string()
	.trim()
	.min(2, 'Category name must be at least 2 characters.')
	.max(60, 'Category name must be at most 60 characters.');

export function slugify(name: string): string {
	return name
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);
}

export async function getCategoryTree(deps: AuthDeps): Promise<CategoryNode[]> {
	const categories = await deps.prisma.category.findMany({
		where: { status: 'ACTIVE' },
		orderBy: { name: 'asc' }
	});
	const tops = categories.filter((c) => c.parentId === null);
	return tops.map((top) => ({
		id: top.id,
		name: top.name,
		slug: top.slug,
		children: categories
			.filter((c) => c.parentId === top.id)
			.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))
	}));
}

async function validateParent(
	deps: AuthDeps,
	parentId: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
	if (parentId === null) return { ok: true };
	const parent = await deps.prisma.category.findUnique({ where: { id: parentId } });
	if (!parent || parent.status !== 'ACTIVE') {
		return { ok: false, error: 'Parent category not found.' };
	}
	if (parent.parentId !== null) {
		return { ok: false, error: 'Categories can be nested at most one level deep.' };
	}
	return { ok: true };
}

async function uniqueSlug(deps: AuthDeps, name: string): Promise<string | null> {
	const slug = slugify(name);
	if (slug === '') return null;
	const existing = await deps.prisma.category.findUnique({ where: { slug } });
	return existing ? null : slug;
}

export async function createCategory(
	deps: AuthDeps,
	input: { name: string; parentId: string | null }
): Promise<CategoryResult> {
	const name = nameSchema.safeParse(input.name);
	if (!name.success) return { ok: false, error: name.error.issues[0].message };
	const parentCheck = await validateParent(deps, input.parentId);
	if (!parentCheck.ok) return parentCheck;
	const slug = await uniqueSlug(deps, name.data);
	if (!slug) return { ok: false, error: 'A category with this name already exists.' };
	const category = await deps.prisma.category.create({
		data: { name: name.data, slug, parentId: input.parentId }
	});
	return { ok: true, category };
}

export async function renameCategory(
	deps: AuthDeps,
	input: { categoryId: string; name: string }
): Promise<CategoryResult> {
	const name = nameSchema.safeParse(input.name);
	if (!name.success) return { ok: false, error: name.error.issues[0].message };
	const category = await deps.prisma.category.update({
		where: { id: input.categoryId },
		data: { name: name.data }
	});
	return { ok: true, category };
}

export async function moveCategory(
	deps: AuthDeps,
	input: { categoryId: string; parentId: string | null }
): Promise<CategoryResult> {
	if (input.parentId === input.categoryId) {
		return { ok: false, error: 'A category cannot be its own parent.' };
	}
	const parentCheck = await validateParent(deps, input.parentId);
	if (!parentCheck.ok) return parentCheck;
	const hasChildren = await deps.prisma.category.count({
		where: { parentId: input.categoryId }
	});
	if (input.parentId !== null && hasChildren > 0) {
		return { ok: false, error: 'Moving would exceed the maximum depth of 2.' };
	}
	const category = await deps.prisma.category.update({
		where: { id: input.categoryId },
		data: { parentId: input.parentId }
	});
	return { ok: true, category };
}

export async function setCategoryStatus(
	deps: AuthDeps,
	input: { categoryId: string; status: CategoryStatus }
): Promise<CategoryResult> {
	const category = await deps.prisma.category.update({
		where: { id: input.categoryId },
		data: { status: input.status }
	});
	return { ok: true, category };
}

export async function proposeCategory(
	deps: AuthDeps,
	input: { name: string; parentId: string | null; userId: string }
): Promise<CategoryResult> {
	const name = nameSchema.safeParse(input.name);
	if (!name.success) return { ok: false, error: name.error.issues[0].message };
	const parentCheck = await validateParent(deps, input.parentId);
	if (!parentCheck.ok) return parentCheck;
	const slug = await uniqueSlug(deps, name.data);
	if (!slug) return { ok: false, error: 'A category with this name already exists.' };
	const category = await deps.prisma.category.create({
		data: {
			name: name.data,
			slug,
			parentId: input.parentId,
			status: 'PROPOSED',
			proposedById: input.userId
		}
	});
	return { ok: true, category };
}

export async function listProposals(deps: AuthDeps) {
	return deps.prisma.category.findMany({
		where: { status: 'PROPOSED' },
		orderBy: { createdAt: 'asc' },
		include: { parent: { select: { name: true } } }
	});
}

export async function resolveProposal(
	deps: AuthDeps,
	input: { categoryId: string; approve: boolean }
): Promise<CategoryResult> {
	const existing = await deps.prisma.category.findUnique({ where: { id: input.categoryId } });
	if (!existing || existing.status !== 'PROPOSED') {
		return { ok: false, error: 'Proposal not found.' };
	}
	const category = await deps.prisma.category.update({
		where: { id: input.categoryId },
		data: { status: input.approve ? 'ACTIVE' : 'REJECTED' }
	});
	return { ok: true, category };
}

export interface CategoryPage {
	category: Category;
	children: { id: string; name: string; slug: string }[];
	facts: {
		id: string;
		title: string;
		status: FactStatus;
		createdAt: Date;
		categoryName: string;
	}[];
}

// Category page: facts from the category itself plus its direct children.
export async function getCategoryPage(deps: AuthDeps, slug: string): Promise<CategoryPage | null> {
	const category = await deps.prisma.category.findFirst({
		where: { slug, status: 'ACTIVE' },
		include: { children: { where: { status: 'ACTIVE' }, orderBy: { name: 'asc' } } }
	});
	if (!category) return null;
	const categoryIds = [category.id, ...category.children.map((c) => c.id)];
	const facts = await deps.prisma.fact.findMany({
		where: { categoryId: { in: categoryIds } },
		orderBy: { createdAt: 'desc' },
		take: 50,
		include: { category: { select: { name: true } } }
	});
	return {
		category,
		children: category.children.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
		facts: facts.map((f) => ({
			id: f.id,
			title: f.title,
			status: f.status,
			createdAt: f.createdAt,
			categoryName: f.category.name
		}))
	};
}
