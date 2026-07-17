import type { PageServerLoad } from './$types';
import { loadStickerHistory } from '$lib/server/collection';

export const load: PageServerLoad = async ({ locals: { supabase, session } }) => {
	// group/items come from the root layout (shared/cached across
	// navigation). History is streamed — not awaited — so it doesn't block
	// the rest of the page from rendering.
	return {
		history: loadStickerHistory(supabase, { userId: session!.user.id, limit: 50 })
	};
};
