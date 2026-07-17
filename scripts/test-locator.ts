// Verifies codeLocator against the sample back-sticker images: the known
// code-pill region should appear among the top candidates.
import sharp from 'sharp';
import { locateCodeCandidates } from '../src/lib/codeLocator';

// Approximate ground-truth pill boxes (fractions), eyeballed from earlier crops.
const cases = [
	{ file: 'back-sticker-examples/s-l400.jpg', label: 'ESP15', truth: { x: 0.6, y: 0.0, w: 0.36, h: 0.16 } },
	{ file: 'back-sticker-examples/uzb.jpg', label: 'UZB8', truth: { x: 0.58, y: 0.19, w: 0.24, h: 0.09 } },
	{ file: 'back-sticker-examples/Screenshot 2026-07-16 082912.jpg', label: 'FRA20-lowres', truth: { x: 0.53, y: 0.01, w: 0.44, h: 0.14 } }
];

function overlaps(a: { x: number; y: number; w: number; h: number }, b: typeof a): number {
	const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
	const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
	const inter = ix * iy;
	return inter / (a.w * a.h); // fraction of the candidate inside the truth region
}

const DETECT_WIDTH = 360;

for (const c of cases) {
	const img = sharp(c.file).resize({ width: DETECT_WIDTH });
	const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	const clamped = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);

	const candidates = locateCodeCandidates(clamped, info.width, info.height, 3);
	const coverages = candidates.map((cand) => overlaps(cand, c.truth));
	const bestIdx = coverages.indexOf(Math.max(...coverages, 0));
	const hit = coverages.some((cov) => cov > 0.7);

	console.log(`${c.label}: ${hit ? 'HIT' : 'MISS'} (${candidates.length} candidates)`);
	candidates.forEach((cand, i) => {
		console.log(
			`   #${i} score=${cand.score.toFixed(4)} box=(${cand.x.toFixed(2)},${cand.y.toFixed(2)},${cand.w.toFixed(2)},${cand.h.toFixed(2)}) insideTruth=${(coverages[i] * 100).toFixed(0)}%${i === bestIdx ? ' <--' : ''}`
		);
	});

	// Save what the best candidate would hand to OCR (crop + padding from
	// the original-resolution image, as the scanner will do).
	const meta = await sharp(c.file).metadata();
	const fw = meta.width!;
	const fh = meta.height!;
	const best = candidates[bestIdx];
	if (best) {
		const padX = best.w * 0.1;
		const padY = best.h * 0.3;
		const left = Math.max(0, Math.round((best.x - padX) * fw));
		const top = Math.max(0, Math.round((best.y - padY) * fh));
		const cw = Math.min(fw - left, Math.round((best.w + padX * 2) * fw));
		const ch = Math.min(fh - top, Math.round((best.h + padY * 2) * fh));
		await sharp(c.file)
			.extract({ left, top, width: cw, height: ch })
			.toFile(`scripts/debug-${c.label}-ocr-crop.png`);
	}
}
