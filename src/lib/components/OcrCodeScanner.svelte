<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { matchStickerCode } from '$lib/ocrMatch';
	import { locateCodeCandidates, otsuThreshold, toGrayscale, type CandidateBox } from '$lib/codeLocator';

	let {
		knownCodes,
		onDetected
	}: {
		knownCodes: string[];
		onDetected: (code: string) => void;
	} = $props();

	let videoEl = $state<HTMLVideoElement>();
	let starting = $state(true);
	let cameraError = $state('');
	let highlight = $state<CandidateBox | null>(null);
	let zoom = $state(1);
	let zoomRange = $state<{ min: number; max: number; step: number } | null>(null);

	let detectCanvas: HTMLCanvasElement;
	let ocrCanvas: HTMLCanvasElement;
	let stream: MediaStream | undefined;
	let track: MediaStreamTrack | undefined;
	let worker: import('tesseract.js').Worker | undefined;
	let loopHandle: ReturnType<typeof setTimeout> | undefined;
	let destroyed = false;
	let running = false;

	let lastCode = '';
	let lastAt = 0;

	// The scan loop self-paces (next cycle is scheduled only after the current
	// one finishes), so this is idle time between cycles, not a fixed rate.
	const INTERVAL_MS = 500;
	// Stops a sticker sitting still in frame from being counted repeatedly,
	// while a *different* code (the next sticker) still triggers immediately.
	const COOLDOWN_MS = 2000;
	// Frame width the localization pass runs at — small keeps it cheap.
	const DETECT_WIDTH = 360;
	// Width candidate crops are upscaled to before OCR.
	const OCR_WIDTH = 700;
	// A fuzzy (1-char-corrected) read must repeat across frames within this
	// window before it counts; an exact read confirms immediately.
	const VOTE_WINDOW_MS = 4000;

	const votes = new Map<string, { count: number; last: number }>();

	onMount(async () => {
		detectCanvas = document.createElement('canvas');
		ocrCanvas = document.createElement('canvas');

		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: {
					facingMode: 'environment',
					width: { ideal: 1920 },
					height: { ideal: 1440 }
				}
			});
		} catch {
			cameraError = 'No pudimos acceder a la cámara. Revisa los permisos del navegador.';
			starting = false;
			return;
		}

		if (destroyed) {
			stream.getTracks().forEach((t) => t.stop());
			return;
		}

		[track] = stream.getVideoTracks();

		// Continuous autofocus where the browser exposes it (mostly Android
		// Chrome). Best-effort: unsupported constraints just reject.
		try {
			await track.applyConstraints({
				advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet]
			});
		} catch {
			// Not supported — the camera keeps its default focus behavior.
		}

		// Native camera zoom lets phones that can't focus up close magnify
		// without physically approaching (which would break focus).
		type ZoomCapabilities = MediaTrackCapabilities & {
			zoom?: { min: number; max: number; step: number };
		};
		const caps = (track.getCapabilities?.() ?? {}) as ZoomCapabilities;
		if (caps.zoom && caps.zoom.max > caps.zoom.min) {
			zoomRange = {
				min: caps.zoom.min,
				max: Math.min(caps.zoom.max, 5),
				step: caps.zoom.step || 0.5
			};
			zoom = caps.zoom.min;
		}

		if (videoEl) {
			videoEl.srcObject = stream;
			await videoEl.play();
		}

		try {
			const { createWorker, PSM } = await import('tesseract.js');
			worker = await createWorker('eng');
			await worker.setParameters({
				tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
				tessedit_pageseg_mode: PSM.SINGLE_LINE
			});
		} catch {
			cameraError = 'No se pudo cargar el reconocimiento de texto. Intenta de nuevo.';
			starting = false;
			return;
		}

		if (destroyed) {
			worker?.terminate();
			return;
		}

		starting = false;
		running = true;
		scheduleNextScan();
	});

	async function applyZoom(value: number) {
		if (!track || !zoomRange) return;
		zoom = Math.min(zoomRange.max, Math.max(zoomRange.min, value));
		try {
			await track.applyConstraints({ advanced: [{ zoom } as MediaTrackConstraintSet] });
		} catch {
			// Ignore — zoom stays where it was.
		}
	}

	function scheduleNextScan() {
		if (destroyed || !running) return;
		loopHandle = setTimeout(runScan, INTERVAL_MS);
	}

	/** Crop a candidate (plus padding) from the live frame, upscale, Otsu-binarize, fix polarity. */
	function prepareCrop(video: HTMLVideoElement, cand: CandidateBox): HTMLCanvasElement | null {
		const vw = video.videoWidth;
		const vh = video.videoHeight;
		const padX = cand.w * 0.1;
		const padY = cand.h * 0.3;
		const sx = Math.max(0, Math.round((cand.x - padX) * vw));
		const sy = Math.max(0, Math.round((cand.y - padY) * vh));
		const sw = Math.min(vw - sx, Math.round((cand.w + padX * 2) * vw));
		const sh = Math.min(vh - sy, Math.round((cand.h + padY * 2) * vh));
		if (sw < 8 || sh < 8) return null;

		const scale = Math.max(1, OCR_WIDTH / sw);
		ocrCanvas.width = Math.round(sw * scale);
		ocrCanvas.height = Math.round(sh * scale);
		const ctx = ocrCanvas.getContext('2d', { willReadFrequently: true });
		if (!ctx) return null;
		ctx.drawImage(video, sx, sy, sw, sh, 0, 0, ocrCanvas.width, ocrCanvas.height);

		const imageData = ctx.getImageData(0, 0, ocrCanvas.width, ocrCanvas.height);
		const px = imageData.data;
		const pixelCount = ocrCanvas.width * ocrCanvas.height;
		const gray = toGrayscale(px, pixelCount);
		const t = otsuThreshold(gray);
		let darkCount = 0;
		for (let i = 0; i < pixelCount; i++) if (gray[i] < t) darkCount++;
		// Tesseract wants dark text on light background; a solid dark pill
		// with white glyphs is mostly-dark, so flip it.
		const invert = darkCount > pixelCount / 2;
		for (let i = 0; i < pixelCount; i++) {
			const isDark = gray[i] < t;
			const v = (invert ? !isDark : isDark) ? 0 : 255;
			const o = i * 4;
			px[o] = px[o + 1] = px[o + 2] = v;
		}
		ctx.putImageData(imageData, 0, 0);
		return ocrCanvas;
	}

	function registerRead(rawText: string): string | null {
		const matched = matchStickerCode(rawText, knownCodes);
		if (!matched) return null;

		const cleaned = rawText.toUpperCase().replace(/[^A-Z0-9]/g, '');
		const exact = cleaned === matched;
		if (exact) return matched;

		// Fuzzy correction: require agreement across frames before trusting it.
		const now = Date.now();
		const entry = votes.get(matched);
		if (entry && now - entry.last <= VOTE_WINDOW_MS) {
			entry.count += 1;
			entry.last = now;
			if (entry.count >= 2) {
				votes.delete(matched);
				return matched;
			}
		} else {
			votes.set(matched, { count: 1, last: now });
		}
		return null;
	}

	async function runScan() {
		if (destroyed || !worker || !videoEl || videoEl.readyState < 2) {
			scheduleNextScan();
			return;
		}

		const vw = videoEl.videoWidth;
		const vh = videoEl.videoHeight;
		if (vw === 0 || vh === 0) {
			scheduleNextScan();
			return;
		}

		// Localization pass on a downscaled frame.
		const dw = DETECT_WIDTH;
		const dh = Math.round((vh / vw) * dw);
		detectCanvas.width = dw;
		detectCanvas.height = dh;
		const dctx = detectCanvas.getContext('2d', { willReadFrequently: true });
		if (!dctx) {
			scheduleNextScan();
			return;
		}
		dctx.drawImage(videoEl, 0, 0, dw, dh);
		const frame = dctx.getImageData(0, 0, dw, dh);
		const candidates = locateCodeCandidates(frame.data, dw, dh, 3);
		highlight = candidates[0] ?? null;

		try {
			for (const cand of candidates) {
				const crop = prepareCrop(videoEl, cand);
				if (!crop) continue;

				const {
					data: { text }
				} = await worker.recognize(crop);
				const confirmed = registerRead(text);
				if (confirmed) {
					const now = Date.now();
					if (confirmed !== lastCode || now - lastAt > COOLDOWN_MS) {
						lastCode = confirmed;
						lastAt = now;
						highlight = cand;
						onDetected(confirmed);
					}
					break;
				}
			}
		} catch {
			// Isolated OCR failure — just try again next cycle.
		}

		scheduleNextScan();
	}

	onDestroy(() => {
		destroyed = true;
		running = false;
		if (loopHandle) clearTimeout(loopHandle);
		stream?.getTracks().forEach((t) => t.stop());
		worker?.terminate();
	});
