import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createFact, getFacts, FactValidationError, getRemainingFactsToday } from '$lib/server/services/fact';
import type { FactStatus } from '@prisma/client';

/**
 * GET /api/facts - List facts with pagination and filters
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '20');
		const status = url.searchParams.get('status') as FactStatus | null;
		const categoryId = url.searchParams.get('categoryId');
		const userId = url.searchParams.get('userId');
		const search = url.searchParams.get('search');
		const sortBy = url.searchParams.get('sortBy') as 'newest' | 'oldest' | 'controversial' | null;

		const result = await getFacts({
			page,
			limit: Math.min(limit, 100), // Cap at 100
			status: status || undefined,
			categoryId: categoryId || undefined,
			userId: userId || undefined,
			search: search || undefined,
			sortBy: sortBy || 'newest'
		});

		return json({
			success: true,
			data: result
		});
	} catch (err) {
		console.error('Error fetching facts:', err);
		throw error(500, 'Failed to fetch facts');
	}
};

/**
 * POST /api/facts - Create a new fact
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	// Check authentication
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	// Check if email is verified
	if (!locals.user.emailVerified) {
		throw error(403, 'Please verify your email before creating facts');
	}

	// Check if user is banned
	if (locals.user.bannedUntil && locals.user.bannedUntil > new Date()) {
		throw error(403, 'Your account is currently suspended');
	}

	try {
		const body = await request.json();

		// Validate required fields
		if (!body.title || !body.body || !body.sources) {
			throw error(400, 'Missing required fields: title, body, sources');
		}

		const fact = await createFact(locals.user.id, {
			title: body.title,
			body: body.body,
			categoryId: body.categoryId,
			sources: body.sources
		});

		// Get remaining facts for today
		const remaining = await getRemainingFactsToday(locals.user.id);

		return json({
			success: true,
			data: {
				fact,
				remainingToday: remaining
			}
		});
	} catch (err) {
		if (err instanceof FactValidationError) {
			throw error(400, { message: err.message });
		}
		console.error('Error creating fact:', err);
		throw error(500, 'Failed to create fact');
	}
};
