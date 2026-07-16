<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { matchStickerCode } from '$lib/ocrMatch';

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

	let canvasEl: HTMLCanvasElement;
	let stream: MediaStream | undefined;
	let worker: import('tesseract.js').Worker | undefined;
	let loopHandle: ReturnType<typeof setTimeout> | undefined;
	let destroyed = false;
	let running = false;

	let lastCode = '';
	let lastAt = 0;

	// Tunable pending real-world testing: interval balances responsiveness
	// against OCR cost; cooldown stops a sticker sitting still in frame from
	// being counted repeatedly while still letting a *different* code (the
	// next sticker) trigger immediately.
	const INTERVAL_MS = 700;
	const COOLDOWN_MS = 2000;

	// Top-right corner, as a fraction of the video's native frame — matches
	// where Panini prints the code on the sticker back. No CSS aspect-ratio
	// cropping is applied to the <video> so this maps 1:1 onto what's shown.
	const GUIDE = { x: 0.45, y: 0.06, w: 0.5, h: 0.22 };

	onMount(async () => {
		canvasEl = document.createElement('canvas');

		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: {
					facingMode: 'environment',
					width: { ideal: 1280 },
					height: { ideal: 960 }
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

	function scheduleNextScan() {
		if (destroyed || !running) return;
		loopHandle = setTimeout(runScan, INTERVAL_MS);
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

		const sx = Math.round(vw * GUIDE.x);
		const sy = Math.round(vh * GUIDE.y);
		const sw = Math.round(vw * GUIDE.w);
		const sh = Math.round(vh * GUIDE.h);

		const scale = 1.5;
		canvasEl.width = Math.round(sw * scale);
		canvasEl.height = Math.round(sh * scale);
		const ctx = canvasEl.getContext('2d');
		if (!ctx) {
			scheduleNextScan();
			return;
		}
		ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, canvasEl.width, canvasEl.height);

		// Grayscale + hard threshold — the preprocessing that read cleanest
		// against real sticker-back photos during offline testing.
		const imageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
		const px = imageData.data;
		for (let i = 0; i < px.length; i += 4) {
			const grey = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
			const v = grey > 128 ? 255 : 0;
			px[i] = px[i + 1] = px[i + 2] = v;
		}
		ctx.putImageData(imageData, 0, 0);

		try {
			const {
				data: { text }
			} = await worker.recognize(canvasEl);
			const matched = matchStickerCode(text, knownCodes);
			if (matched) {
				const now = Date.now();
				if (matched !== lastCode || now - lastAt > COOLDOWN_MS) {
					lastCode = matched;
					lastAt = now;
					onDetected(matched);
				}
			}
		} catch {
			// Isolated OCR failure — just try again next tick.
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
		<div
			class="pointer-events-none absolute rounded-md border-2 border-emerald-400/80"
			style="left: {GUIDE.x * 100}%; top: {GUIDE.y * 100}%; width: {GUIDE.w * 100}%; height: {GUIDE.h *
				100}%;"
		></div>
		<p
			class="pointer-events-none absolute bottom-2 left-0 right-0 px-2 text-center text-xs text-white drop-shadow"
		>
			Alinea el código (esquina superior derecha del reverso) dentro del recuadro
		</p>
		{#if starting}
			<div
				class="absolute inset-0 flex items-center justify-center bg-black/50 text-sm text-white"
			>
				Iniciando cámara…
			</div>
		{/if}
	{/if}
</div>

