import type { PageServerLoad } from './$types';
import { loadCollectionItems } from '$lib/server/collection';

export const load: PageServerLoad = async ({ locals: { supabase, session } }) => {
	const items = await loadCollectionItems(supabase, session!.user.id);
	return { items };
};
