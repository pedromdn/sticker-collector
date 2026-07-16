import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	STICKER_IMAGE_BUCKET,
	STICKER_IMAGE_SIZES,
	SAFE_STICKER_IMAGE_FILENAME,
	resolveStickerImagePath,
	type StickerImageSize
} from '$lib/server/stickerImagePaths';

const SIGNED_URL_TTL_SECONDS = 300;

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	const img = url.searchParams.get('img');
	const sizeParam = url.searchParams.get('size') ?? 'original';

	if (!img || !SAFE_STICKER_IMAGE_FILENAME.test(img)) {
		error(400, 'invalid image name');
	}
	if (!STICKER_IMAGE_SIZES.includes(sizeParam as StickerImageSize)) {
		error(400, 'invalid size');
	}

	const path = resolveStickerImagePath(img, sizeParam as StickerImageSize);

	const { data, error: signError } = await supabase.storage
		.from(STICKER_IMAGE_BUCKET)
		.createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

	if (signError || !data) {
		error(404, 'image not found');
	}

	return json({ url: data.signedUrl });
};
