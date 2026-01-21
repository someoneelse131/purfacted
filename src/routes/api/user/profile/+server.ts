import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Not authenticated');
	}

	try {
		const user = await db.user.findUnique({
			where: { id: locals.user.id },
			select: {
				id: true,
				email: true,
				firstName: true,
				lastName: true,
				userType: true,
				trustScore: true,
				emailVerified: true,
				createdAt: true,
				lastLoginAt: true,
				_count: {
					select: {
						facts: true,
						votes: true,
						comments: true
					}
				}
			}
		});

		if (!user) {
			throw error(404, 'User not found');
		}

		return json({
			success: true,
			data: user
		});
	} catch (err) {
		console.error('Error fetching profile:', err);
		throw error(500, 'Failed to fetch profile');
	}
};
