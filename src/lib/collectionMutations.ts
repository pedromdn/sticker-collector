import type { SupabaseClient } from '@supabase/supabase-js';
import type { StickerEventAction } from '$lib/types';

export type StickerQuantityRow = {
	sticker_code: string;
	quantity: number;
	previous_quantity?: number;
	action?: StickerEventAction;
};

export type StickerMutationOptions = {
	groupId?: string | null;
};

export async function upsertUserStickers(
	supabase: SupabaseClient,
	userId: string,
	rows: StickerQuantityRow[],
	options: StickerMutationOptions = {}
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

	if (error) return { error };

	const events = rows
		.map((row) => {
			const previous = row.previous_quantity;
			if (previous === undefined || previous === row.quantity) return null;
			const delta = row.quantity - previous;
			return {
				user_id: userId,
				group_id: options.groupId ?? null,
				sticker_code: row.sticker_code,
				action: row.action ?? (delta > 0 ? 'added' : 'removed'),
				delta,
				quantity_after: row.quantity
			};
		})
		.filter((event): event is NonNullable<typeof event> => event !== null);

	if (events.length > 0) {
		const { error: eventError } = await supabase.from('sticker_events').insert(events);
		if (eventError) return { error: eventError };
	}

	return { error: null };
}
