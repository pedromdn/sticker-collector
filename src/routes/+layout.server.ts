import type { LayoutServerLoad } from './$types';
import { loadCollaborativeCollection } from '$lib/server/collection';
import type { CollaborationGroup, CollaborativeStickerItem } from '$lib/types';

// The shared group + collection load, hoisted here (instead of repeated in
// every page under this layout) so navigating between Colección, Agregar,
// and Intercambiar reuses the same cached data instead of re-fetching it on
// every menu change. Only re-runs when explicitly invalidated (see
// invalidate('app:collection') after writes) or on a fresh browser load.
export const load: LayoutServerLoad = async ({ locals: { supabase, session, user }, cookies, depends }) => {
	depends('app:collection');

	if (!session) {
		return {
			session,
			user: null,
			cookies: cookies.getAll(),
			group: null as CollaborationGroup | null,
			items: [] as CollaborativeStickerItem[]
		};
	}

	const collection = await loadCollaborativeCollection(supabase, session.user.id);

	return {
		session,
		user: user ? { id: user.id, email: user.email } : null,
		cookies: cookies.getAll(),
		...collection
	};
};
