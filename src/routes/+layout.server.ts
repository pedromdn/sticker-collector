import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals: { session, user }, cookies }) => {
	return {
		session,
		user: user ? { id: user.id, email: user.email } : null,
		cookies: cookies.getAll()
	};
};
