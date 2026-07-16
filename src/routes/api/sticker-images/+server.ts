import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	STICKER_IMAGE_BUCKET,
	STICKER_IMAGE_SIZES,
	SAFE_STICKER_IMAGE_FILENAME,
	resolveStickerImagePath,
	type StickerImageSize
} from '$lib/server/stickerImagePaths';

// Longer-lived than the single-image endpoint: this is meant to be prefetched
// once per session in the background, well before most of the URLs get used.
const SIGNED_URL_TTL_SECONDS = 3600;

export const POST: RequestHandler = async ({ request, locals: { supabase } }) => {
	const body = await request.json().catch(() => null);
	const imgs: unknown = body?.imgs;
	const sizeParam = body?.size ?? 'original';

	if (!Array.isArray(imgs) || !STICKER_IMAGE_SIZES.includes(sizeParam as StickerImageSize)) {
		error(400, 'invalid request');
	}

	const validImgs = [
		...new Set(
			imgs.filter(
				(img): img is string => typeof img === 'string' && SAFE_STICKER_IMAGE_FILENAME.test(img)
			)
		)
	];

	if (validImgs.length === 0) {
		return json({ urls: {} });
	}

	const size = sizeParam as StickerImageSize;
	const paths = validImgs.map((img) => resolveStickerImagePath(img, size));

	const { data, error: signError } = await supabase.storage
		.from(STICKER_IMAGE_BUCKET)
		.createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

	if (signError || !data) {
		error(500, 'failed to sign urls');
	}

	const urls: Record<string, string> = {};
	data.forEach((entry, i) => {
		if (entry.signedUrl) urls[validImgs[i]] = entry.signedUrl;
	});

	return json({ urls });
};
