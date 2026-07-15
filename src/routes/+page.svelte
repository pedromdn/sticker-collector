<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import type { PageData } from './$types';
	import type { StatusFilter, StickerItem } from '$lib/types';
	import { getTeamFlag } from '$lib/flags';
	import { getSectionKey, getSectionLabel, SECTION_ORDER, type SectionKey } from '$lib/groups';

	let { data }: { data: PageData } = $props();

	let items = $state<StickerItem[]>(data.items.map((item) => ({ ...item })));
	let query = $state('');
	let statusFilter = $state<StatusFilter>('all');
	let errorMessage = $state('');
	let openTeams = new SvelteSet<string>();

	const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

	async function persist(code: string, quantity: number) {
		const userId = data.user?.id;
		if (!userId) return;

		const { error } = await data.supabase
			.from('user_stickers')
			.upsert(
				{ user_id: userId, sticker_code: code, quantity },
				{ onConflict: 'user_id,sticker_code' }
			);

		if (error) {
			errorMessage = 'No se pudo guardar el cambio. Revisa tu conexión e intenta de nuevo.';
		}
	}

	function scheduleSave(code: string, quantity: number) {
		errorMessage = '';
		const existing = pendingTimers.get(code);
		if (existing) clearTimeout(existing);
		pendingTimers.set(
			code,
			setTimeout(() => {
				pendingTimers.delete(code);
				persist(code, quantity);
			}, 300)
		);
	}

	function toggleHave(item: StickerItem) {
		item.quantity = item.quantity > 0 ? 0 : 1;
		scheduleSave(item.code, item.quantity);
	}

	function incDup(item: StickerItem) {
		item.quantity += 1;
		scheduleSave(item.code, item.quantity);
	}

	function decDup(item: StickerItem) {
		if (item.quantity <= 1) return;
		item.quantity -= 1;
		scheduleSave(item.code, item.quantity);
	}

	function toggleTeam(team: string) {
		if (openTeams.has(team)) {
			openTeams.delete(team);
		} else {
			openTeams.add(team);
		}
	}

	function expandAll() {
		for (const team of teamStats.keys()) openTeams.add(team);
	}

	function collapseAll() {
		openTeams.clear();
	}

	let totalCount = $derived(items.length);
	let haveCount = $derived(items.filter((i) => i.quantity > 0).length);
	let dupCount = $derived(items.reduce((sum, i) => sum + Math.max(0, i.quantity - 1), 0));
	let globalPct = $derived(totalCount === 0 ? 0 : Math.round((haveCount / totalCount) * 100));

	let teamStats = $derived.by(() => {
		const map = new Map<string, { have: number; total: number }>();
		for (const item of items) {
			const stats = map.get(item.team) ?? { have: 0, total: 0 };
			stats.total += 1;
			if (item.quantity > 0) stats.have += 1;
			map.set(item.team, stats);
		}
		return map;
	});

	// Aggregate team stats up into section (intro / group / history) stats.
	let sectionStats = $derived.by(() => {
		const map = new Map<SectionKey, { have: number; total: number }>();
		for (const [team, stats] of teamStats) {
			const key = getSectionKey(team);
			const agg = map.get(key) ?? { have: 0, total: 0 };
			agg.have += stats.have;
			agg.total += stats.total;
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
				(statusFilter === 'have' && item.quantity > 0) ||
				(statusFilter === 'missing' && item.quantity === 0);
			return matchesQuery && matchesStatus;
		});
	});

	// Teams with a search match auto-expand, independent of "tengo/falta" so
	// toggling a sticker never collapses the section you're looking at.
	let teamsMatchingQuery = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const set = new Set<string>();
		if (q === '') return set;
		for (const item of items) {
			if (item.name.toLowerCase().includes(q) || item.code.toLowerCase().includes(q)) {
				set.add(item.team);
			}
		}
		return set;
	});

	let teamGroups = $derived.by(() => {
		const map = new Map<string, StickerItem[]>();
		for (const item of filtered) {
			if (!map.has(item.team)) map.set(item.team, []);
			map.get(item.team)!.push(item);
		}
		return [...map.entries()];
	});

	// Two-level layout: World Cup section (intro / Group A-L / history) as a
	// plain heading, teams underneath as the actual collapsible units.
	let sections = $derived.by(() => {
		const bySection = new Map<SectionKey, { team: string; items: StickerItem[] }[]>();
		for (const [team, teamItems] of teamGroups) {
			const key = getSectionKey(team);
			if (!bySection.has(key)) bySection.set(key, []);
			bySection.get(key)!.push({ team, items: teamItems });
		}
		return SECTION_ORDER.filter((key) => bySection.has(key)).map((key) => ({
			key,
			label: getSectionLabel(key),
			teams: bySection.get(key)!
		}));
	});
</script>

<svelte:head>
	<title>Mi Álbum Mundial 2026</title>
</svelte:head>

<div class="space-y-8 pb-16">
	<section class="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
		<div class="mb-2 flex items-baseline justify-between">
			<h1 class="text-lg font-semibold">Progreso general</h1>
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
			{#each [['all', 'Todos'], ['have', 'Tengo'], ['missing', 'Me falta']] as [value, label] (value)}
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
					{@const teamStat = teamStats.get(team)}
					{@const pct =
						teamStat && teamStat.total > 0 ? Math.round((teamStat.have / teamStat.total) * 100) : 0}
					{@const isOpen = openTeams.has(team) || teamsMatchingQuery.has(team)}
					<div class="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
						<button
							type="button"
							onclick={() => toggleTeam(team)}
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
							<div class="space-y-1.5 border-t border-slate-800 px-3 pb-3 pt-3">
								{#each teamItems as item (item.code)}
									<div
										class="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 {item.quantity >
										0
											? 'border-emerald-800 bg-emerald-950/30'
											: 'border-slate-800 bg-slate-900/40'}"
									>
										<button
											type="button"
											onclick={() => toggleHave(item)}
											class="flex min-w-0 flex-1 items-center gap-3 text-left"
										>
											<span
												class="flex h-6 w-6 shrink-0 items-center justify-center rounded border text-sm {item.quantity >
												0
													? 'border-emerald-500 bg-emerald-500 text-slate-950'
													: 'border-slate-600'}"
											>
												{#if item.quantity > 0}✓{/if}
											</span>
											<span class="min-w-0">
												<span class="block truncate text-sm font-medium">{item.name}</span>
												<span class="block text-xs text-slate-500">#{item.code}</span>
											</span>
										</button>

										{#if item.quantity > 0}
											<div class="flex shrink-0 items-center gap-1 text-sm">
												<button
													type="button"
													onclick={() => decDup(item)}
													disabled={item.quantity <= 1}
													class="h-7 w-7 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-30"
												>
													−
												</button>
												<span class="w-6 text-center text-slate-300">{item.quantity - 1}</span>
												<button
													type="button"
													onclick={() => incDup(item)}
													class="h-7 w-7 rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
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
</div>
