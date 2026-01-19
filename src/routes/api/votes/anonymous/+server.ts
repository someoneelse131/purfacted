import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	submitAnonymousVote,
	getAnonymousVoteStatus,
	type AnonymousVoteServiceError
} from '$lib/server/services/anonymousVote';

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	try {
		const body = await request.json();
		const { contentType, contentId, value, captchaToken } = body;

		// Validate required fields
		if (!contentType || !contentId || value === undefined) {
			return json(
				{
					success: false,
					error: 'Missing required fields: contentType, contentId, value'
				},
				{ status: 400 }
			);
		}

		// Validate content type
		if (!['fact', 'discussion', 'comment'].includes(contentType)) {
			return json(
				{
					success: false,
					error: 'Invalid content type. Must be: fact, discussion, or comment'
				},
				{ status: 400 }
			);
		}

		// Validate vote value
		if (value !== 1 && value !== -1) {
			return json(
				{
					success: false,
					error: 'Invalid vote value. Must be 1 (upvote) or -1 (downvote)'
				},
				{ status: 400 }
			);
		}

		// Get client IP
		let ip: string;
		try {
			ip = getClientAddress();
		} catch {
			return json(
				{
					success: false,
					error: 'Could not determine client IP address'
				},
				{ status: 400 }
			);
		}

		const result = await submitAnonymousVote({
			ip,
			contentType,
			contentId,
			value,
			captchaToken
		});

		return json({
			success: true,
			message: 'Vote recorded successfully',
			voteId: result.voteId,
			weight: result.weight,
			remainingVotesToday: result.remainingVotesToday
		});
	} catch (err) {
		// Handle known service errors
		if (err && typeof err === 'object' && 'code' in err) {
			const serviceError = err as AnonymousVoteServiceError;

			switch (serviceError.code) {
				case 'RATE_LIMITED':
					return json(
						{
							success: false,
							error: serviceError.message
						},
						{ status: 429 }
					);

				case 'ALREADY_VOTED':
					return json(
						{
							success: false,
							error: serviceError.message
						},
						{ status: 409 }
					);

				case 'INVALID_CAPTCHA':
					return json(
						{
							success: false,
							error: serviceError.message
						},
						{ status: 400 }
					);

				case 'FEATURE_DISABLED':
					return json(
						{
							success: false,
							error: serviceError.message
						},
						{ status: 403 }
					);

				case 'INVALID_VOTE':
					return json(
						{
							success: false,
							error: serviceError.message
						},
						{ status: 400 }
					);
			}
		}

		console.error('Anonymous vote error:', err);
		throw error(500, 'An unexpected error occurred');
	}
};

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	try {
		const contentType = url.searchParams.get('contentType');
		const contentId = url.searchParams.get('contentId');

		if (!contentType || !contentId) {
			return json(
				{
					success: false,
					error: 'Missing required query parameters: contentType, contentId'
				},
				{ status: 400 }
			);
		}

		// Get client IP
		let ip: string;
		try {
			ip = getClientAddress();
		} catch {
			return json(
				{
					success: false,
					error: 'Could not determine client IP address'
				},
				{ status: 400 }
			);
		}

		const status = await getAnonymousVoteStatus(ip, contentType, contentId);

		return json({
			success: true,
			...status
		});
	} catch (err) {
		console.error('Get anonymous vote status error:', err);
		throw error(500, 'An unexpected error occurred');
	}
};
