import type { PageServerLoad } from './$types';
import { loadCollaborativeCollection, loadStickerHistory } from '$lib/server/collection';

export const load: PageServerLoad = async ({ locals: { supabase, session } }) => {
	const collection = await loadCollaborativeCollection(supabase, session!.user.id);
	const history = await loadStickerHistory(supabase, { userId: session!.user.id, limit: 50 });
	return { ...collection, history };
};
