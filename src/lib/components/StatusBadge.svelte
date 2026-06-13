<script lang="ts">
	import { statusStyle } from '$lib/status';

	let { status, size = 'sm' }: { status: string; size?: 'sm' | 'md' } = $props();

	const style = $derived(statusStyle(status));
</script>

<span
	class="inline-flex items-center rounded-full font-semibold tracking-wide whitespace-nowrap uppercase {style.softClass} {style.strongClass} {size ===
	'md'
		? 'gap-1.5 px-3 py-1 text-xs'
		: 'gap-1 px-2 py-0.5 text-[11px]'}"
	title="Status: {style.label}"
>
	<svg
		class={size === 'md' ? 'size-4' : 'size-3.5'}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		aria-hidden="true"
	>
		<path stroke-linecap="round" stroke-linejoin="round" d={style.icon} />
	</svg>
	<span class="sr-only">status:</span>
	<span>{style.label}</span>
</span>
