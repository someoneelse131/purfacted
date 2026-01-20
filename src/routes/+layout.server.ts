import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.user
			? {
					id: locals.user.id,
					email: locals.user.email,
					firstName: locals.user.firstName,
					lastName: locals.user.lastName,
					userType: locals.user.userType,
					trustScore: locals.user.trustScore
				}
			: null
	};
};
