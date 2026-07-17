// Finds likely sticker-code regions ("FRA 20"-style pills or text lines)
// anywhere in a camera frame, so the scanner no longer needs the user to
// align the code inside a fixed guide box. Pure pixel math, no DOM/camera
// dependencies — testable in Node against still images.
//
// Approach: Otsu-binarize a downscaled frame, extract dark connected
// components, merge horizontally-adjacent ones into line boxes (a solid
// dark pill stays a single component; dark glyphs on a light pill merge
// into one line), then keep boxes whose shape plausibly matches a printed
// code. Candidates are returned as fractions of the frame so callers can
// crop from the full-resolution source.

export type CandidateBox = {
	/** All fields are fractions (0-1) of the analyzed frame. */
	x: number;
	y: number;
	w: number;
	h: number;
	score: number;
};

export function toGrayscale(data: Uint8ClampedArray, pixelCount: number): Uint8Array {
	const gray = new Uint8Array(pixelCount);
	for (let i = 0; i < pixelCount; i++) {
		const o = i * 4;
		gray[i] = (0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]) | 0;
	}
	return gray;
}

/** Classic Otsu: threshold that maximizes between-class variance. */
export function otsuThreshold(gray: Uint8Array): number {
	const hist = new Array(256).fill(0);
	for (let i = 0; i < gray.length; i++) hist[gray[i]]++;

	const total = gray.length;
	let sumAll = 0;
	for (let v = 0; v < 256; v++) sumAll += v * hist[v];

	let sumBack = 0;
	let weightBack = 0;
	let best = 127;
	let bestVariance = -1;

	for (let t = 0; t < 256; t++) {
		weightBack += hist[t];
		if (weightBack === 0) continue;
		const weightFore = total - weightBack;
		if (weightFore === 0) break;

		sumBack += t * hist[t];
		const meanBack = sumBack / weightBack;
		const meanFore = (sumAll - sumBack) / weightFore;
		const variance = weightBack * weightFore * (meanBack - meanFore) ** 2;
		if (variance > bestVariance) {
			bestVariance = variance;
			best = t;
		}
	}
	return best;
}

type Box = { x0: number; y0: number; x1: number; y1: number; pixels: number };

function extractDarkComponents(
	gray: Uint8Array,
	width: number,
	height: number,
	threshold: number
): Box[] {
	const visited = new Uint8Array(gray.length);
	const components: Box[] = [];
	const stack = new Int32Array(gray.length);

	for (let start = 0; start < gray.length; start++) {
		if (visited[start] || gray[start] >= threshold) continue;

		let stackSize = 0;
		stack[stackSize++] = start;
		visited[start] = 1;
		let x0 = width;
		let y0 = height;
		let x1 = 0;
		let y1 = 0;
		let pixels = 0;

		while (stackSize > 0) {
			const idx = stack[--stackSize];
			const x = idx % width;
			const y = (idx / width) | 0;
			pixels++;
			if (x < x0) x0 = x;
			if (x > x1) x1 = x;
			if (y < y0) y0 = y;
			if (y > y1) y1 = y;

			if (x > 0 && !visited[idx - 1] && gray[idx - 1] < threshold) {
				visited[idx - 1] = 1;
				stack[stackSize++] = idx - 1;
			}
			if (x < width - 1 && !visited[idx + 1] && gray[idx + 1] < threshold) {
				visited[idx + 1] = 1;
				stack[stackSize++] = idx + 1;
			}
			if (y > 0 && !visited[idx - width] && gray[idx - width] < threshold) {
				visited[idx - width] = 1;
				stack[stackSize++] = idx - width;
			}
			if (y < height - 1 && !visited[idx + width] && gray[idx + width] < threshold) {
				visited[idx + width] = 1;
				stack[stackSize++] = idx + width;
			}
		}

		components.push({ x0, y0, x1, y1, pixels });
	}
	return components;
}

