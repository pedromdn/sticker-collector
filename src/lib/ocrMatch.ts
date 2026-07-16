// Corrects raw OCR text against the known sticker-code list. OCR of the
// small, condensed code printed on a sticker's back is inherently noisy —
// this recovers a clean code from a slightly-misread string rather than
// requiring a pixel-perfect read.

function normalize(raw: string): string {
	return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function levenshtein(a: string, b: string): number {
	const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
		new Array(b.length + 1).fill(0)
	);
	for (let i = 0; i <= a.length; i++) dp[i][0] = i;
	for (let j = 0; j <= b.length; j++) dp[0][j] = j;
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			dp[i][j] =
				a[i - 1] === b[j - 1]
					? dp[i - 1][j - 1]
					: 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
		}
	}
	return dp[a.length][b.length];
}

/**
 * Matches raw OCR text against `knownCodes` (expected pre-normalized to
 * uppercase alphanumeric). Exact match first; otherwise a single-character
 * correction only, and only when unambiguous — short codes (under 4 chars)
 * skip fuzzy correction entirely since too many real codes sit within edit
 * distance 1 of each other at that length.
 */
export function matchStickerCode(rawText: string, knownCodes: string[]): string | null {
	const cleaned = normalize(rawText);
	if (cleaned.length === 0) return null;
	if (knownCodes.includes(cleaned)) return cleaned;
	if (cleaned.length < 4) return null;

	let best: string | null = null;
	let bestDist = Infinity;
	let ambiguous = false;
	for (const known of knownCodes) {
		if (Math.abs(known.length - cleaned.length) > 1) continue;
		const dist = levenshtein(cleaned, known);
		if (dist < bestDist) {
			bestDist = dist;
			best = known;
			ambiguous = false;
		} else if (dist === bestDist) {
			ambiguous = true;
		}
	}

	if (best !== null && bestDist <= 1 && !ambiguous) return best;
	return null;
}
