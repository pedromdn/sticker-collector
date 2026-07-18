import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	CollaborationGroup,
	CollaborativeStickerItem,
	GroupMember,
	StickerHistoryEvent,
	StickerItem
} from '$lib/types';

const FALLBACK_SPECIAL_STICKERS: Array<Omit<StickerItem, 'quantity'>> = [
	{ code: 'FWC9', name: 'Italy 1934', team: 'FIFA World Cup History', img: null },
	{ code: 'FWC10', name: 'Uruguay 1950', team: 'FIFA World Cup History', img: null },
	{ code: 'FWC11', name: 'West Germany 1954', team: 'FIFA World Cup History', img: null },
	{ code: 'FWC12', name: 'Brazil 1962', team: 'FIFA World Cup History', img: '0147.png' },
	{ code: 'FWC13', name: 'West Germany 1974', team: 'FIFA World Cup History', img: null },
	{ code: 'FWC14', name: 'Argentina 1986', team: 'FIFA World Cup History', img: '0069.png' },
	{ code: 'FWC15', name: 'Brazil 1994', team: 'FIFA World Cup History', img: '0148.png' },
	{ code: 'FWC16', name: 'Brazil 2002', team: 'FIFA World Cup History', img: '0149.png' },
	{ code: 'FWC17', name: 'Italy 2006', team: 'FIFA World Cup History', img: '0797.png' },
	{ code: 'FWC18', name: 'Germany 2014', team: 'FIFA World Cup History', img: null },
	{ code: 'FWC19', name: 'Argentina 2022', team: 'FIFA World Cup History', img: null },
	{ code: 'COC1', name: 'Coca-Cola 1', team: 'Coca-Cola', img: null },
	{ code: 'COC2', name: 'Coca-Cola 2', team: 'Coca-Cola', img: null },
	{ code: 'COC3', name: 'Coca-Cola 3', team: 'Coca-Cola', img: null },
	{ code: 'COC4', name: 'Coca-Cola 4', team: 'Coca-Cola', img: null },
	{ code: 'COC5', name: 'Coca-Cola 5', team: 'Coca-Cola', img: null },
	{ code: 'COC6', name: 'Coca-Cola 6', team: 'Coca-Cola', img: null },
	{ code: 'COC7', name: 'Coca-Cola 7', team: 'Coca-Cola', img: null },
	{ code: 'COC8', name: 'Coca-Cola 8', team: 'Coca-Cola', img: null },
	{ code: 'COC9', name: 'Coca-Cola 9', team: 'Coca-Cola', img: null },
	{ code: 'COC10', name: 'Coca-Cola 10', team: 'Coca-Cola', img: null },
	{ code: 'COC11', name: 'Coca-Cola 11', team: 'Coca-Cola', img: null },
	{ code: 'COC12', name: 'Coca-Cola 12', team: 'Coca-Cola', img: null },
	{ code: 'COC13', name: 'Coca-Cola 13', team: 'Coca-Cola', img: null },
	{ code: 'COC14', name: 'Coca-Cola 14', team: 'Coca-Cola', img: null }
];

export async function loadCollectionItems(
	supabase: SupabaseClient,
	userId: string
): Promise<StickerItem[]> {
	const [{ data: stickers, error: stickersError }, { data: userStickers, error: userError }] =
		await Promise.all([
			supabase.from('stickers').select('code, name, team, img').order('sort_order'),
			supabase.from('user_stickers').select('sticker_code, quantity').eq('user_id', userId)
		]);

	if (stickersError) throw stickersError;
	if (userError) throw userError;

	const stickerRows = [...(stickers ?? [])];
	const knownCodes = new Set(stickerRows.map((sticker) => sticker.code));
	for (const fallback of FALLBACK_SPECIAL_STICKERS) {
		if (!knownCodes.has(fallback.code)) {
			stickerRows.push(fallback);
		}
	}

	const quantityByCode = new Map(
		(userStickers ?? []).map((row) => [row.sticker_code, row.quantity])
	);

	return stickerRows.map((sticker) => ({
		...sticker,
		quantity: quantityByCode.get(sticker.code) ?? 0
	}));
}

