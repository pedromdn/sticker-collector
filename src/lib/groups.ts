import type { StickerItem } from './types';

// World Cup 2026 group stage draw (Dec 2025), in the same order the official
// Panini album lays them out: hosts seeded as A1/B1/D1, then the rest of pot 1.
export const GROUP_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const;

export const TEAM_GROUP: Record<string, string> = {
	Mexico: 'A',
	'South Africa': 'A',
	'South Korea': 'A',
	Czechia: 'A',

	Canada: 'B',
	'Bosnia and Herzegovina': 'B',
	Qatar: 'B',
	Switzerland: 'B',

	Brazil: 'C',
	Morocco: 'C',
	Haiti: 'C',
	Scotland: 'C',

	USA: 'D',
	Paraguay: 'D',
	Australia: 'D',
	Türkiye: 'D',

	Germany: 'E',
	Curaçao: 'E',
	'Ivory Coast': 'E',
	Ecuador: 'E',

	Netherlands: 'F',
	Japan: 'F',
	Sweden: 'F',
	Tunisia: 'F',

	Belgium: 'G',
	Egypt: 'G',
	Iran: 'G',
	'New Zealand': 'G',

	Spain: 'H',
	'Cape Verde': 'H',
	'Saudi Arabia': 'H',
	Uruguay: 'H',

	France: 'I',
	Senegal: 'I',
	Iraq: 'I',
	Norway: 'I',

	Argentina: 'J',
	Algeria: 'J',
	Austria: 'J',
	Jordan: 'J',

	Portugal: 'K',
	'Congo DR': 'K',
	Uzbekistan: 'K',
	Colombia: 'K',

	England: 'L',
	Croatia: 'L',
	Ghana: 'L',
	Panama: 'L'
};

export type SectionKey = 'intro' | `group-${(typeof GROUP_ORDER)[number]}` | 'history' | 'coca-cola';

// Foil/variant stickers (code ends in "s", e.g. GER10s) display inside
// their team section, but are still skipped when exporting Figuritas QR codes.
export function isSpecialVariant(code: string): boolean {
	return code.endsWith('s');
}

export function getSectionKey(team: string, code: string): SectionKey {
	const group = TEAM_GROUP[team];
	if (group) return `group-${group}` as SectionKey;
	if (team === 'FIFA World Cup History') return 'history';
	if (team === 'Coca-Cola') return 'coca-cola';
	return 'intro';
}

export function getSectionLabel(key: SectionKey): string {
	if (key === 'intro') return 'Introducción';
	if (key === 'history') return 'Historia del Mundial';
	if (key === 'coca-cola') return 'Coca-Cola';
	return `Grupo ${key.replace('group-', '')}`;
}

export const SECTION_ORDER: SectionKey[] = [
	'intro',
	...GROUP_ORDER.map((g) => `group-${g}` as SectionKey),
	'history',
	'coca-cola'
];

// Figuritas stores its collection as two bitsets. Its order differs from the
// display/seed order here: the eleven historical stickers (FWC9–FWC19) live
// immediately after FWC8, whereas our catalog displays them at the end.
//
// Keep this interoperability order independent of the UI order. Figuritas'
// optional Coca-Cola block follows the 980 base positions. Its first bit is
// reserved by Figuritas; the 13 known Coca-Cola stickers occupy 981–993.
const FIGURITAS_INTRO_CODES = ['00', 'FWC1', 'FWC2', 'FWC3', 'FWC4', 'FWC5', 'FWC6', 'FWC7', 'FWC8'];
const FIGURITAS_HISTORY_CODES = [
	'FWC9',
	'FWC10',
	'FWC11',
	'FWC12',
	'FWC13',
	'FWC14',
	'FWC15',
	'FWC16',
	'FWC17',
	'FWC18',
	'FWC19'
];
const FIGURITAS_COCA_COLA_CODES = Array.from({ length: 13 }, (_, index) => `COC${index + 1}`);
export const FIGURITAS_BASE_STICKER_COUNT = 980;

// Used to map each base-collection bit position in a Figuritas QR to a
// sticker code. The optional Coca-Cola positions remain reserved by being
// outside this list; they are appended by Figuritas after these 980 entries.
export function catalogOrderedCodes(items: StickerItem[]): string[] {
	const byCode = new Map(
		items.filter((item) => !isSpecialVariant(item.code)).map((item) => [item.code, item])
	);
	const orderedSpecialCodes = [...FIGURITAS_INTRO_CODES, ...FIGURITAS_HISTORY_CODES];
	const nonBaseCodeSet = new Set([...orderedSpecialCodes, ...FIGURITAS_COCA_COLA_CODES]);
	const knownSpecialCodes = orderedSpecialCodes.filter((code) => byCode.has(code));
	const remainingCodes = items
		.filter((item) => !isSpecialVariant(item.code) && !nonBaseCodeSet.has(item.code))
		.map((item) => item.code);

	return [...knownSpecialCodes, ...remainingCodes];
}

// Slot 980 is deliberately null: Figuritas reserves it, but it does not map
// to a sticker in the observed QR samples. Null slots preserve bit positions
// while being ignored by migration and trade calculations.
export function figuritasQrSlots(items: StickerItem[]): Array<string | null> {
	const knownCodes = new Set(
		items.filter((item) => !isSpecialVariant(item.code)).map((item) => item.code)
	);
	return [
		...catalogOrderedCodes(items),
		null,
		...FIGURITAS_COCA_COLA_CODES.map((code) => (knownCodes.has(code) ? code : null))
	];
}
