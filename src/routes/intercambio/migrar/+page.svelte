<script lang="ts">
	import { invalidate } from '$app/navigation';
	import type { PageData } from './$types';
	import QrInput from '$lib/components/QrInput.svelte';
	import { catalogOrderedCodes, getSectionKey, getSectionLabel, SECTION_ORDER } from '$lib/groups';
	import { upsertUserStickers } from '$lib/collectionMutations';
	import {
		decodeFiguritasQr,
		FiguritasFormatError,
		FiguritasUnsupportedError,
		FiguritasDecodeError,
		FiguritasLengthMismatchError,
		type FiguritasCollection
	} from '$lib/figuritas';

	let { data }: { data: PageData } = $props();

	type Step = 'scan' | 'preview' | 'done';
	type DiffRow = {
		code: string;
		name: string;
		team: string;
		currentQty: number;
		impliedQty: number;
		newQty: number;
	};

	let step = $state<Step>('scan');
	let rawDecoded = $state<FiguritasCollection | null>(null);
	let decodeError = $state('');
	let applying = $state(false);
	let applyError = $state('');
	let appliedCount = $state(0);

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
			step = 'preview';
		} catch (err) {
			decodeError = mapError(err);
		}
	}

	function resetToScan() {
		step = 'scan';
		rawDecoded = null;
		decodeError = '';
		applyError = '';
	}

	let byCode = $derived(new Map(data.items.map((item) => [item.code, item])));

	let diff = $derived.by<DiffRow[]>(() => {
		if (!rawDecoded) return [];
		return rawDecoded.entries.map((entry) => {
			const item = byCode.get(entry.code)!;
			const implied = entry.missing ? 0 : entry.hasDuplicate ? 2 : 1;
			return {
				code: entry.code,
				name: item.name,
				team: item.team,
				currentQty: item.quantity,
				impliedQty: implied,
				newQty: Math.max(item.quantity, implied)
			};
		});
	});

	let changed = $derived(diff.filter((row) => row.newQty !== row.currentQty));
	let newHaveCount = $derived(changed.filter((r) => r.currentQty === 0 && r.newQty > 0).length);
	let newDupCount = $derived(changed.filter((r) => r.newQty >= 2 && r.currentQty < 2).length);

	let sectionBreakdown = $derived.by(() => {
		const map = new Map<string, number>();
		for (const row of changed) {
			const key = getSectionKey(row.team, row.code);
			map.set(key, (map.get(key) ?? 0) + 1);
		}
		return SECTION_ORDER.filter((key) => map.has(key)).map((key) => ({
			key,
			label: getSectionLabel(key),
			count: map.get(key)!
		}));
	});

	async function confirmMigration() {
		const userId = data.user?.id;
		if (!userId) return;
		applying = true;
		applyError = '';
		const rows = changed.map((row) => ({
			sticker_code: row.code,
			quantity: row.newQty,
			previous_quantity: row.currentQty
		}));
		const { error } = await upsertUserStickers(data.supabase, userId, rows, {
			groupId: data.group?.id
		});
		applying = false;
		if (error) {
			applyError = 'No se pudo guardar la migración. Intenta de nuevo.';
			return;
		}
		invalidate('app:collection');
		appliedCount = changed.length;
		step = 'done';
	}
</script>

<svelte:head>
	<title>Migrar desde Figuritas · Mi Álbum Mundial 2026</title>
</svelte:head>

<div class="mx-auto max-w-lg space-y-6 pb-16">
	<div class="flex items-center justify-between">
		<h1 class="text-lg font-semibold">Migrar desde Figuritas</h1>
		<a href="/intercambio" class="text-sm text-emerald-400 hover:underline">← Volver</a>
	</div>

	{#if step === 'scan'}
		<p class="text-sm text-slate-400">
			Escanea o pega el código de tu colección en Figuritas. Nada se guarda todavía — primero
			verás una vista previa de los cambios.
		</p>
		<QrInput onSubmit={handleScan} />
		{#if decodeError}
			<div class="rounded-lg border border-red-800 bg-red-950/50 px-4 py-2 text-sm text-red-300">
				{decodeError}
			</div>
		{/if}
	{:else if step === 'preview' && rawDecoded}
		<p class="text-sm text-slate-400">
			Revisa los cambios antes de confirmar. Nada se guarda todavía.
		</p>

		<div class="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
			<p class="text-sm text-slate-300">
				<strong class="text-emerald-400">{changed.length}</strong> cambios de {diff.length} stickers
				mapeados
			</p>
			<p class="mt-1 text-xs text-slate-500">
				{newHaveCount} nuevos como "tengo" · {newDupCount} con repetido
			</p>
		</div>

		{#if sectionBreakdown.length > 0}
			<div>
				<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
					Por sección
				</h2>
				<ul class="space-y-1 text-sm">
					{#each sectionBreakdown as section (section.key)}
						<li
							class="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/30 px-3 py-1.5"
						>
							<span class="text-slate-300">{section.label}</span>
							<span class="text-slate-500">{section.count}</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if applyError}
			<div class="rounded-lg border border-red-800 bg-red-950/50 px-4 py-2 text-sm text-red-300">
				{applyError}
			</div>
		{/if}

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
				onclick={confirmMigration}
				disabled={applying || changed.length === 0}
				class="flex-1 rounded-md bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
			>
				{applying ? 'Guardando…' : `Confirmar migración (${changed.length})`}
			</button>
		</div>

		{#if changed.length === 0}
			<p class="text-center text-xs text-slate-600">No hay cambios que aplicar.</p>
		{/if}
	{:else if step === 'done'}
		<div class="rounded-xl border border-emerald-700 bg-emerald-950/30 p-4 text-center">
			<p class="text-emerald-300">✓ Migración completada</p>
			<p class="mt-1 text-sm text-slate-400">{appliedCount} stickers actualizados.</p>
		</div>
		<a
			href="/"
			class="block w-full rounded-md bg-emerald-600 py-2 text-center text-sm font-medium text-white hover:bg-emerald-500"
		>
			Ver mi colección
		</a>
	{/if}
</div>
