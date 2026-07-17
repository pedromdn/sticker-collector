<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import StickerThumb from '$lib/components/StickerThumb.svelte';

	let { data, form }: { data: PageData; form: { error?: string } | null } = $props();
	let copied = $state(false);

	async function copyInvite(code: string) {
		await navigator.clipboard.writeText(code);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	function eventLabel(action: string, delta: number) {
		if (action === 'traded') return delta > 0 ? 'recibio en intercambio' : 'entrego en intercambio';
		return delta > 0 ? 'agrego' : 'resto';
	}

	function formatEventDate(value: string) {
		return new Intl.DateTimeFormat('es-MX', {
			dateStyle: 'short',
			timeStyle: 'short'
		}).format(new Date(value));
	}
</script>

<svelte:head>
	<title>Grupo colaborativo - Mi Album Mundial 2026</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6 pb-16">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-lg font-semibold">Grupo colaborativo</h1>
			<p class="text-sm text-slate-500">
				Compartan el album, vean quien agrego cada sticker y separen los repetidos que si estan disponibles para intercambio fisico.
			</p>
		</div>
	</div>

	{#if form?.error}
		<div class="rounded-lg border border-red-800 bg-red-950/50 px-4 py-2 text-sm text-red-300">
			{form.error}
		</div>
	{/if}

	{#if data.group}
		<section class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<h2 class="font-semibold text-slate-100">{data.group.name}</h2>
					<p class="mt-1 text-sm text-slate-400">Codigo para invitar: <span class="font-mono text-emerald-300">{data.group.invite_code}</span></p>
				</div>
				<button
					type="button"
					onclick={() => copyInvite(data.group!.invite_code)}
					class="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
				>
					{copied ? 'Copiado' : 'Copiar codigo'}
				</button>
			</div>
		</section>

		<section class="space-y-3">
			<h2 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Integrantes</h2>
			<ul class="space-y-2">
				{#each data.group.members as member (member.user_id)}
					<li class="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
						<div class="flex items-center justify-between gap-3">
							<div class="min-w-0">
								<p class="truncate text-sm font-medium text-slate-100">{member.display_name}</p>
								<p class="text-xs text-slate-500">{member.location_label}</p>
							</div>
							<span class="shrink-0 rounded-full border px-2 py-0.5 text-xs {member.is_swap_local ? 'border-emerald-800 text-emerald-300' : 'border-amber-800 text-amber-300'}">
								{member.is_swap_local ? 'Cuenta para swaps' : 'Solo visible'}
							</span>
						</div>
					</li>
				{/each}
			</ul>
		</section>

		{#if data.group.currentMember}
			<form method="post" action="?/profile" use:enhance class="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
				<input type="hidden" name="group_id" value={data.group.id} />
				<h2 class="font-semibold text-slate-100">Mi perfil en el grupo</h2>
				<label class="block text-sm">
					<span class="text-slate-400">Nombre</span>
					<input name="display_name" value={data.group.currentMember.display_name} class="mt-1 w-full rounded-md border-slate-700 bg-slate-950 text-slate-100 focus:border-emerald-500 focus:ring-emerald-500" />
				</label>
				<label class="block text-sm">
					<span class="text-slate-400">Ubicacion</span>
					<input name="location_label" value={data.group.currentMember.location_label} class="mt-1 w-full rounded-md border-slate-700 bg-slate-950 text-slate-100 focus:border-emerald-500 focus:ring-emerald-500" />
				</label>
				<label class="flex items-start gap-2 text-sm text-slate-300">
					<input type="checkbox" name="is_swap_local" checked={data.group.currentMember.is_swap_local} class="mt-1 rounded border-slate-600 text-emerald-600" />
					<span>Mis repetidos estan fisicamente disponibles para intercambios del grupo.</span>
				</label>
				<button type="submit" class="w-full rounded-md bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-500">
					Guardar perfil
				</button>
			</form>
		{/if}

		<form method="post" action="?/leave" use:enhance>
			<input type="hidden" name="group_id" value={data.group.id} />
			<button type="submit" class="w-full rounded-md border border-red-900 py-2 text-sm text-red-300 hover:bg-red-950/40">
				Salir del grupo
			</button>
		</form>

		<section class="space-y-3 border-t border-slate-800 pt-5">
			<div class="flex items-center justify-between">
				<h2 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Historial del grupo</h2>
				<span class="text-xs text-slate-600">Ultimos movimientos</span>
			</div>
			{#await data.history}
				<p class="rounded-lg border border-slate-800 bg-slate-900/30 px-3 py-4 text-center text-sm text-slate-500">
					Cargando historial…
				</p>
			{:then history}
				{#if history.length === 0}
					<p class="rounded-lg border border-slate-800 bg-slate-900/30 px-3 py-4 text-center text-sm text-slate-500">
						Todavia no hay movimientos registrados en este grupo.
					</p>
				{:else}
					<ul class="max-h-80 space-y-1 overflow-y-auto pr-1">
						{#each history as event (event.id)}
							<li class="rounded-md border border-slate-800 bg-slate-900/30 px-3 py-2 text-sm">
								<div class="flex items-center gap-3">
									<StickerThumb img={event.img} team={event.team} alt={event.sticker_name} class="h-8 w-8" />
									<div class="flex min-w-0 flex-1 items-center justify-between gap-3">
										<span class="min-w-0">
											<span class="block truncate font-medium text-slate-200">{event.actor_name ?? 'Miembro anterior'} {eventLabel(event.action, event.delta)}</span>
											<span class="block truncate text-xs text-slate-500">#{event.sticker_code} - {event.sticker_name}</span>
										</span>
										<span class="shrink-0 text-right text-xs {event.delta > 0 ? 'text-emerald-400' : 'text-amber-400'}">
											{event.delta > 0 ? '+' : ''}{event.delta}<br />
											<span class="text-slate-600">{formatEventDate(event.created_at)}</span>
										</span>
									</div>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			{/await}
		</section>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2">
			<form method="post" action="?/create" use:enhance class="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
				<h2 class="font-semibold text-slate-100">Crear grupo</h2>
				<input name="name" placeholder="Nombre del grupo" class="w-full rounded-md border-slate-700 bg-slate-950 text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:ring-emerald-500" />
				<input name="display_name" placeholder="Tu nombre" class="w-full rounded-md border-slate-700 bg-slate-950 text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:ring-emerald-500" />
				<input name="location_label" placeholder="Ubicacion" value="Misma ubicacion" class="w-full rounded-md border-slate-700 bg-slate-950 text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:ring-emerald-500" />
				<label class="flex items-start gap-2 text-sm text-slate-300">
					<input type="checkbox" name="is_swap_local" checked class="mt-1 rounded border-slate-600 text-emerald-600" />
					<span>Mis repetidos cuentan para swaps locales.</span>
				</label>
				<button type="submit" class="w-full rounded-md bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-500">Crear</button>
			</form>

			<form method="post" action="?/join" use:enhance class="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
				<h2 class="font-semibold text-slate-100">Unirme</h2>
				<input name="invite_code" placeholder="Codigo de invitacion" class="w-full rounded-md border-slate-700 bg-slate-950 font-mono uppercase text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:ring-emerald-500" />
				<input name="display_name" placeholder="Tu nombre" class="w-full rounded-md border-slate-700 bg-slate-950 text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:ring-emerald-500" />
				<input name="location_label" placeholder="Ubicacion" class="w-full rounded-md border-slate-700 bg-slate-950 text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:ring-emerald-500" />
				<label class="flex items-start gap-2 text-sm text-slate-300">
					<input type="checkbox" name="is_swap_local" class="mt-1 rounded border-slate-600 text-emerald-600" />
					<span>Estoy en la misma ubicacion y mis repetidos cuentan para swaps.</span>
				</label>
				<button type="submit" class="w-full rounded-md bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-500">Unirme</button>
			</form>
		</div>
	{/if}
</div>
