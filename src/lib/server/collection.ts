import type { SupabaseClient } from '@supabase/supabase-js';
import type { CollaborationGroup, CollaborativeStickerItem, GroupMember, StickerItem } from '$lib/types';

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
	const group = await loadCollaborationGroup(supabase, userId);
	const ownItems = await loadCollectionItems(supabase, userId);

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
