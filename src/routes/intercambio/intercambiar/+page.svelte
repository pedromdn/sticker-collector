<script lang="ts">
	import type { PageData } from './$types';
	import type { StickerItem } from '$lib/types';
	import QrInput from '$lib/components/QrInput.svelte';
	import { getTeamFlag } from '$lib/flags';
	import { catalogOrderedCodes } from '$lib/groups';
	import { upsertUserStickers } from '$lib/collectionMutations';
	import {
		decodeFiguritasQr,
		invertFiguritasCollection,
		FiguritasFormatError,
		FiguritasUnsupportedError,
		FiguritasDecodeError,
		FiguritasLengthMismatchError,
		type FiguritasCollection
	} from '$lib/figuritas';

	let { data }: { data: PageData } = $props();

	type Step = 'scan' | 'review' | 'done';
	type Candidate = { item: StickerItem; checked: boolean };

	let step = $state<Step>('scan');
	let rawDecoded = $state<FiguritasCollection | null>(null);
	let invert = $state(false);
	let decodeError = $state('');
	let applying = $state(false);
	let applyError = $state('');
	let puedesDar = $state<Candidate[]>([]);
	let puedesRecibir = $state<Candidate[]>([]);
	let doneSummary = $state({ given: 0, received: 0 });

	const orderedCodes = catalogOrderedCodes(data.items);

	function mapError(err: unknown): string {
		if (err instanceof FiguritasLengthMismatchError) {
			return `El código no coincide con el catálogo esperado (se esperaban ${err.expected} stickers, llegaron ${err.actualBitsA}/${err.actualBitsB} bits).`;
		}
		if (err instanceof FiguritasFormatError) {
			return 'El texto no tiene el formato esperado de un código de Figuritas.';
		}
		if (err instanceof FiguritasUnsupportedError) {
			return 'Tu navegador no soporta la descompresión necesaria para leer este código.';
		}
		if (err instanceof FiguritasDecodeError) {
			return 'No se pudo leer el contenido del código. ¿Lo copiaste completo?';
		}
		return 'No se pudo procesar el código. Intenta de nuevo.';
	}

	async function handleScan(text: string) {
		decodeError = '';
		try {
			rawDecoded = await decodeFiguritasQr(text, orderedCodes);
			step = 'review';
		} catch (err) {
			decodeError = mapError(err);
		}
	}

	function resetToScan() {
		step = 'scan';
		rawDecoded = null;
		invert = false;
		decodeError = '';
		applyError = '';
	}

	let effectiveDecoded = $derived(
		rawDecoded ? (invert ? invertFiguritasCollection(rawDecoded) : rawDecoded) : null
	);

	// Rebuilds the suggested trade lists whenever a new code is decoded or the
	// invert toggle flips. Kept as $state (not $derived) so per-row checkbox
	// toggles below can mutate `.checked` directly and stay reactive.
	$effect(() => {
		if (!effectiveDecoded) {
			puedesDar = [];
			puedesRecibir = [];
			return;
		}
		const friendByCode = new Map(effectiveDecoded.entries.map((e) => [e.code, e]));
		puedesDar = data.items
			.filter((i) => i.quantity >= 2 && friendByCode.get(i.code)?.missing === true)
			.map((item) => ({ item, checked: true }));
		puedesRecibir = data.items
			.filter((i) => i.quantity === 0 && friendByCode.get(i.code)?.hasDuplicate === true)
			.map((item) => ({ item, checked: true }));
	});

	async function confirmTrade() {
		const userId = data.user?.id;
		if (!userId) return;
		applying = true;
		applyError = '';

		const darRows = puedesDar
			.filter((c) => c.checked)
			.map((c) => ({ sticker_code: c.item.code, quantity: c.item.quantity - 1 }));
		const recibirRows = puedesRecibir
			.filter((c) => c.checked)
			.map((c) => ({ sticker_code: c.item.code, quantity: 1 }));

		const { error } = await upsertUserStickers(data.supabase, userId, [
			...darRows,
			...recibirRows
		]);
		applying = false;
		if (error) {
			applyError = 'No se pudo guardar el intercambio. Intenta de nuevo.';
			return;
		}
		doneSummary = { given: darRows.length, received: recibirRows.length };
		step = 'done';
	}
