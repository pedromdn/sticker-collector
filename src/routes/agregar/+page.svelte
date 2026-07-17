<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { invalidate } from '$app/navigation';
	import type { PageData } from './$types';
	import type { CollaborativeStickerItem } from '$lib/types';
	import { getTeamFlag } from '$lib/flags';
	import { upsertUserStickers } from '$lib/collectionMutations';
	import { isAlbumComplete, isTeamComplete } from '$lib/completion';
	import OcrCodeScanner from '$lib/components/OcrCodeScanner.svelte';
	import NewStickerModal from '$lib/components/NewStickerModal.svelte';
	import CelebrationBanner from '$lib/components/CelebrationBanner.svelte';

	let { data }: { data: PageData } = $props();

	let items = $state<CollaborativeStickerItem[]>(data.items.map((item) => ({ ...item })));
	let byCode = $derived.by(() => new Map(items.map((item) => [item.code.toUpperCase(), item])));
	let knownCodes = $derived([...byCode.keys()]);

	// Signed "mid" URLs for every sticker with an image, fetched once in the
	// background so the new-sticker modal can show up instantly instead of
	// waiting on a sign-then-download round trip at reveal time.
	let midUrlCache = $state<Record<string, string>>({});

	let celebration = $state<{ kind: 'team' | 'album'; label: string } | null>(null);
	let celebrationTimer: ReturnType<typeof setTimeout> | undefined;

	function celebrate(kind: 'team' | 'album', label: string) {
		if (celebrationTimer) clearTimeout(celebrationTimer);
		celebration = { kind, label };
		celebrationTimer = setTimeout(() => (celebration = null), 3500);
	}

	function checkCompletion(team: string) {
		const hasIt = (item: CollaborativeStickerItem) => item.groupQuantity > 0;
		if (isAlbumComplete(items, hasIt)) {
			celebrate('album', '¡Álbum completo! 🏆');
		} else if (isTeamComplete(items, team, hasIt)) {
			celebrate('team', `¡Equipo completo: ${team}! 🎉`);
		}
	}

	type InputMode = 'text' | 'camera';
	let inputMode = $state<InputMode>('text');

	type Outcome =
		| { kind: 'duplicate'; item: CollaborativeStickerItem }
		| { kind: 'pending-new'; item: CollaborativeStickerItem }
		| { kind: 'added'; item: CollaborativeStickerItem }
		| { kind: 'not-found'; code: string };

	let code = $state('');
	let inputEl = $state<HTMLInputElement>();
	let outcome = $state<Outcome | null>(null);
	let history = $state<Outcome[]>([]);
	let session = $state({ processed: 0, added: 0, duplicates: 0, notFound: 0 });
	let errorMessage = $state('');

	async function persist(itemCode: string, quantity: number, previousQuantity: number) {
		const userId = data.user?.id;
		if (!userId) return;

		const { error } = await upsertUserStickers(
			data.supabase,
			userId,
			[{ sticker_code: itemCode, quantity, previous_quantity: previousQuantity }],
			{ groupId: data.group?.id }
		);

		if (error) {
			errorMessage = 'No se pudo guardar el cambio. Intenta de nuevo.';
			return;
		}

		invalidate('app:collection');
	}

	function pushHistory(entry: Outcome) {
		history = [entry, ...history].slice(0, 12);
	}

	async function focusInput() {
		await tick();
		inputEl?.focus();
	}

	// Codes aren't fixed-length (MEX1 is valid on its own but also a prefix of
	// MEX10-MEX19, GER10 is a prefix of GER10s, etc.), so "finished typing"
	// can't be detected from the string alone. Instead: as soon as the input
	// exactly matches a real code, wait for a short pause in typing before
	// confirming — if more characters arrive first, the longer code wins.
	const AUTO_SUBMIT_DELAY = 450;
	let autoSubmitTimer: ReturnType<typeof setTimeout> | undefined;
	let isRecognized = $state(false);

	$effect(() => {
		const raw = code.trim().toUpperCase();

		if (autoSubmitTimer) {
			clearTimeout(autoSubmitTimer);
			autoSubmitTimer = undefined;
		}

		if (raw !== '' && byCode.has(raw)) {
			isRecognized = true;
			autoSubmitTimer = setTimeout(() => {
				autoSubmitTimer = undefined;
				processCode(raw);
			}, AUTO_SUBMIT_DELAY);
		} else {
			isRecognized = false;
		}
	});

	async function processCode(raw: string) {
		const item = byCode.get(raw);
		code = '';
		await focusInput();

		if (!item) {
			errorMessage = '';
			outcome = { kind: 'not-found', code: raw };
			session.notFound += 1;
			pushHistory(outcome);
			return;
		}

		if (item.quantity > 0) {
			errorMessage = '';
			const previousQuantity = item.quantity;
			item.quantity += 1;
			item.groupQuantity += 1;
			outcome = { kind: 'duplicate', item };
			session.processed += 1;
			session.duplicates += 1;
			pushHistory(outcome);
			await persist(item.code, item.quantity, previousQuantity);
		} else {
			outcome = { kind: 'pending-new', item };
		}
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		const raw = code.trim().toUpperCase();

		// Empty Enter confirms a pending "new" card, keyboard-only.
		if (raw === '') {
			if (outcome?.kind === 'pending-new') {
				await confirmAdd(outcome.item);
			}
			return;
		}

		if (autoSubmitTimer) {
			clearTimeout(autoSubmitTimer);
			autoSubmitTimer = undefined;
		}
		await processCode(raw);
	}

	async function confirmAdd(item: CollaborativeStickerItem) {
		item.quantity = 1;
		item.groupQuantity += 1;
		outcome = { kind: 'added', item };
		session.processed += 1;
		session.added += 1;
		pushHistory(outcome);
		await persist(item.code, 1, 0);
		checkCompletion(item.team);
		await focusInput();
	}

	function cancelPending() {
		outcome = null;
		focusInput();
	}

	// Duplicates auto-confirm without asking, so give a quick undo in case a
	// typo or accidental repeat scan added a repeated sticker by mistake.
	async function cancelDuplicate(item: CollaborativeStickerItem) {
		const previousQuantity = item.quantity;
		item.quantity -= 1;
		item.groupQuantity -= 1;
		session.processed -= 1;
		session.duplicates -= 1;
		history = history.slice(1);
		outcome = null;
		await persist(item.code, item.quantity, previousQuantity);
		await focusInput();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			if (outcome?.kind === 'pending-new') {
				cancelPending();
			} else if (outcome?.kind === 'duplicate') {
				cancelDuplicate(outcome.item);
			}
		}
	}

	function resetSession() {
		session = { processed: 0, added: 0, duplicates: 0, notFound: 0 };
		history = [];
	}

	onMount(() => {
		inputEl?.focus();

		const imgs = [...new Set(items.map((item) => item.img).filter((img): img is string => !!img))];
		if (imgs.length > 0) {
			fetch('/api/sticker-images', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ imgs, size: 'mid' })
			})
				.then((res) => (res.ok ? res.json() : null))
				.then((data) => {
					if (data?.urls) midUrlCache = data.urls;
				})
				.catch(() => {
					// Silent — the modal falls back to fetching its own URL on demand.
				});
		}
	});
