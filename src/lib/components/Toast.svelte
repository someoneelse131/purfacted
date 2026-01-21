<script lang="ts">
	import { toast } from '$lib/stores/toast';
	import { fly } from 'svelte/transition';
</script>

{#if $toast.length > 0}
	<div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
		{#each $toast as t (t.id)}
			<div
				transition:fly={{ x: 100, duration: 200 }}
				class="flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg min-w-[280px] max-w-md
					{t.type === 'success' ? 'bg-green-600 text-white' : ''}
					{t.type === 'error' ? 'bg-red-600 text-white' : ''}
					{t.type === 'info' ? 'bg-gray-800 text-white' : ''}"
			>
				{#if t.type === 'success'}
					<svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
					</svg>
				{:else if t.type === 'error'}
					<svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				{:else}
					<svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
				{/if}
				<span class="flex-1 text-sm font-medium">{t.message}</span>
				<button
					type="button"
					on:click={() => toast.remove(t.id)}
					class="flex-shrink-0 opacity-70 hover:opacity-100"
				>
					<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
		{/each}
	</div>
{/if}