</script>

<svelte:head>
	<title>Intercambiar · Mi Álbum Mundial 2026</title>
</svelte:head>

<div class="mx-auto max-w-lg space-y-6 pb-16">
	<div class="flex items-center justify-between">
		<h1 class="text-lg font-semibold">Intercambiar</h1>
		<a href="/intercambio" class="text-sm text-emerald-400 hover:underline">← Volver</a>
	</div>

	{#if step === 'scan'}
		<p class="text-sm text-slate-400">
			Escanea o pega el código de Figuritas de la otra persona para ver qué le puedes dar y qué
			puedes recibir.
		</p>
		<QrInput onSubmit={handleScan} />
		{#if decodeError}
			<div class="rounded-lg border border-red-800 bg-red-950/50 px-4 py-2 text-sm text-red-300">
				{decodeError}
			</div>
		{/if}
	{:else if step === 'review' && effectiveDecoded}
		<div class="rounded-lg border border-amber-800 bg-amber-950/30 p-3 text-xs text-amber-300">
			Función experimental — revisa que esto tenga sentido antes de confirmar. Nada se guarda
			todavía.
		</div>

		<label
			class="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm"
		>
			<input
				type="checkbox"
				bind:checked={invert}
				class="rounded border-slate-600 text-emerald-600"
			/>
			<span>
				Invertir interpretación
				<span class="block text-xs text-slate-500">
					Actívalo si las listas de abajo no tienen sentido con la colección real de la otra
					persona.
				</span>
			</span>
		</label>

		{#if applyError}
			<div class="rounded-lg border border-red-800 bg-red-950/50 px-4 py-2 text-sm text-red-300">
				{applyError}
			</div>
		{/if}

		<div>
			<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
				Puedes dar ({puedesDar.length})
			</h2>
			{#if puedesDar.length === 0}
				<p class="text-sm text-slate-600">Nada por ahora.</p>
			{:else}
				<ul class="space-y-1.5">
					{#each puedesDar as candidate (candidate.item.code)}
						<li
							class="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2"
						>
							<input
								type="checkbox"
								bind:checked={candidate.checked}
								class="rounded border-slate-600 text-emerald-600"
							/>
							<span class="text-lg leading-none">{getTeamFlag(candidate.item.team)}</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-sm font-medium">{candidate.item.name}</span>
								<span class="block text-xs text-slate-500">#{candidate.item.code}</span>
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<div>
			<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
				Puedes recibir ({puedesRecibir.length})
			</h2>
			{#if puedesRecibir.length === 0}
				<p class="text-sm text-slate-600">Nada por ahora.</p>
			{:else}
				<ul class="space-y-1.5">
					{#each puedesRecibir as candidate (candidate.item.code)}
						<li
							class="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2"
						>
							<input
								type="checkbox"
								bind:checked={candidate.checked}
								class="rounded border-slate-600 text-emerald-600"
							/>
							<span class="text-lg leading-none">{getTeamFlag(candidate.item.team)}</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-sm font-medium">{candidate.item.name}</span>
								<span class="block text-xs text-slate-500">#{candidate.item.code}</span>
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<div class="flex gap-2">
			<button
				type="button"
				onclick={resetToScan}
				class="flex-1 rounded-md border border-slate-700 py-2 text-sm text-slate-300 hover:bg-slate-800"
			>
				Cancelar
			</button>
			<button
				type="button"
				onclick={confirmTrade}
				disabled={applying}
				class="flex-1 rounded-md bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
			>
				{applying ? 'Guardando…' : 'Confirmar intercambio'}
			</button>
		</div>
	{:else if step === 'done'}
		<div class="rounded-xl border border-emerald-700 bg-emerald-950/30 p-4 text-center">
			<p class="text-emerald-300">✓ Intercambio registrado</p>
			<p class="mt-1 text-sm text-slate-400">
				Diste {doneSummary.given} · Recibiste {doneSummary.received}
			</p>
		</div>
		<a
			href="/"
			class="block w-full rounded-md bg-emerald-600 py-2 text-center text-sm font-medium text-white hover:bg-emerald-500"
		>
			Ver mi colección
		</a>
	{/if}
</div>
