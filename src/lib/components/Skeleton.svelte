<script lang="ts">
	export let variant: 'text' | 'circular' | 'rectangular' = 'text';
	export let width: string = '100%';
	export let height: string = variant === 'text' ? '1rem' : '100px';
	export let lines: number = 1;
</script>

{#if variant === 'text' && lines > 1}
	<div class="space-y-2">
		{#each Array(lines) as _, i}
			<div
				class="animate-pulse bg-gray-200 rounded"
				style="width: {i === lines - 1 ? '75%' : width}; height: {height};"
			/>
		{/each}
	</div>
{:else if variant === 'circular'}
	<div class="animate-pulse bg-gray-200 rounded-full" style="width: {width}; height: {width};" />
{:else}
	<div class="animate-pulse bg-gray-200 rounded" style="width: {width}; height: {height};" />
{/if}
