<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let submitting = $state(false);
</script>

<svelte:head>
	<title>Entrar · Mi Álbum Mundial 2026</title>
</svelte:head>

<div class="mx-auto mt-16 max-w-sm">
	<h1 class="mb-1 text-center text-2xl font-bold">⚽ Mi Álbum Mundial 2026</h1>
	<p class="mb-8 text-center text-slate-400">Lleva el control de tu colección de stickers Panini.</p>

	{#if form?.sent}
		<div class="rounded-lg border border-emerald-800 bg-emerald-950/50 p-4 text-center text-emerald-300">
			Te enviamos un enlace mágico a <strong>{form.email}</strong>. Revisa tu correo para entrar.
		</div>
	{:else}
		<form
			method="post"
			class="space-y-4"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					submitting = false;
					await update();
				};
			}}
		>
			<div>
				<label for="email" class="mb-1 block text-sm text-slate-300">Correo electrónico</label>
				<input
					id="email"
					name="email"
					type="email"
					required
					autocomplete="email"
					value={form?.email ?? ''}
					placeholder="tu@correo.com"
					class="w-full rounded-md border-slate-700 bg-slate-900 text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:ring-emerald-500"
				/>
			</div>

			{#if form?.error}
				<p class="text-sm text-red-400">{form.error}</p>
			{/if}

			<button
				type="submit"
				disabled={submitting}
				class="w-full rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
			>
				{submitting ? 'Enviando…' : 'Enviar enlace mágico'}
			</button>
		</form>
	{/if}
</div>
