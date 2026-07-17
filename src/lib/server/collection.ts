import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	CollaborationGroup,
	CollaborativeStickerItem,
	GroupMember,
	StickerHistoryEvent,
	StickerItem
} from '$lib/types';

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

	const quantityByCode = new Map(
		(userStickers ?? []).map((row) => [row.sticker_code, row.quantity])
	);

	return (stickers ?? []).map((sticker) => ({
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
