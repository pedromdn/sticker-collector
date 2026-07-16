export type StickerItem = {
	code: string;
	name: string;
	team: string;
	quantity: number;
};

export type GroupMember = {
	user_id: string;
	display_name: string;
	location_label: string;
	is_swap_local: boolean;
};

export type CollaborationGroup = {
	id: string;
	name: string;
	invite_code: string;
	members: GroupMember[];
	currentMember: GroupMember | null;
};

export type CollaborativeStickerItem = StickerItem & {
	groupQuantity: number;
	localDuplicateQuantity: number;
	memberQuantities: Record<string, number>;
};

export type StatusFilter = 'all' | 'have' | 'missing' | 'duplicate';
