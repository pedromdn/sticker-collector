<script lang="ts">
	import { onMount } from 'svelte';
	import QRCode from 'qrcode';
	import type { PageData } from './$types';
	import { figuritasQrSlots } from '$lib/groups';
	import { encodeFiguritasQr } from '$lib/figuritas';

	let { data }: { data: PageData } = $props();

	let qrDataUrl = $state('');
	let qrText = $state('');
	let generating = $state(true);
	let errorMessage = $state('');
	let copied = $state(false);

	onMount(async () => {
		try {
			const qrSlots = figuritasQrSlots(data.items);
			const byCode = new Map(data.items.map((item) => [item.code, item]));
			const entries = qrSlots.map((code) => {
				const item = code === null ? undefined : byCode.get(code);
				return {
					missing: item?.quantity === 0,
					hasDuplicate: (item?.quantity ?? 0) >= 2
				};
			});
			qrText = await encodeFiguritasQr(entries);
			qrDataUrl = await QRCode.toDataURL(qrText, { margin: 1, width: 320 });
		} catch {
			errorMessage = 'No se pudo generar el código. Intenta de nuevo.';
		} finally {
			generating = false;
		}
	});

	async function copyText() {
		await navigator.clipboard.writeText(qrText);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}
</script>

<svelte:head>
	<title>Mi código · Mi Álbum Mundial 2026</title>
</svelte:head>

<div class="mx-auto max-w-lg space-y-6 pb-16">
	<div class="flex items-center justify-between">
		<h1 class="text-lg font-semibold">Mi código</h1>
		<a href="/intercambio" class="text-sm text-emerald-400 hover:underline">← Volver</a>
	</div>

	<p class="text-sm text-slate-400">
		Muéstrale este código a la otra persona para que escanee tu colección: qué te falta y qué
		tienes repetido.
	</p>

	{#if generating}
		<p class="text-center text-sm text-slate-500">Generando…</p>
	{:else if errorMessage}
		<div class="rounded-lg border border-red-800 bg-red-950/50 px-4 py-2 text-sm text-red-300">
			{errorMessage}
		</div>
	{:else}
		<div class="flex justify-center rounded-xl border border-slate-800 bg-white p-4">
			<img src={qrDataUrl} alt="Código QR de mi colección" class="h-auto w-full max-w-xs" />
		</div>

		<button
			type="button"
			onclick={copyText}
			class="w-full rounded-md border border-slate-700 py-2 text-sm text-slate-300 hover:bg-slate-800"
		>
			{copied ? 'Copiado ✓' : 'Copiar código como texto'}
		</button>
	{/if}
</div>
