export type StickerItem = {
	code: string;
	name: string;
	team: string;
	quantity: number;
	img: string | null;
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


export type StickerEventAction = 'added' | 'removed' | 'traded';

export type StickerHistoryEvent = {
	id: string;
	created_at: string;
	user_id: string;
	actor_name: string | null;
	sticker_code: string;
	sticker_name: string;
	team: string;
	img: string | null;
	action: StickerEventAction;
	delta: number;
	quantity_after: number;
};

export type StatusFilter = 'all' | 'have' | 'missing' | 'duplicate';
