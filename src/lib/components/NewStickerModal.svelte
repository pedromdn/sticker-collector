<script lang="ts">
	import { onMount } from 'svelte';
	import type { StickerItem } from '$lib/types';
	import { getTeamFlag } from '$lib/flags';

	let {
		item,
		onConfirm,
		onCancel
	}: {
		item: StickerItem;
		onConfirm: () => void;
		onCancel: () => void;
	} = $props();

	let imgUrl = $state('');
	let imgFailed = $state(false);
	let loadingImg = $state(false);

	onMount(async () => {
		if (!item.img) return;
		loadingImg = true;
		try {
			const res = await fetch(`/api/sticker-image?img=${encodeURIComponent(item.img)}`);
			if (!res.ok) throw new Error('not ok');
			const data = await res.json();
			imgUrl = data.url;
		} catch {
			imgFailed = true;
		} finally {
			loadingImg = false;
		}
	});

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') onCancel();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
	<div
		class="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-slate-800 bg-slate-900 p-5 sm:rounded-2xl"
	>
		<p class="text-center text-xs font-semibold uppercase tracking-wide text-emerald-400">
			¡Sticker nuevo!
		</p>

		<div
			class="mt-3 flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-slate-950"
		>
			{#if item.img && !imgFailed}
				{#if imgUrl}
					<img
						src={imgUrl}
						alt={item.name}
						class="h-full w-full object-contain"
						onerror={() => (imgFailed = true)}
					/>
				{:else if loadingImg}
					<span class="text-sm text-slate-600">Cargando imagen…</span>
				{/if}
			{:else}
				<span class="text-7xl leading-none">{getTeamFlag(item.team)}</span>
			{/if}
		</div>

		<div class="mt-4 flex items-center gap-3">
			<span class="text-2xl leading-none">{getTeamFlag(item.team)}</span>
			<div class="min-w-0 flex-1">
				<p class="truncate text-lg font-semibold text-slate-100">{item.name}</p>
				<p class="text-sm text-slate-400">#{item.code} · {item.team}</p>
			</div>
		</div>

		<p class="mt-2 text-center text-sm text-slate-400">No la tenías todavía</p>

		<div class="mt-4 flex gap-2">
			<button
				type="button"
				onclick={onCancel}
				class="flex-1 rounded-md border border-slate-700 py-3 text-sm text-slate-300 hover:bg-slate-800"
			>
				Cancelar
			</button>
			<button
				type="button"
				onclick={onConfirm}
				class="flex-1 rounded-md bg-emerald-600 py-3 text-sm font-medium text-white hover:bg-emerald-500"
			>
				✓ Agregar
			</button>
		</div>
		<p class="mt-2 text-center text-xs text-slate-600">O deja el campo vacío y presiona Enter</p>
	</div>
</div>
