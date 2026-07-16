import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const BUCKET = 'sticker-images';
const SIGNED_URL_TTL_SECONDS = 300;

// The bucket only ever holds flat "<digits>.png"-style filenames — reject
// anything else so this can't be used to sign arbitrary storage paths.
const SAFE_FILENAME = /^[\w.-]+$/;

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	const img = url.searchParams.get('img');
	if (!img || !SAFE_FILENAME.test(img)) {
		error(400, 'invalid image name');
	}

	const { data, error: signError } = await supabase.storage
		.from(BUCKET)
		.createSignedUrl(img, SIGNED_URL_TTL_SECONDS);

	if (signError || !data) {
		error(404, 'image not found');
	}

	return json({ url: data.signedUrl });
};
