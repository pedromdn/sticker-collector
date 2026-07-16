<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import QrScanner from 'qr-scanner';

	let {
		onDecode,
		onError
	}: {
		onDecode: (text: string) => void;
		onError?: (message: string) => void;
	} = $props();

	let videoEl = $state<HTMLVideoElement>();
	let scanner: QrScanner | undefined;
	let cameraError = $state('');
	let starting = $state(true);

	onMount(async () => {
		if (!videoEl) return;

		const hasCamera = await QrScanner.hasCamera().catch(() => false);
		if (!hasCamera) {
			cameraError = 'No se detectó ninguna cámara en este dispositivo.';
			starting = false;
			onError?.(cameraError);
			return;
		}

		scanner = new QrScanner(videoEl, (result) => onDecode(result.data), {
			preferredCamera: 'environment',
			highlightScanRegion: true,
			highlightCodeOutline: true,
			returnDetailedScanResult: true
		});

		try {
			await scanner.start();
		} catch {
			cameraError =
				'No pudimos acceder a la cámara. Revisa los permisos del navegador o pega el texto manualmente.';
			onError?.(cameraError);
		} finally {
			starting = false;
		}
	});

	onDestroy(() => {
		scanner?.stop();
		scanner?.destroy();
	});
</script>

<div class="overflow-hidden rounded-xl border border-slate-800 bg-black">
	{#if cameraError}
		<div class="p-6 text-center text-sm text-red-300">{cameraError}</div>
	{:else}
		<div class="relative">
			<video bind:this={videoEl} class="aspect-square w-full object-cover" muted playsinline
			></video>
			{#if starting}
				<div class="absolute inset-0 flex items-center justify-center bg-black/60">
					<p class="text-xs text-slate-300">Abriendo cámara…</p>
				</div>
			{/if}
		</div>
	{/if}
</div>
