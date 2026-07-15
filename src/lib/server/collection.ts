import type { SupabaseClient } from '@supabase/supabase-js';
import type { StickerItem } from '$lib/types';

export async function loadCollectionItems(
	supabase: SupabaseClient,
	userId: string
): Promise<StickerItem[]> {
	const [{ data: stickers, error: stickersError }, { data: userStickers, error: userError }] =
		await Promise.all([
			supabase.from('stickers').select('code, name, team').order('sort_order'),
			supabase.from('user_stickers').select('sticker_code, quantity').eq('user_id', userId)
		]);

	if (stickersError) throw stickersError;
	if (userError) throw userError;

	const quantityByCode = new Map(
		(userStickers ?? []).map((row) => [row.sticker_code, row.quantity])
	);

	return (stickers ?? []).map((sticker) => ({
		...sticker,
		quantity: quantityByCode.get(sticker.code) ?? 0
	}));
}
