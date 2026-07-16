// Generates "mid" and "thumb" WebP variants for every sticker image already
// in the private "sticker-images" Supabase Storage bucket, uploading them to
// mid/<basename>.webp and thumb/<basename>.webp inside that same bucket.
// Originals in the bucket root are left untouched (kept for a future
// full-screen view).
//
// Run with: node --env-file=.env scripts/resize-sticker-images.mjs
// Requires SUPABASE_SERVICE_ROLE_KEY in .env — bucket is private, so reading
// and writing arbitrary objects needs the service role, not the anon key.

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const BUCKET = 'sticker-images';
const VARIANTS = [
	{ folder: 'mid', width: 600, quality: 78 },
	{ folder: 'thumb', width: 150, quality: 70 }
];
const CONCURRENCY = 8;

const url = process.env.PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
	console.error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.');
	console.error('Run with: node --env-file=.env scripts/resize-sticker-images.mjs');
	process.exit(1);
}

const supabase = createClient(url, serviceKey);

function baseName(filename) {
	const dot = filename.lastIndexOf('.');
	return dot === -1 ? filename : filename.slice(0, dot);
}

async function listOriginals() {
	const { data, error } = await supabase.storage.from(BUCKET).list('', { limit: 1000 });
	if (error) throw error;
	// Folders (mid/, thumb/) show up as entries with no metadata — skip those.
	return (data ?? []).filter((entry) => entry.metadata !== null);
}

async function processOne(file) {
	const { data: blob, error: downloadError } = await supabase.storage
		.from(BUCKET)
		.download(file.name);
	if (downloadError) throw new Error(`download ${file.name}: ${downloadError.message}`);

	const originalBuffer = Buffer.from(await blob.arrayBuffer());
	const base = baseName(file.name);

	for (const variant of VARIANTS) {
		const resized = await sharp(originalBuffer)
			.resize({ width: variant.width, height: variant.width, fit: 'inside', withoutEnlargement: true })
			.webp({ quality: variant.quality })
			.toBuffer();

		const path = `${variant.folder}/${base}.webp`;
		const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, resized, {
			contentType: 'image/webp',
			upsert: true
		});
		if (uploadError) throw new Error(`upload ${path}: ${uploadError.message}`);
	}
}

async function runWithConcurrency(items, limit, worker) {
	let index = 0;
	let done = 0;
	const errors = [];

	async function next() {
		while (index < items.length) {
			const i = index++;
			const item = items[i];
			try {
				await worker(item);
			} catch (err) {
				errors.push({ item, error: err });
			}
			done++;
			if (done % 25 === 0 || done === items.length) {
				console.log(`${done}/${items.length} processed`);
			}
		}
	}

	await Promise.all(Array.from({ length: limit }, next));
	return errors;
}

const originals = await listOriginals();
console.log(`Found ${originals.length} original images in "${BUCKET}".`);

const errors = await runWithConcurrency(originals, CONCURRENCY, processOne);

if (errors.length > 0) {
	console.log(`\n${errors.length} file(s) failed:`);
	for (const { item, error } of errors) {
		console.log(`  ${item.name}: ${error.message}`);
	}
	process.exitCode = 1;
} else {
	console.log('\nAll images resized and uploaded successfully.');
}
