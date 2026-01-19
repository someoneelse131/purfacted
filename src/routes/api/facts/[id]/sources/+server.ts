import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { addSourceToFact, FactValidationError } from '$lib/server/services/fact';
import { detectSourceType } from '$lib/utils/sourceCredibility';

/**
 * POST /api/facts/:id/sources - Add a source to an existing fact
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	// Check authentication
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	// Check if email is verified
	if (!locals.user.emailVerified) {
		throw error(403, 'Please verify your email before adding sources');
	}

	try {
		const body = await request.json();

		if (!body.url) {
			throw error(400, 'Source URL is required');
		}

		const source = await addSourceToFact(params.id, locals.user.id, {
			url: body.url,
			title: body.title,
			type: body.type
		});

		return json({
			success: true,
			data: source
		});
	} catch (err) {
		if (err instanceof FactValidationError) {
			if (err.code === 'FACT_NOT_FOUND') {
				throw error(404, err.message);
			}
			throw error(400, err.message);
		}
		console.error('Error adding source:', err);
		throw error(500, 'Failed to add source');
	}
};

/**
 * GET /api/facts/:id/sources/detect - Detect source type from URL
 */
export const GET: RequestHandler = async ({ url }) => {
	const sourceUrl = url.searchParams.get('url');

	if (!sourceUrl) {
		throw error(400, 'URL parameter is required');
	}

	try {
		const detectedType = detectSourceType(sourceUrl);

		return json({
			success: true,
			data: {
				url: sourceUrl,
				detectedType
			}
		});
	} catch (err) {
		return json({
			success: true,
			data: {
				url: sourceUrl,
				detectedType: 'OTHER'
			}
		});
	}
};
