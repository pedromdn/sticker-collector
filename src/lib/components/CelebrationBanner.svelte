<script lang="ts">
	import confetti from 'canvas-confetti';

	let {
		celebration
	}: {
		celebration: { kind: 'team' | 'album'; label: string } | null;
	} = $props();

	$effect(() => {
		if (!celebration) return;
		const isAlbum = celebration.kind === 'album';
		confetti({
			particleCount: isAlbum ? 220 : 90,
			spread: isAlbum ? 100 : 70,
			startVelocity: isAlbum ? 45 : 35,
			origin: { y: 0.3 }
		});
	});
</script>

{#if celebration}
	<div class="pointer-events-none fixed inset-x-0 top-16 z-[60] flex justify-center px-4">
		<div
			class="pointer-events-auto rounded-full border border-emerald-500 bg-emerald-950/95 px-5 py-2.5 text-center shadow-lg backdrop-blur"
		>
			<p class="text-sm font-semibold text-emerald-200">{celebration.label}</p>
		</div>
	</div>
{/if}
