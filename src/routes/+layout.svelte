<script lang="ts">
	import '../app.css';
	import { onMount, type Snippet } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
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
			<nav class="mx-auto flex max-w-3xl gap-1 px-4 pb-2 text-sm">
				<a
					href="/"
					class="rounded-md px-3 py-1.5 {page.url.pathname === '/'
						? 'bg-emerald-600 text-white'
						: 'text-slate-400 hover:bg-slate-800'}"
				>
					Colección
				</a>
				<a
					href="/agregar"
					class="rounded-md px-3 py-1.5 {page.url.pathname === '/agregar'
						? 'bg-emerald-600 text-white'
						: 'text-slate-400 hover:bg-slate-800'}"
				>
					Agregar
				</a>
			</nav>
		</header>
	{/if}

	<main class="mx-auto max-w-3xl px-4 py-6">
		{@render children()}
	</main>
</div>
