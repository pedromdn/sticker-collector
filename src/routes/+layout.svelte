<script lang="ts">
	import '../app.css';
	import { onMount, type Snippet } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { LayoutGrid, PlusCircle, ArrowLeftRight, Users } from 'lucide-svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	onMount(() => {
		const {
			data: { subscription }
		} = data.supabase.auth.onAuthStateChange((_event, newSession) => {
			if (newSession?.expires_at !== data.session?.expires_at) {
				invalidate('supabase:auth');
			}
		});
		return () => subscription.unsubscribe();
	});

	const navItems = [
		{ href: '/', label: 'Colección', icon: LayoutGrid, match: (path: string) => path === '/' },
		{
			href: '/agregar',
			label: 'Agregar',
			icon: PlusCircle,
			match: (path: string) => path === '/agregar'
		},
		{
			href: '/intercambio',
			label: 'Intercambio',
			icon: ArrowLeftRight,
			match: (path: string) => path.startsWith('/intercambio')
		},
		{ href: '/grupo', label: 'Grupo', icon: Users, match: (path: string) => path.startsWith('/grupo') }
	];
</script>

<div class="min-h-screen bg-slate-950 text-slate-100">
	{#if data.session}
		<header class="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
			<div class="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
				<a href="/" class="font-semibold tracking-tight text-slate-100">
					⚽ Mi Álbum <span class="text-emerald-400">Mundial 2026</span>
				</a>
				<div class="flex items-center gap-3 text-sm text-slate-400">
					<span class="hidden sm:inline">{data.user?.email}</span>
					<form method="post" action="/logout">
						<button
							type="submit"
							class="rounded-md border border-slate-700 px-3 py-1.5 text-slate-200 hover:bg-slate-800"
						>
							Salir
						</button>
					</form>
				</div>
			</div>
			<!-- Tab bar, desktop/tablet only — mobile gets the fixed bottom bar. -->
			<nav class="mx-auto hidden max-w-3xl gap-1 px-4 text-sm sm:flex">
				{#each navItems as item (item.href)}
					{@const active = item.match(page.url.pathname)}
					<a
						href={item.href}
						class="flex items-center gap-1.5 border-b-2 px-3 py-2.5 transition-colors {active
							? 'border-emerald-500 text-emerald-400'
							: 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200'}"
					>
						<item.icon class="h-4 w-4" strokeWidth={2} />
						{item.label}
					</a>
				{/each}
			</nav>
		</header>

		<!-- Fixed bottom tab bar, mobile only. -->
		<nav
			class="fixed inset-x-0 bottom-0 z-10 flex border-t border-slate-800 bg-slate-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
		>
			{#each navItems as item (item.href)}
				{@const active = item.match(page.url.pathname)}
				<a
					href={item.href}
					class="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] {active
						? 'text-emerald-400'
						: 'text-slate-500'}"
				>
					<item.icon class="h-5 w-5" strokeWidth={2} />
					{item.label}
				</a>
			{/each}
		</nav>
	{/if}

	<main class="mx-auto max-w-3xl px-4 py-6 {data.session ? 'pb-24 sm:pb-6' : ''}">
		{@render children()}
	</main>
</div>
