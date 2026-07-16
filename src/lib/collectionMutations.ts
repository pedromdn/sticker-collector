import type { SupabaseClient } from '@supabase/supabase-js';

export type StickerQuantityRow = { sticker_code: string; quantity: number };

export async function upsertUserStickers(
	supabase: SupabaseClient,
	userId: string,
	rows: StickerQuantityRow[]
): Promise<{ error: Error | null }> {
	if (rows.length === 0) return { error: null };

	const payload = rows.map((row) => ({
		user_id: userId,
		sticker_code: row.sticker_code,
		quantity: row.quantity
	}));

	const { error } = await supabase
		.from('user_stickers')
		.upsert(payload, { onConflict: 'user_id,sticker_code' });

	return { error };
}