function verticalOverlap(a: Box, b: Box): number {
	const overlap = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
	const minHeight = Math.min(a.y1 - a.y0, b.y1 - b.y0) + 1;
	return overlap / minHeight;
}

/** Merge components sitting on the same text line into one box. */
function mergeIntoLines(boxes: Box[]): Box[] {
	let lines = boxes.map((b) => ({ ...b }));
	let merged = true;
	while (merged) {
		merged = false;
		outer: for (let i = 0; i < lines.length; i++) {
			for (let j = i + 1; j < lines.length; j++) {
				const a = lines[i];
				const b = lines[j];
				const maxH = Math.max(a.y1 - a.y0, b.y1 - b.y0) + 1;
				const gap = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1);
				if (verticalOverlap(a, b) > 0.5 && gap < maxH * 0.8) {
					lines[i] = {
						x0: Math.min(a.x0, b.x0),
						y0: Math.min(a.y0, b.y0),
						x1: Math.max(a.x1, b.x1),
						y1: Math.max(a.y1, b.y1),
						pixels: a.pixels + b.pixels
					};
					lines.splice(j, 1);
					merged = true;
					break outer;
				}
			}
		}
	}
	return lines;
}

export function locateCodeCandidates(
	data: Uint8ClampedArray,
	width: number,
	height: number,
	maxCandidates = 3
): CandidateBox[] {
	const gray = toGrayscale(data, width * height);
	const threshold = otsuThreshold(gray);
	const components = extractDarkComponents(gray, width, height, threshold);

	// Pre-filter: drop noise specks and page-sized blobs before line merging.
	const plausible = components.filter((c) => {
		const h = c.y1 - c.y0 + 1;
		const w = c.x1 - c.x0 + 1;
		return c.pixels >= 8 && h >= height * 0.015 && h <= height * 0.28 && w <= width * 0.75;
	});
	// A pathological frame (noise, texture) produces thousands of components —
	// line merging is O(n²), so bail rather than stall the scan loop.
	if (plausible.length > 400) return [];

	const lines = mergeIntoLines(plausible);

	// Both merged lines and solo components are candidate pools: a light pill
	// with dark glyphs only shows up as a merged glyph line, while a solid
	// dark pill is a single component that line-merging can wrongly glue to
	// the neighboring header text (making the box too wide and rejected).
	const pool = [...lines, ...plausible];

	const candidates: CandidateBox[] = [];
	for (const box of pool) {
		const w = box.x1 - box.x0 + 1;
		const h = box.y1 - box.y0 + 1;
		const aspect = w / h;
		const hFrac = h / height;
		if (aspect < 1.6 || aspect > 9) continue;
		if (hFrac < 0.02 || hFrac > 0.15) continue;
		if (w / width < 0.06 || w / width > 0.7) continue;

		// Printed codes come out around 3-4x wider than tall; favor that
		// shape and larger (closer/sharper) text.
		const aspectFit = 1 / (1 + Math.abs(aspect - 3.5) / 3);
		candidates.push({
			x: box.x0 / width,
			y: box.y0 / height,
			w: w / width,
			h: h / height,
			score: hFrac * aspectFit
		});
	}

	candidates.sort((a, b) => b.score - a.score);

	// Dedupe near-identical boxes (a solo pill also survives as its own
	// "line" when nothing merged with it).
	const kept: CandidateBox[] = [];
	for (const cand of candidates) {
		const dup = kept.some((k) => {
			const ix = Math.max(0, Math.min(k.x + k.w, cand.x + cand.w) - Math.max(k.x, cand.x));
			const iy = Math.max(0, Math.min(k.y + k.h, cand.y + cand.h) - Math.max(k.y, cand.y));
			const inter = ix * iy;
			return inter / Math.min(k.w * k.h, cand.w * cand.h) > 0.7;
		});
		if (!dup) kept.push(cand);
		if (kept.length >= maxCandidates) break;
	}
	return kept;
}
