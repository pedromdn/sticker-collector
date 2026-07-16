<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import type { PageData } from './$types';
	import type { CollaborativeStickerItem, StatusFilter } from '$lib/types';
	import { getTeamFlag } from '$lib/flags';
	import { getSectionKey, getSectionLabel, SECTION_ORDER, type SectionKey } from '$lib/groups';
	import { upsertUserStickers } from '$lib/collectionMutations';

	let { data }: { data: PageData } = $props();

	let items = $state<CollaborativeStickerItem[]>(data.items.map((item) => ({ ...item })));
	let group = $derived(data.group);
	let query = $state('');
	let statusFilter = $state<StatusFilter>('all');
	let errorMessage = $state('');
	let openCards = new SvelteSet<string>();

	function cardKey(sectionKey: SectionKey, team: string) {
		return `${sectionKey}::${team}`;
	}

	const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
	const pendingPrevious = new Map<string, number>();

	function eventLabel(action: string, delta: number) {
		if (action === 'traded') return delta > 0 ? 'Recibida en intercambio' : 'Entregada en intercambio';
		return delta > 0 ? 'Agregada' : 'Restada';
	}

	function formatEventDate(value: string) {
		return new Intl.DateTimeFormat('es-MX', {
			dateStyle: 'short',
			timeStyle: 'short'
		}).format(new Date(value));
	}

	async function persist(code: string, quantity: number, previousQuantity: number) {
		const userId = data.user?.id;
		if (!userId) return;

		const { error } = await upsertUserStickers(
			data.supabase,
			userId,
			[{ sticker_code: code, quantity, previous_quantity: previousQuantity }],
			{ groupId: group?.id }
		);

		if (error) {
			errorMessage = 'No se pudo guardar el cambio. Revisa tu conexión e intenta de nuevo.';
		}
	}

	function scheduleSave(code: string, quantity: number, previousQuantity: number) {
		errorMessage = '';
		if (!pendingPrevious.has(code)) pendingPrevious.set(code, previousQuantity);
		const existing = pendingTimers.get(code);
		if (existing) clearTimeout(existing);
		pendingTimers.set(
			code,
			setTimeout(() => {
				pendingTimers.delete(code);
				const previous = pendingPrevious.get(code) ?? quantity;
				pendingPrevious.delete(code);
				persist(code, quantity, previous);
			}, 300)
		);
	}

	function applyLocalQuantity(item: CollaborativeStickerItem, quantity: number) {
		const previous = item.quantity;
		const delta = quantity - previous;
		item.quantity = quantity;
		item.groupQuantity += delta;
		item.memberQuantities[data.user!.id] = quantity;
		if (group?.currentMember?.is_swap_local) {
			item.localDuplicateQuantity += Math.max(0, quantity - 1) - Math.max(0, previous - 1);
		}
		scheduleSave(item.code, quantity, previous);
	}

	function toggleHave(item: CollaborativeStickerItem) {
		applyLocalQuantity(item, item.quantity > 0 ? 0 : 1);
	}

	function incDup(item: CollaborativeStickerItem) {
		applyLocalQuantity(item, item.quantity + 1);
	}

	function decDup(item: CollaborativeStickerItem) {
		if (item.quantity <= 1) return;
		applyLocalQuantity(item, item.quantity - 1);
	}

	function toggleCard(key: string) {
		if (openCards.has(key)) {
			openCards.delete(key);
		} else {
			openCards.add(key);
		}
	}

	function expandAll() {
		for (const key of cardStats.keys()) openCards.add(key);
	}

	function collapseAll() {
		openCards.clear();
	}

	let totalCount = $derived(items.length);
	let haveCount = $derived(items.filter((i) => i.groupQuantity > 0).length);
	let dupCount = $derived(
		items.reduce((sum, i) => sum + (group ? i.localDuplicateQuantity : Math.max(0, i.quantity - 1)), 0)
	);
	let globalPct = $derived(totalCount === 0 ? 0 : Math.round((haveCount / totalCount) * 100));

	// Keyed by section and team for stable collapsible-card identity.
	let cardStats = $derived.by(() => {
		const map = new Map<string, { have: number; total: number }>();
		for (const item of items) {
			const key = cardKey(getSectionKey(item.team, item.code), item.team);
			const stats = map.get(key) ?? { have: 0, total: 0 };
			stats.total += 1;
			if (item.groupQuantity > 0) stats.have += 1;
			map.set(key, stats);
		}
		return map;
	});

	let sectionStats = $derived.by(() => {
		const map = new Map<SectionKey, { have: number; total: number }>();
		for (const item of items) {
			const key = getSectionKey(item.team, item.code);
			const agg = map.get(key) ?? { have: 0, total: 0 };
			agg.total += 1;
			if (item.groupQuantity > 0) agg.have += 1;
			map.set(key, agg);
		}
		return map;
	});

	let filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return items.filter((item) => {
			const matchesQuery =
				q === '' || item.name.toLowerCase().includes(q) || item.code.toLowerCase().includes(q);
			const matchesStatus =
				statusFilter === 'all' ||
				(statusFilter === 'have' && item.groupQuantity > 0) ||
				(statusFilter === 'missing' && item.groupQuantity === 0) ||
				(statusFilter === 'duplicate' && (group ? item.localDuplicateQuantity > 0 : item.quantity > 1));
			return matchesQuery && matchesStatus;
		});
	});

	// Cards with a search match auto-expand, independent of "tengo/falta" so
	// toggling a sticker never collapses the card you're looking at.
	let cardsMatchingQuery = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const set = new Set<string>();
		if (q === '') return set;
		for (const item of items) {
			if (item.name.toLowerCase().includes(q) || item.code.toLowerCase().includes(q)) {
				set.add(cardKey(getSectionKey(item.team, item.code), item.team));
			}
		}
		return set;
	});

	// Two-level layout: World Cup section as a plain heading, teams underneath
	// as the actual collapsible cards.
	let sections = $derived.by(() => {
		const bySection = new Map<SectionKey, Map<string, CollaborativeStickerItem[]>>();
		for (const item of filtered) {
			const sectionKey = getSectionKey(item.team, item.code);
			if (!bySection.has(sectionKey)) bySection.set(sectionKey, new Map());
			const teamsInSection = bySection.get(sectionKey)!;
			if (!teamsInSection.has(item.team)) teamsInSection.set(item.team, []);
			teamsInSection.get(item.team)!.push(item);
		}
		return SECTION_ORDER.filter((key) => bySection.has(key)).map((key) => ({
			key,
			label: getSectionLabel(key),
			teams: [...bySection.get(key)!.entries()].map(([team, teamItems]) => ({
				team,
				items: teamItems
			}))
		}));
	});
