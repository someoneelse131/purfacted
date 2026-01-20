import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { createApiKey, listApiKeysByUser, revokeApiKey, getApiKeyStats } from '$lib/server/services/publicApi';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/login?redirect=/developers/keys');
	}

	const apiKeys = await listApiKeysByUser(locals.user.id);

	// Get stats for each key
	const keysWithStats = await Promise.all(
		apiKeys.map(async (key) => {
			const stats = await getApiKeyStats(key.id, 30);
			return {
				id: key.id,
				keyPrefix: key.keyPrefix,
				name: key.name,
				tier: key.tier,
				isActive: key.isActive,
				lastUsedAt: key.lastUsedAt?.toISOString() || null,
				createdAt: key.createdAt.toISOString(),
				expiresAt: key.expiresAt?.toISOString() || null,
				stats: {
					totalRequests: stats.totalRequests,
					averageLatency: Math.round(stats.averageLatency)
				}
			};
		})
	);

	return {
		user: locals.user,
		apiKeys: keysWithStats
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Not authenticated' });
		}

		const formData = await request.formData();
		const name = formData.get('name')?.toString().trim();
		const description = formData.get('description')?.toString().trim();

		if (!name || name.length < 3) {
			return fail(400, { error: 'Name must be at least 3 characters' });
		}

		try {
			const { apiKey, rawKey } = await createApiKey({
				name,
				email: locals.user.email,
				description,
				userId: locals.user.id,
				tier: 'FREE'
			});

			return {
				success: true,
				newKey: {
					id: apiKey.id,
					name: apiKey.name,
					rawKey // Only returned once at creation
				}
			};
		} catch (error) {
			console.error('Error creating API key:', error);
			return fail(500, { error: 'Failed to create API key' });
		}
	},

	revoke: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Not authenticated' });
		}

		const formData = await request.formData();
		const keyId = formData.get('keyId')?.toString();

		if (!keyId) {
			return fail(400, { error: 'Key ID required' });
		}

		try {
			await revokeApiKey(keyId);
			return { success: true, revoked: keyId };
		} catch (error) {
			console.error('Error revoking API key:', error);
			return fail(500, { error: 'Failed to revoke API key' });
		}
	}
};
