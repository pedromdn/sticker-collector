export const STICKER_IMAGE_BUCKET = 'sticker-images';

export type StickerImageSize = 'original' | 'mid' | 'thumb';
export const STICKER_IMAGE_SIZES: StickerImageSize[] = ['original', 'mid', 'thumb'];

// The bucket only ever holds flat "<digits>.png"-style filenames — reject
// anything else so this can't be used to sign arbitrary storage paths.
export const SAFE_STICKER_IMAGE_FILENAME = /^[\w.-]+$/;

function baseName(filename: string): string {
	const dot = filename.lastIndexOf('.');
	return dot === -1 ? filename : filename.slice(0, dot);
}

// "original" is the exact filename in the bucket root; "mid"/"thumb" are
// pre-generated WebP variants under their own folder (see
// scripts/resize-sticker-images.mjs).
export function resolveStickerImagePath(img: string, size: StickerImageSize): string {
	if (size === 'original') return img;
	return `${size}/${baseName(img)}.webp`;
}
