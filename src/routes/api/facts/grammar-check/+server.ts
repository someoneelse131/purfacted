import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkGrammar, checkFactGrammar, isGrammarCheckAvailable } from '$lib/server/llm';

/**
 * GET /api/facts/grammar-check - Check if grammar checking is available
 */
export const GET: RequestHandler = async () => {
	return json({
		success: true,
		data: {
			available: isGrammarCheckAvailable()
		}
	});
};

/**
 * POST /api/facts/grammar-check - Check grammar for fact text
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	// Check authentication
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	try {
		const body = await request.json();

		// Check if we have title and body (full fact check) or just text
		if (body.title !== undefined && body.body !== undefined) {
			// Full fact check
			const result = await checkFactGrammar(body.title, body.body);

			return json({
				success: true,
				data: {
					title: {
						original: result.title.original,
						corrected: result.title.corrected,
						suggestions: result.title.suggestions,
						hasChanges: result.title.hasChanges
					},
					body: {
						original: result.body.original,
						corrected: result.body.corrected,
						suggestions: result.body.suggestions,
						hasChanges: result.body.hasChanges
					}
				}
			});
		} else if (body.text) {
			// Single text check
			const result = await checkGrammar(body.text);

			if (!result.success) {
				return json({
					success: false,
					error: result.error || 'Grammar check failed'
				});
			}

			return json({
				success: true,
				data: {
					original: result.original,
					corrected: result.corrected,
					suggestions: result.suggestions,
					hasChanges: result.hasChanges
				}
			});
		} else {
			throw error(400, 'Either "text" or both "title" and "body" are required');
		}
	} catch (err) {
		if ((err as any).status) {
			throw err;
		}
		console.error('Grammar check error:', err);
		throw error(500, 'Grammar check failed');
	}
};
