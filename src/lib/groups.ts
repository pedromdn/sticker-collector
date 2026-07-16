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

export type SectionKey = 'intro' | `group-${(typeof GROUP_ORDER)[number]}` | 'history';

// Foil/variant stickers (code ends in "s", e.g. GER10s) display inside
// their team section, but are still skipped when exporting Figuritas QR codes.
export function isSpecialVariant(code: string): boolean {
	return code.endsWith('s');
}

export function getSectionKey(team: string, code: string): SectionKey {
	const group = TEAM_GROUP[team];
	if (group) return `group-${group}` as SectionKey;
	if (team === 'FIFA World Cup History') return 'history';
	return 'intro';
}

export function getSectionLabel(key: SectionKey): string {
	if (key === 'intro') return 'Introducción';
	if (key === 'history') return 'Historia del Mundial';
	return `Grupo ${key.replace('group-', '')}`;
}

export const SECTION_ORDER: SectionKey[] = [
	'intro',
	...GROUP_ORDER.map((g) => `group-${g}` as SectionKey),
	'history'
];

// Figuritas' checklist (980 stickers) matches this app's catalog order minus
// the 54 special-variant stickers, which Figuritas doesn't track separately.
// Used to map each bit position in a decoded Figuritas QR to a sticker code.
export function catalogOrderedCodes(items: StickerItem[]): string[] {
	return items.filter((item) => !isSpecialVariant(item.code)).map((item) => item.code);
}
