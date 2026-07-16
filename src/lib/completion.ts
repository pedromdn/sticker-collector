// Pure completion checks shared by Colección and Agregar, so both can fire
// the same "team complete" / "album complete" celebration regardless of
// which screen the last missing sticker was checked off from.

export function isTeamComplete<T extends { team: string }>(
	items: T[],
	team: string,
	hasIt: (item: T) => boolean
): boolean {
	const teamItems = items.filter((item) => item.team === team);
	return teamItems.length > 0 && teamItems.every(hasIt);
}

export function isAlbumComplete<T>(items: T[], hasIt: (item: T) => boolean): boolean {
	return items.length > 0 && items.every(hasIt);
}