</script>

<svelte:head>
	<title>Mi Álbum Mundial 2026</title>
</svelte:head>

<div class="space-y-8 pb-16">
	<section class="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
		<div class="mb-2 flex items-baseline justify-between">
			<h1 class="text-lg font-semibold">{group ? group.name : 'Progreso general'}</h1>
			<span class="text-2xl font-bold text-emerald-400">{globalPct}%</span>
		</div>
		<div class="h-2 w-full overflow-hidden rounded-full bg-slate-800">
			<div class="h-full bg-emerald-500" style="width: {globalPct}%"></div>
		</div>
		<p class="mt-2 text-sm text-slate-400">
			{haveCount} de {totalCount} stickers · {dupCount} repetidos
		</p>
	</section>

	{#if errorMessage}
		<div class="rounded-lg border border-red-800 bg-red-950/50 px-4 py-2 text-sm text-red-300">
			{errorMessage}
		</div>
	{/if}

	<section class="flex flex-col gap-3 sm:flex-row sm:items-center">
		<input
			type="search"
			bind:value={query}
			placeholder="Buscar por nombre o código…"
			class="w-full rounded-md border-slate-700 bg-slate-900 text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:ring-emerald-500 sm:flex-1"
		/>
		<div class="flex gap-2">
			{#each [['all', 'Todos'], ['have', 'Tengo'], ['missing', 'Me falta'], ['duplicate', 'Repetidas']] as [value, label] (value)}
				<button
					type="button"
					onclick={() => (statusFilter = value as StatusFilter)}
					class="rounded-md border px-3 py-1.5 text-sm {statusFilter === value
						? 'border-emerald-500 bg-emerald-600 text-white'
						: 'border-slate-700 text-slate-300 hover:bg-slate-800'}"
				>
					{label}
				</button>
			{/each}
		</div>
	</section>

	<div class="flex justify-end gap-3 text-xs text-slate-400">
		<button type="button" onclick={expandAll} class="hover:text-emerald-400">Expandir todo</button>
		<button type="button" onclick={collapseAll} class="hover:text-emerald-400">Colapsar todo</button>
	</div>

	{#each sections as section (section.key)}
		{@const stats = sectionStats.get(section.key)}
		<section class="space-y-3">
			<div class="flex items-center gap-2 border-b border-slate-800 pb-2">
				<h2 class="text-sm font-bold uppercase tracking-widest text-slate-300">{section.label}</h2>
				<span class="ml-auto text-xs text-slate-500">{stats?.have ?? 0}/{stats?.total ?? 0}</span>
			</div>

			<div class="space-y-2">
				{#each section.teams as { team, items: teamItems } (team)}
					{@const key = cardKey(section.key, team)}
					{@const teamStat = cardStats.get(key)}
					{@const pct =
						teamStat && teamStat.total > 0 ? Math.round((teamStat.have / teamStat.total) * 100) : 0}
					{@const isOpen = openCards.has(key) || cardsMatchingQuery.has(key)}
					<div class="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
						<button
							type="button"
							onclick={() => toggleCard(key)}
							aria-expanded={isOpen}
							class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/60"
						>
							<span class="text-2xl leading-none">{getTeamFlag(team)}</span>
							<span class="min-w-0 flex-1">
								<span class="flex items-center justify-between gap-2">
									<span class="truncate text-sm font-semibold text-slate-200">{team}</span>
									<span class="shrink-0 text-xs text-slate-500"
										>{teamStat?.have ?? 0}/{teamStat?.total ?? 0}</span
									>
								</span>
								<span class="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
									<span class="block h-full bg-emerald-500" style="width: {pct}%"></span>
								</span>
							</span>
							<svg
								class="h-4 w-4 shrink-0 text-slate-500 transition-transform {isOpen
									? 'rotate-180'
									: ''}"
								viewBox="0 0 20 20"
								fill="currentColor"
							>
								<path
									fill-rule="evenodd"
									d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
									clip-rule="evenodd"
								/>
							</svg>
						</button>

						{#if isOpen}
							<div class="grid grid-cols-3 gap-2 border-t border-slate-800 px-3 pb-3 pt-3 sm:grid-cols-5">
								{#each teamItems as item (item.code)}
									<div
										class="flex flex-col items-center gap-1 rounded-lg border p-2 text-center {item.quantity >
										0
											? 'border-emerald-800 bg-emerald-950/30'
											: item.groupQuantity > 0
												? 'border-sky-800 bg-sky-950/20'
												: 'border-slate-800 bg-slate-900/40'}"
									>
										<button
											type="button"
											onclick={() => toggleHave(item)}
											class="flex w-full flex-col items-center gap-1"
										>
											<span
												class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm {item.quantity >
												0
													? 'border-emerald-500 bg-emerald-500 text-slate-950'
													: 'border-slate-600'}"
											>
												{#if item.quantity > 0}✓{/if}
											</span>
											<span class="w-full truncate text-[11px] text-slate-500">#{item.code}</span>
											<span class="line-clamp-2 w-full text-xs font-medium leading-tight"
												>{item.name}</span
											>
										</button>

										{#if group}
											<div class="flex w-full flex-wrap justify-center gap-1">
												{#each group.members.filter((member) => item.memberQuantities[member.user_id] > 0) as member (member.user_id)}
													<span title={member.display_name} class="rounded border border-slate-700 px-1 text-[10px] text-slate-300">
														{member.display_name.slice(0, 2).toUpperCase()}{item.memberQuantities[member.user_id] > 1 ? `+${item.memberQuantities[member.user_id] - 1}` : ''}
													</span>
												{/each}
											</div>
										{/if}

										{#if item.quantity > 0}
											<div class="mt-0.5 flex shrink-0 items-center gap-1 text-xs">
												<button
													type="button"
													onclick={() => decDup(item)}
													disabled={item.quantity <= 1}
													class="h-5 w-5 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-30"
												>
													−
												</button>
												<span class="w-4 text-center text-slate-300">{item.quantity - 1}</span>
												<button
													type="button"
													onclick={() => incDup(item)}
													class="h-5 w-5 rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
												>
													+
												</button>
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</section>
	{/each}

	{#if sections.length === 0}
		<p class="py-12 text-center text-slate-500">No hay stickers que coincidan con tu búsqueda.</p>
	{/if}

	<section class="space-y-3 border-t border-slate-800 pt-5">
		<div class="flex items-center justify-between">
			<h2 class="text-sm font-bold uppercase tracking-widest text-slate-300">Historial personal</h2>
			<span class="text-xs text-slate-500">Ultimos movimientos</span>
		</div>
		{#if data.history.length === 0}
			<p class="rounded-lg border border-slate-800 bg-slate-900/30 px-3 py-4 text-center text-sm text-slate-500">
				Todavia no hay movimientos registrados.
			</p>
		{:else}
			<ul class="max-h-80 space-y-1 overflow-y-auto pr-1">
				{#each data.history as event (event.id)}
					<li class="flex items-center gap-3 rounded-md border border-slate-800 bg-slate-900/30 px-3 py-2 text-sm">
						<span class="text-lg leading-none">{getTeamFlag(event.team)}</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate font-medium text-slate-200">{event.sticker_name}</span>
							<span class="block text-xs text-slate-500">#{event.sticker_code} - {formatEventDate(event.created_at)}</span>
						</span>
						<span class="shrink-0 text-right text-xs {event.delta > 0 ? 'text-emerald-400' : 'text-amber-400'}">
							{eventLabel(event.action, event.delta)}<br />
							<span class="text-slate-500">{event.delta > 0 ? '+' : ''}{event.delta}</span>
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

</div>
