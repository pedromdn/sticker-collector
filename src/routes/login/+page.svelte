<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let submitting = $state(false);
	let mode = $state<'login' | 'signup'>(form?.mode === 'signup' ? 'signup' : 'login');
</script>

<svelte:head>
	<title>Entrar · Mi Álbum Mundial 2026</title>
</svelte:head>

<div class="mx-auto mt-16 max-w-sm">
	<h1 class="mb-1 text-center text-2xl font-bold">⚽ Mi Álbum Mundial 2026</h1>
	<p class="mb-8 text-center text-slate-400">Lleva el control de tu colección de stickers Panini.</p>

	{#if form?.signedUp}
		<div
			class="rounded-lg border border-emerald-800 bg-emerald-950/50 p-4 text-center text-emerald-300"
		>
			Cuenta creada para <strong>{form.email}</strong>. Revisa tu correo para confirmarla y luego
			inicia sesión.
		</div>
	{:else}
		<div class="mb-6 flex rounded-md border border-slate-700 p-1 text-sm">
			<button
				type="button"
				onclick={() => (mode = 'login')}
				class="flex-1 rounded py-1.5 {mode === 'login'
					? 'bg-emerald-600 text-white'
					: 'text-slate-400 hover:text-slate-200'}"
			>
				Iniciar sesión
			</button>
			<button
				type="button"
				onclick={() => (mode = 'signup')}
				class="flex-1 rounded py-1.5 {mode === 'signup'
					? 'bg-emerald-600 text-white'
					: 'text-slate-400 hover:text-slate-200'}"
			>
				Crear cuenta
			</button>
		</div>

		<form
			method="post"
			action={mode === 'login' ? '?/login' : '?/signup'}
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

			<div>
				<label for="password" class="mb-1 block text-sm text-slate-300">Contraseña</label>
				<input
					id="password"
					name="password"
					type="password"
					required
					minlength="6"
					autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
					placeholder="••••••••"
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
				{#if submitting}
					{mode === 'login' ? 'Entrando…' : 'Creando cuenta…'}
				{:else}
					{mode === 'login' ? 'Entrar' : 'Crear cuenta'}
				{/if}
			</button>
		</form>
	{/if}
</div>
