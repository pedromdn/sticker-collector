export type StickerItem = {
	code: string;
	name: string;
	team: string;
	quantity: number;
};

export type StatusFilter = 'all' | 'have' | 'missing' | 'duplicate';
