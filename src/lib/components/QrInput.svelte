<script lang="ts">
	import QrCameraScanner from './QrCameraScanner.svelte';

	let {
		onSubmit
	}: {
		onSubmit: (text: string) => void;
	} = $props();

	let mode = $state<'camera' | 'paste'>('camera');
	let pastedText = $state('');

	function handleCameraDecode(text: string) {
		onSubmit(text);
	}

	function handleCameraError() {
		mode = 'paste';
	}

	function handlePasteSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (pastedText.trim() === '') return;
		onSubmit(pastedText.trim());
	}
</script>

<div class="space-y-3">
	{#if mode === 'camera'}
		<QrCameraScanner onDecode={handleCameraDecode} onError={handleCameraError} />
		<button
			type="button"
			onclick={() => (mode = 'paste')}
			class="w-full text-center text-xs text-slate-500 hover:text-slate-300"
		>
			Prefiero pegar el texto manualmente
		</button>
	{:else}
		<form onsubmit={handlePasteSubmit} class="space-y-2">
			<textarea
				bind:value={pastedText}
				rows="4"
				placeholder="Pega aquí el contenido del código de Figuritas…"
				class="w-full rounded-lg border-slate-700 bg-slate-900 font-mono text-xs text-slate-100 placeholder-slate-600 focus:border-emerald-500 focus:ring-emerald-500"
			></textarea>
			<div class="flex gap-2">
				<button
					type="button"
					onclick={() => (mode = 'camera')}
					class="flex-1 rounded-md border border-slate-700 py-2 text-sm text-slate-300 hover:bg-slate-800"
				>
					Usar cámara
				</button>
				<button
					type="submit"
					class="flex-1 rounded-md bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-500"
				>
					Decodificar
				</button>
			</div>
		</form>
	{/if}
</div>
