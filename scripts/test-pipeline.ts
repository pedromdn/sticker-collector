// End-to-end check of the smart pipeline: locate candidates → crop+pad from
// full-res → scale to OCR width → Otsu binarize → normalize polarity →
// Tesseract → fuzzy match. Mirrors what OcrCodeScanner will do per frame.
import sharp from 'sharp';
import { createWorker, PSM } from 'tesseract.js';
import { locateCodeCandidates, otsuThreshold, toGrayscale } from '../src/lib/codeLocator';
import { matchStickerCode } from '../src/lib/ocrMatch';

const cases = [
	{ file: 'back-sticker-examples/s-l400.jpg', expected: 'ESP15' },
	{ file: 'back-sticker-examples/uzb.jpg', expected: 'UZB8' },
	{ file: 'back-sticker-examples/Screenshot 2026-07-16 082912.jpg', expected: 'FRA20' }
];

// Codes present in the real catalog that we care about matching.
const knownCodes = ['ESP15', 'UZB8', 'FRA20', 'ESP1', 'UZB18', 'FRA2', 'MEX10', 'GER15'];

const DETECT_WIDTH = 360;
const OCR_WIDTH = 700;

const worker = await createWorker('eng');
await worker.setParameters({
	tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
	tessedit_pageseg_mode: PSM.SINGLE_LINE
});

for (const c of cases) {
	const det = await sharp(c.file)
		.resize({ width: DETECT_WIDTH })
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	const clamped = new Uint8ClampedArray(det.data.buffer, det.data.byteOffset, det.data.byteLength);
	const candidates = locateCodeCandidates(clamped, det.info.width, det.info.height, 3);

	const meta = await sharp(c.file).metadata();
	const fw = meta.width!;
	const fh = meta.height!;

	let found: string | null = null;
	for (const cand of candidates) {
		const padX = cand.w * 0.1;
		const padY = cand.h * 0.3;
		const left = Math.max(0, Math.round((cand.x - padX) * fw));
		const top = Math.max(0, Math.round((cand.y - padY) * fh));
		const cw = Math.min(fw - left, Math.round((cand.w + padX * 2) * fw));
		const ch = Math.min(fh - top, Math.round((cand.h + padY * 2) * fh));
		if (cw < 8 || ch < 8) continue;

		// Crop, upscale, then binarize with per-crop Otsu + polarity fix,
		// exactly as the scanner will.
		const crop = await sharp(c.file)
			.extract({ left, top, width: cw, height: ch })
			.resize({ width: OCR_WIDTH })
			.ensureAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });
		const cropClamped = new Uint8ClampedArray(crop.data.buffer, crop.data.byteOffset, crop.data.byteLength);
		const pixelCount = crop.info.width * crop.info.height;
		const gray = toGrayscale(cropClamped, pixelCount);
		const t = otsuThreshold(gray);
		let darkCount = 0;
		for (let i = 0; i < pixelCount; i++) if (gray[i] < t) darkCount++;
		const invert = darkCount > pixelCount / 2; // white-on-dark pill → flip to dark-on-light
		const bin = Buffer.alloc(pixelCount);
		for (let i = 0; i < pixelCount; i++) {
			const isDark = gray[i] < t;
			bin[i] = (invert ? !isDark : isDark) ? 0 : 255;
		}
		const png = await sharp(bin, {
			raw: { width: crop.info.width, height: crop.info.height, channels: 1 }
		})
			.png()
			.toBuffer();

		const {
			data: { text }
		} = await worker.recognize(png);
		const matched = matchStickerCode(text, knownCodes);
		console.log(
			`${c.file.split('/').pop()} candidate(${cand.x.toFixed(2)},${cand.y.toFixed(2)}) invert=${invert} raw=${JSON.stringify(text.trim())} -> ${matched}`
		);
		if (matched) {
			found = matched;
			break;
		}
	}
	console.log(`==> ${c.expected}: ${found === c.expected ? 'PASS' : `FAIL (got ${found})`}\n`);
}

await worker.terminate();
