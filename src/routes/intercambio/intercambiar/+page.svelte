<script lang="ts">
	import type { PageData } from './$types';
	import type { CollaborativeStickerItem } from '$lib/types';
	import QRCode from 'qrcode';
	import QrInput from '$lib/components/QrInput.svelte';
	import StickerThumb from '$lib/components/StickerThumb.svelte';
	import { catalogOrderedCodes } from '$lib/groups';
	import { upsertUserStickers } from '$lib/collectionMutations';
	import {
		decodeFiguritasQr,
		decodeFiguritasTradeQr,
		encodeFiguritasTradeQr,
		isFiguritasTradeQr,
		FiguritasFormatError,
		FiguritasUnsupportedError,
		FiguritasDecodeError,
		FiguritasLengthMismatchError,
		type FiguritasCollection,
		type FiguritasTradeDelta
	} from '$lib/figuritas';

	let { data }: { data: PageData } = $props();

	type Step = 'scan' | 'review' | 'trade-review' | 'done';
	type Candidate = { item: CollaborativeStickerItem; checked: boolean };

	let step = $state<Step>('scan');
	let rawDecoded = $state<FiguritasCollection | null>(null);
	let tradeDelta = $state<FiguritasTradeDelta | null>(null);
	let decodeError = $state('');
	let applying = $state(false);
	let applyError = $state('');
	let puedesDar = $state<Candidate[]>([]);
	let puedesRecibir = $state<Candidate[]>([]);
	let doneSummary = $state({ given: 0, received: 0 });
	let replyQrDataUrl = $state('');
	let generatingReplyQr = $state(false);
	let replyQrText = $state('');
	let replyQrCopied = $state(false);

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
			if (isFiguritasTradeQr(text)) {
				tradeDelta = await decodeFiguritasTradeQr(text, orderedCodes);
				step = 'trade-review';
			} else {
				rawDecoded = await decodeFiguritasQr(text, orderedCodes);
				step = 'review';
			}
		} catch (err) {
			decodeError = mapError(err);
		}
	}

	function resetToScan() {
		step = 'scan';
		rawDecoded = null;
		tradeDelta = null;
		decodeError = '';
		applyError = '';
		replyQrDataUrl = '';
		replyQrText = '';
	}

	async function copyReplyQrText() {
		await navigator.clipboard.writeText(replyQrText);
		replyQrCopied = true;
		setTimeout(() => (replyQrCopied = false), 1500);
	}

	let byCode = $derived(new Map(data.items.map((item) => [item.code, item])));

	let tradeGaveItems = $derived.by(() => {
		if (!tradeDelta) return [];
		return tradeDelta.entries
			.filter((e) => e.iGave)
			.map((e) => byCode.get(e.code))
			.filter((item): item is CollaborativeStickerItem => item !== undefined);
	});

	let tradeReceivedItems = $derived.by(() => {
		if (!tradeDelta) return [];
		return tradeDelta.entries
			.filter((e) => e.iReceived)
			.map((e) => byCode.get(e.code))
			.filter((item): item is CollaborativeStickerItem => item !== undefined);
	});

	// Rebuilds the suggested trade lists whenever a new code is decoded. Kept
	// as $state (not $derived) so per-row checkbox toggles below can mutate
	// `.checked` directly and stay reactive.
	$effect(() => {
		if (!rawDecoded) {
			puedesDar = [];
			puedesRecibir = [];
			return;
		}
		const friendByCode = new Map(rawDecoded.entries.map((e) => [e.code, e]));
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
			.map((c) => ({
				sticker_code: c.item.code,
				quantity: c.item.quantity - 1,
				previous_quantity: c.item.quantity,
				action: 'traded' as const
			}));
		const recibirRows = puedesRecibir
			.filter((c) => c.checked)
			.map((c) => ({
				sticker_code: c.item.code,
				quantity: 1,
				previous_quantity: c.item.quantity,
				action: 'traded' as const
			}));

		const { error } = await upsertUserStickers(
			data.supabase,
			userId,
			[...darRows, ...recibirRows],
			{ groupId: data.group?.id }
		);
		applying = false;
		if (error) {
			applyError = 'No se pudo guardar el intercambio. Intenta de nuevo.';
			return;
		}
		doneSummary = { given: darRows.length, received: recibirRows.length };

		const gaveCodes = new Set(darRows.map((r) => r.sticker_code));
		const receivedCodes = new Set(recibirRows.map((r) => r.sticker_code));
		if (gaveCodes.size > 0 || receivedCodes.size > 0) {
			generatingReplyQr = true;
			try {
				replyQrText = await encodeFiguritasTradeQr(
					orderedCodes.map((code) => ({
						iGave: gaveCodes.has(code),
						iReceived: receivedCodes.has(code)
					}))
				);
				replyQrDataUrl = await QRCode.toDataURL(replyQrText, { margin: 1, width: 320 });
			} catch {
				replyQrDataUrl = '';
				replyQrText = '';
			}
			generatingReplyQr = false;
		}

		step = 'done';
	}

	async function confirmTradeDelta() {
		const userId = data.user?.id;
		if (!userId || !tradeDelta) return;
		applying = true;
		applyError = '';

		const gaveRows = tradeGaveItems.map((item) => ({
			sticker_code: item.code,
			quantity: Math.max(0, item.quantity - 1),
			previous_quantity: item.quantity,
			action: 'traded' as const
		}));
		const receivedRows = tradeReceivedItems.map((item) => ({
			sticker_code: item.code,
			quantity: item.quantity + 1,
			previous_quantity: item.quantity,
			action: 'traded' as const
		}));

		const { error } = await upsertUserStickers(
			data.supabase,
			userId,
			[...gaveRows, ...receivedRows],
			{ groupId: data.group?.id }
		);
		applying = false;
		if (error) {
			applyError = 'No se pudo aplicar el intercambio. Intenta de nuevo.';
			return;
		}
		doneSummary = { given: gaveRows.length, received: receivedRows.length };
		step = 'done';
	}
</script>

<svelte:head>
	<title>Intercambiar · Mi Álbum Mundial 2026</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6 pb-16">
	<div class="flex items-center justify-between">
		<h1 class="text-lg font-semibold">Intercambiar</h1>
		<a href="/intercambio" class="text-sm text-emerald-400 hover:underline">← Volver</a>
	</div>

	{#if step === 'scan'}
		<div class="mx-auto max-w-lg space-y-4">
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
		</div>
	{:else if step === 'review' && rawDecoded}
		{#if applyError}
			<div class="rounded-lg border border-red-800 bg-red-950/50 px-4 py-2 text-sm text-red-300">
				{applyError}
			</div>
		{/if}

		<div class="grid gap-4 sm:grid-cols-2">
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
								<StickerThumb
									img={candidate.item.img}
									team={candidate.item.team}
									alt={candidate.item.name}
									class="h-8 w-8"
								/>
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
								<StickerThumb
									img={candidate.item.img}
									team={candidate.item.team}
									alt={candidate.item.name}
									class="h-8 w-8"
								/>
								<span class="min-w-0 flex-1">
									<span class="block truncate text-sm font-medium">{candidate.item.name}</span>
									<span class="block text-xs text-slate-500">#{candidate.item.code}</span>
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>

		<div class="mx-auto flex max-w-lg gap-2">
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
	{:else if step === 'trade-review' && tradeDelta}
		<p class="text-sm text-slate-400">
			Este código ya trae un intercambio confirmado por la otra persona. Revisa y aplica los
			cambios a tu colección.
		</p>

		{#if applyError}
			<div class="rounded-lg border border-red-800 bg-red-950/50 px-4 py-2 text-sm text-red-300">
				{applyError}
			</div>
		{/if}

		<div class="grid gap-4 sm:grid-cols-2">
			<div>
				<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
					Vas a dar ({tradeGaveItems.length})
				</h2>
				{#if tradeGaveItems.length === 0}
					<p class="text-sm text-slate-600">Nada.</p>
				{:else}
					<ul class="space-y-1.5">
						{#each tradeGaveItems as item (item.code)}
							<li
								class="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2"
							>
								<StickerThumb img={item.img} team={item.team} alt={item.name} class="h-8 w-8" />
								<span class="min-w-0 flex-1">
									<span class="block truncate text-sm font-medium">{item.name}</span>
									<span class="block text-xs text-slate-500">#{item.code}</span>
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<div>
				<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
					Vas a recibir ({tradeReceivedItems.length})
				</h2>
				{#if tradeReceivedItems.length === 0}
					<p class="text-sm text-slate-600">Nada.</p>
				{:else}
					<ul class="space-y-1.5">
						{#each tradeReceivedItems as item (item.code)}
							<li
								class="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2"
							>
								<StickerThumb img={item.img} team={item.team} alt={item.name} class="h-8 w-8" />
								<span class="min-w-0 flex-1">
									<span class="block truncate text-sm font-medium">{item.name}</span>
									<span class="block text-xs text-slate-500">#{item.code}</span>
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>

		<div class="mx-auto flex max-w-lg gap-2">
			<button
				type="button"
				onclick={resetToScan}
				class="flex-1 rounded-md border border-slate-700 py-2 text-sm text-slate-300 hover:bg-slate-800"
			>
				Cancelar
			</button>
			<button
				type="button"
				onclick={confirmTradeDelta}
				disabled={applying}
				class="flex-1 rounded-md bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
			>
				{applying ? 'Guardando…' : 'Aplicar cambios'}
			</button>
		</div>
	{:else if step === 'done'}
		<div class="mx-auto max-w-lg space-y-4">
			<div class="rounded-xl border border-emerald-700 bg-emerald-950/30 p-4 text-center">
				<p class="text-emerald-300">✓ Intercambio registrado</p>
				<p class="mt-1 text-sm text-slate-400">
					Diste {doneSummary.given} · Recibiste {doneSummary.received}
				</p>
			</div>

			{#if generatingReplyQr}
				<p class="text-center text-sm text-slate-500">Generando código para la otra persona…</p>
			{:else if replyQrDataUrl}
				<div class="space-y-2">
					<p class="text-sm text-slate-400">
						Muéstrale este código a la otra persona (funciona también si usa Figuritas) para que
						su colección se actualice sola, sin tener que rehacer el intercambio al revés.
					</p>
					<div class="flex justify-center rounded-xl border border-slate-800 bg-white p-4">
						<img
							src={replyQrDataUrl}
							alt="Código QR con el intercambio confirmado"
							class="h-auto w-full max-w-xs"
						/>
					</div>
					<button
						type="button"
						onclick={copyReplyQrText}
						class="w-full rounded-md border border-slate-700 py-2 text-sm text-slate-300 hover:bg-slate-800"
					>
						{replyQrCopied ? 'Copiado ✓' : 'Copiar código como texto'}
					</button>
				</div>
			{/if}

			<a
				href="/"
				class="block w-full rounded-md bg-emerald-600 py-2 text-center text-sm font-medium text-white hover:bg-emerald-500"
			>
				Ver mi colección
			</a>
		</div>
	{/if}
</div>
