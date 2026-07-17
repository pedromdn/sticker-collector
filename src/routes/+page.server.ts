import type { PageServerLoad } from './$types';
import { loadCollaborativeCollection, loadStickerHistory } from '$lib/server/collection';

export const load: PageServerLoad = async ({ locals: { supabase, session } }) => {
	// Independent queries — the history read doesn't depend on the group/
	// collection result, so there's no reason to wait for it first.
	const [collection, history] = await Promise.all([
		loadCollaborativeCollection(supabase, session!.user.id),
		loadStickerHistory(supabase, { userId: session!.user.id, limit: 50 })
	]);
	return { ...collection, history };
};