</script>

<div class="relative overflow-hidden rounded-xl border border-slate-800 bg-black">
	{#if cameraError}
		<div class="flex min-h-[240px] items-center justify-center p-6 text-center text-sm text-red-300">
			{cameraError}
		</div>
	{:else}
		<!-- svelte-ignore a11y_media_has_caption -->
		<video bind:this={videoEl} class="block w-full" muted playsinline></video>
		{#if highlight}
			<div
				class="pointer-events-none absolute rounded border-2 border-emerald-400/90 transition-all duration-200"
				style="left: {highlight.x * 100}%; top: {highlight.y * 100}%; width: {highlight.w *
					100}%; height: {highlight.h * 100}%;"
			></div>
		{/if}
		<p
			class="pointer-events-none absolute bottom-2 left-0 right-0 px-2 text-center text-xs text-white drop-shadow"
		>
			Muestra el reverso a la cámara — el código se detecta solo. Aleja el teléfono hasta que
			enfoque bien.
		</p>
		{#if zoomRange}
			<div class="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-1">
				<button
					type="button"
					onclick={() => applyZoom(zoom - (zoomRange?.step ?? 0.5))}
					class="flex h-7 w-7 items-center justify-center rounded-full text-white hover:bg-white/20"
				>
					−
				</button>
				<span class="min-w-8 text-center text-xs text-white">{zoom.toFixed(1)}x</span>
				<button
					type="button"
					onclick={() => applyZoom(zoom + (zoomRange?.step ?? 0.5))}
					class="flex h-7 w-7 items-center justify-center rounded-full text-white hover:bg-white/20"
				>
					+
				</button>
			</div>
		{/if}
		{#if starting}
			<div class="absolute inset-0 flex items-center justify-center bg-black/50 text-sm text-white">
				Iniciando cámara…
			</div>
		{/if}
	{/if}
</div>
