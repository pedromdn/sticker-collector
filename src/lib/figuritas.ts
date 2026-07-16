// Decoder for the "Figuritas" app's collection QR format. Reverse-engineered
// from a single sample QR — best-effort, not officially documented. Keep
// this module pure (no catalog/Supabase imports) so it stays independently
// testable and the bit-order/polarity logic stays in one obvious place.
//
// Format: "⋋~<base64A>;<base64B>", each segment gzip-compressed then
// base64-encoded. Each decompressed segment is a bitset, LSB-first within
// each byte (verified against a sample: with this order the trailing
// padding bits land cleanly on 0; MSB-first does not).

const QR_PREFIX = '⋋~';

export class FiguritasError extends Error {}
export class FiguritasFormatError extends FiguritasError {}
export class FiguritasUnsupportedError extends FiguritasError {}
export class FiguritasDecodeError extends FiguritasError {}
export class FiguritasLengthMismatchError extends FiguritasError {
	expected: number;
	actualBitsA: number;
	actualBitsB: number;

	constructor(expected: number, actualBitsA: number, actualBitsB: number) {
		super(`Se esperaban ${expected} stickers pero el código trae ${actualBitsA}/${actualBitsB} bits.`);
		this.expected = expected;
		this.actualBitsA = actualBitsA;
		this.actualBitsB = actualBitsB;
	}
}

export type FiguritasEntry = {
	code: string;
	/** Segment A, bit=1 (raw, pre-invert). Working hypothesis: 1 = "me falta". */
	missing: boolean;
	/** Segment B, bit=1 (raw, pre-invert). Working hypothesis: 1 = "tengo repetido". */
	hasDuplicate: boolean;
};

export type FiguritasCollection = {
	entries: FiguritasEntry[];
	meta: { segmentABits: number; segmentBBits: number };
};

function parseQrEnvelope(raw: string): { segmentA: string; segmentB: string } {
	const trimmed = raw.trim();
	const withoutPrefix = trimmed.startsWith(QR_PREFIX) ? trimmed.slice(QR_PREFIX.length) : trimmed;
	const parts = withoutPrefix.split(';');
	if (parts.length !== 2 || !parts[0] || !parts[1]) {
		throw new FiguritasFormatError('El código no tiene el formato esperado de Figuritas.');
	}
	return { segmentA: parts[0], segmentB: parts[1] };
}

function base64ToBytes(b64: string): Uint8Array {
	let binary: string;
	try {
		binary = atob(b64);
	} catch {
		throw new FiguritasDecodeError('No se pudo leer el base64 del código.');
	}
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
	if (typeof DecompressionStream === 'undefined') {
		throw new FiguritasUnsupportedError('Este navegador no soporta descompresión gzip nativa.');
	}
	try {
		const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
		const buffer = await new Response(stream).arrayBuffer();
		return new Uint8Array(buffer);
	} catch {
		throw new FiguritasDecodeError('No se pudo descomprimir el contenido del código.');
	}
}

function bitAt(bytes: Uint8Array, index: number): boolean {
	const byteIndex = index >> 3;
	const bitIndex = index & 7;
	return ((bytes[byteIndex] >> bitIndex) & 1) === 1;
}

/**
 * Decodes a Figuritas QR payload into one entry per code in `orderedCodes`,
 * assuming bit N of each segment corresponds to `orderedCodes[N]`.
 */
export async function decodeFiguritasQr(
	raw: string,
	orderedCodes: string[]
): Promise<FiguritasCollection> {
	const { segmentA, segmentB } = parseQrEnvelope(raw);
	const [bytesA, bytesB] = await Promise.all([
		gunzip(base64ToBytes(segmentA)),
		gunzip(base64ToBytes(segmentB))
	]);

	const n = orderedCodes.length;
	const bitsA = bytesA.length * 8;
	const bitsB = bytesB.length * 8;
	if (bitsA < n || bitsB < n) {
		throw new FiguritasLengthMismatchError(n, bitsA, bitsB);
	}

	const entries = orderedCodes.map((code, i) => ({
		code,
		missing: bitAt(bytesA, i),
		hasDuplicate: bitAt(bytesB, i)
	}));

	return { entries, meta: { segmentABits: bitsA, segmentBBits: bitsB } };
}

/**
 * Flips the missing/hasDuplicate polarity without re-decoding — the "invertir
 * interpretación" safety valve, since bit polarity is an unverified guess.
 */
export function invertFiguritasCollection(collection: FiguritasCollection): FiguritasCollection {
	return {
		...collection,
		entries: collection.entries.map((entry) => ({
			...entry,
			missing: !entry.missing,
			hasDuplicate: !entry.hasDuplicate
		}))
	};
}
