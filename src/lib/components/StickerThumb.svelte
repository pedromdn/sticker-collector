<script lang="ts">
	import { getTeamFlag } from '$lib/flags';

	let {
		img,
		team,
		alt,
		size = 'thumb',
		class: className = 'h-8 w-8'
	}: {
		img: string | null;
		team: string;
		alt: string;
		size?: 'thumb' | 'mid';
		class?: string;
	} = $props();

	let url = $state('');
	let failed = $state(false);

	$effect(() => {
		url = '';
		failed = false;
		if (!img) return;

		const controller = new AbortController();
		fetch(`/api/sticker-image?img=${encodeURIComponent(img)}&size=${size}`, {
			signal: controller.signal
		})
			.then((res) => (res.ok ? res.json() : Promise.reject()))
			.then((data) => {
				url = data.url;
			})
			.catch(() => {
				failed = true;
			});

		return () => controller.abort();
	});
</script>

{#if img && url && !failed}
	<img
		src={url}
		alt={alt}
		class="shrink-0 rounded-md object-cover {className}"
		onerror={() => (failed = true)}
	/>
{:else}
	<span class="flex shrink-0 items-center justify-center rounded-md bg-slate-900 {className}">
		<span class="leading-none">{getTeamFlag(team)}</span>
	</span>
{/if}
