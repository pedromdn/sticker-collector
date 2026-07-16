import type { PageServerLoad } from './$types';
import { loadCollaborativeCollection } from '$lib/server/collection';

export const load: PageServerLoad = async ({ locals: { supabase, session } }) => {
	return loadCollaborativeCollection(supabase, session!.user.id);
};
