import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const BUCKET = 'sticker-images';
const SIGNED_URL_TTL_SECONDS = 300;

// The bucket only ever holds flat "<digits>.png"-style filenames — reject
// anything else so this can't be used to sign arbitrary storage paths.
const SAFE_FILENAME = /^[\w.-]+$/;

type Size = 'original' | 'mid' | 'thumb';
const SIZES: Size[] = ['original', 'mid', 'thumb'];

function baseName(filename: string): string {
	const dot = filename.lastIndexOf('.');
	return dot === -1 ? filename : filename.slice(0, dot);
}

// "original" is the exact filename in the bucket root; "mid"/"thumb" are
// pre-generated WebP variants under their own folder (see
// scripts/resize-sticker-images.mjs).
function resolvePath(img: string, size: Size): string {
	if (size === 'original') return img;
	return `${size}/${baseName(img)}.webp`;
}

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	const img = url.searchParams.get('img');
	const sizeParam = url.searchParams.get('size') ?? 'original';

	if (!img || !SAFE_FILENAME.test(img)) {
		error(400, 'invalid image name');
	}
	if (!SIZES.includes(sizeParam as Size)) {
		error(400, 'invalid size');
	}

	const path = resolvePath(img, sizeParam as Size);

	const { data, error: signError } = await supabase.storage
		.from(BUCKET)
		.createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

	if (signError || !data) {
		error(404, 'image not found');
	}

	return json({ url: data.signedUrl });
};