export async function loadCollaborationGroup(
	supabase: SupabaseClient,
	userId: string
): Promise<CollaborationGroup | null> {
	const { data: membership, error: membershipError } = await supabase
		.from('group_members')
		.select('group_id')
		.eq('user_id', userId)
		.order('joined_at')
		.limit(1)
		.maybeSingle();

	if (membershipError) throw membershipError;
	if (!membership) return null;

	const [{ data: group, error: groupError }, { data: members, error: membersError }] =
		await Promise.all([
			supabase
				.from('collection_groups')
				.select('id, name, invite_code')
				.eq('id', membership.group_id)
				.single(),
			supabase
				.from('group_members')
				.select('user_id, display_name, location_label, is_swap_local')
				.eq('group_id', membership.group_id)
				.order('joined_at')
		]);

	if (groupError) throw groupError;
	if (membersError) throw membersError;

	const typedMembers = (members ?? []) as GroupMember[];
	return {
		...group,
		members: typedMembers,
		currentMember: typedMembers.find((member) => member.user_id === userId) ?? null
	};
}

export async function loadCollaborativeCollection(
	supabase: SupabaseClient,
	userId: string
): Promise<{ group: CollaborationGroup | null; items: CollaborativeStickerItem[] }> {
	// Independent of each other — run concurrently rather than waterfalling,
	// this alone cuts a full network round trip off every page load.
	const [group, ownItems] = await Promise.all([
		loadCollaborationGroup(supabase, userId),
		loadCollectionItems(supabase, userId)
	]);

	if (!group) {
		return {
			group,
			items: ownItems.map((item) => ({
				...item,
				groupQuantity: item.quantity,
				localDuplicateQuantity: Math.max(0, item.quantity - 1),
				memberQuantities: { [userId]: item.quantity }
			}))
		};
	}

	const memberIds = group.members.map((member) => member.user_id);
	const { data: rows, error } = await supabase
		.from('user_stickers')
		.select('user_id, sticker_code, quantity')
		.in('user_id', memberIds);

	if (error) throw error;

	const quantities = new Map<string, Map<string, number>>();
	for (const row of rows ?? []) {
		const byMember = quantities.get(row.sticker_code) ?? new Map<string, number>();
		byMember.set(row.user_id, row.quantity);
		quantities.set(row.sticker_code, byMember);
	}

	const localMemberIds = new Set(
		group.members.filter((member) => member.is_swap_local).map((member) => member.user_id)
	);

	return {
		group,
		items: ownItems.map((item) => {
			const byMember = quantities.get(item.code) ?? new Map<string, number>();
			let groupQuantity = 0;
			let localDuplicateQuantity = 0;
			const memberQuantities: Record<string, number> = {};

			for (const member of group.members) {
				const quantity = byMember.get(member.user_id) ?? 0;
				memberQuantities[member.user_id] = quantity;
				groupQuantity += quantity;
				if (localMemberIds.has(member.user_id)) {
					localDuplicateQuantity += Math.max(0, quantity - 1);
				}
			}

			return {
				...item,
				quantity: memberQuantities[userId] ?? 0,
				groupQuantity,
				localDuplicateQuantity,
				memberQuantities
			};
		})
	};
}


export async function loadStickerHistory(
	supabase: SupabaseClient,
	options: { userId?: string; groupId?: string; members?: GroupMember[]; limit?: number }
): Promise<StickerHistoryEvent[]> {
	let query = supabase
		.from('sticker_events')
		.select('id, created_at, user_id, sticker_code, action, delta, quantity_after')
		.order('created_at', { ascending: false })
		.limit(options.limit ?? 40);

	if (options.groupId) {
		query = query.eq('group_id', options.groupId);
	} else if (options.userId) {
		query = query.eq('user_id', options.userId);
	} else {
		return [];
	}

	const { data: events, error } = await query;
	if (error) {
		// Keep the app usable while the production database migration is being applied.
		if (error.code === '42P01') return [];
		throw error;
	}
	if (!events || events.length === 0) return [];

	const codes = [...new Set(events.map((event) => event.sticker_code))];
	const { data: stickers, error: stickersError } = await supabase
		.from('stickers')
		.select('code, name, team, img')
		.in('code', codes);

	if (stickersError) throw stickersError;

	const stickerByCode = new Map((stickers ?? []).map((sticker) => [sticker.code, sticker]));
	const memberById = new Map((options.members ?? []).map((member) => [member.user_id, member]));

	return events.map((event) => {
		const sticker = stickerByCode.get(event.sticker_code);
		return {
			id: event.id,
			created_at: event.created_at,
			user_id: event.user_id,
			actor_name: memberById.get(event.user_id)?.display_name ?? null,
			sticker_code: event.sticker_code,
			sticker_name: sticker?.name ?? event.sticker_code,
			team: sticker?.team ?? '',
			img: sticker?.img ?? null,
			action: event.action,
			delta: event.delta,
			quantity_after: event.quantity_after
		};
	});
}