</script>

<svelte:head>
	<title>Agregar sticker · Mi Álbum Mundial 2026</title>
</svelte:head>

<CelebrationBanner {celebration} />

<div class="mx-auto max-w-lg space-y-6 pb-16">
	<div>
		<h1 class="text-lg font-semibold">Modo agregar</h1>
		<p class="text-sm text-slate-500">
			{inputMode === 'text'
				? 'Escribe el código de cada sticker — se confirma solo al dejar de teclear. Los repetidos se suman solos.'
				: 'Apunta al reverso de la estampita — se va agregando sola, sticker tras sticker, sin salir de la cámara.'}
		</p>
	</div>

	<div class="flex gap-2">
		<button
			type="button"
			onclick={() => (inputMode = 'text')}
			class="flex-1 rounded-md border px-3 py-1.5 text-sm {inputMode === 'text'
				? 'border-emerald-500 bg-emerald-600 text-white'
				: 'border-slate-700 text-slate-300 hover:bg-slate-800'}"
		>
			⌨️ Escribir
		</button>
		<button
			type="button"
			onclick={() => (inputMode = 'camera')}
			class="flex-1 rounded-md border px-3 py-1.5 text-sm {inputMode === 'camera'
				? 'border-emerald-500 bg-emerald-600 text-white'
				: 'border-slate-700 text-slate-300 hover:bg-slate-800'}"
		>
			📷 Cámara
		</button>
	</div>

	{#if inputMode === 'text'}
		<form onsubmit={handleSubmit}>
			<input
				bind:this={inputEl}
				bind:value={code}
				onkeydown={handleKeydown}
				autocomplete="off"
				autocapitalize="characters"
				spellcheck="false"
				placeholder="Código (ej. MEX10)"
				class="w-full rounded-lg bg-slate-900 px-4 py-3 text-center font-mono text-xl uppercase tracking-widest text-slate-100 placeholder-slate-600 transition-colors placeholder:text-sm placeholder:tracking-normal placeholder:normal-case focus:ring-emerald-500 {isRecognized
					? 'border-2 border-emerald-500'
					: 'border border-slate-700 focus:border-emerald-500'}"
			/>
			{#if isRecognized}
				<p class="mt-1.5 text-center text-xs text-emerald-400">Reconocido · confirmando…</p>
			{/if}
		</form>
	{:else}
		{#key inputMode}
			<OcrCodeScanner {knownCodes} onDetected={processCode} />
		{/key}
	{/if}

	{#if errorMessage}
		<div class="rounded-lg border border-red-800 bg-red-950/50 px-4 py-2 text-sm text-red-300">
			{errorMessage}
		</div>
	{/if}

	{#if outcome}
		{#if outcome.kind === 'not-found'}
			<div class="rounded-xl border border-red-800 bg-red-950/40 p-4 text-center">
				<p class="text-sm text-red-300">
					No encontramos el código <strong>{outcome.code}</strong>
				</p>
			</div>
		{:else if outcome.kind === 'duplicate'}
			{@const duplicateItem = outcome.item}
			<div class="rounded-xl border border-amber-700 bg-amber-950/30 p-4">
				<div class="flex items-center gap-3">
					<span class="text-3xl leading-none">{getTeamFlag(duplicateItem.team)}</span>
					<div class="min-w-0 flex-1">
						<p class="truncate font-semibold text-slate-100">{duplicateItem.name}</p>
						<p class="text-xs text-slate-400">#{duplicateItem.code} · {duplicateItem.team}</p>
					</div>
				</div>
				<p class="mt-3 text-center text-sm font-medium text-amber-300">
					Ya la tenías · +1 repetido (ahora {duplicateItem.quantity - 1})
				</p>
				<button
					type="button"
					onclick={() => cancelDuplicate(duplicateItem)}
					class="mt-3 w-full rounded-md border border-slate-700 py-2 text-sm text-slate-300 hover:bg-slate-800"
				>
					Cancelar
				</button>
			</div>
		{:else if outcome.kind === 'added'}
			<div class="rounded-xl border border-emerald-700 bg-emerald-950/30 p-4">
				<div class="flex items-center gap-3">
					<span class="text-3xl leading-none">{getTeamFlag(outcome.item.team)}</span>
					<div class="min-w-0 flex-1">
						<p class="truncate font-semibold text-slate-100">{outcome.item.name}</p>
						<p class="text-xs text-slate-400">#{outcome.item.code} · {outcome.item.team}</p>
					</div>
				</div>
				<p class="mt-3 text-center text-sm font-medium text-emerald-300">✓ Agregada a tu colección</p>
			</div>
		{/if}
	{:else}
		<p class="py-8 text-center text-sm text-slate-600">Escribe un código para empezar</p>
	{/if}

	{#if outcome?.kind === 'pending-new'}
		{@const pendingItem = outcome.item}
		{#key pendingItem.code}
			<NewStickerModal
				item={pendingItem}
				prefetchedUrl={pendingItem.img ? midUrlCache[pendingItem.img] : undefined}
				onConfirm={() => confirmAdd(pendingItem)}
				onCancel={cancelPending}
			/>
		{/key}
	{/if}

	<div
		class="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-2 text-xs text-slate-400"
	>
		<span>
			{session.processed} procesados · {session.added} nuevas · {session.duplicates} repetidas{session.notFound
				? ` · ${session.notFound} no encontradas`
				: ''}
		</span>
		<button type="button" onclick={resetSession} class="text-slate-500 hover:text-slate-300">
			Reiniciar
		</button>
	</div>

	{#if history.length > 0}
		<div>
			<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Últimas</h2>
			<ul class="space-y-1">
				{#each history as entry (entry)}
					<li
						class="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/30 px-3 py-1.5 text-sm"
					>
						{#if entry.kind === 'not-found'}
							<span class="text-slate-500">#{entry.code}</span>
							<span class="text-xs text-red-400">no encontrado</span>
						{:else}
							<span class="flex min-w-0 items-center gap-2">
								<span class="leading-none">{getTeamFlag(entry.item.team)}</span>
								<span class="truncate text-slate-300">{entry.item.name}</span>
							</span>
							<span
								class="shrink-0 text-xs {entry.kind === 'added' ? 'text-emerald-400' : 'text-amber-400'}"
							>
								{entry.kind === 'added' ? 'nueva' : 'repetida'}
							</span>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
