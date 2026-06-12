<script lang="ts">
	import type { PageData } from './$types';
	import FactStatusBadge from '$lib/components/FactStatusBadge.svelte';

	let { data }: { data: PageData } = $props();
	const page = $derived(data.categoryPage);
</script>

<svelte:head><title>{page.category.name} - PurFacted</title></svelte:head>

<div class="mx-auto max-w-2xl">
	<h1 class="mb-2 text-2xl font-bold text-slate-900">{page.category.name}</h1>

	{#if page.children.length > 0}
		<p class="mb-6 flex flex-wrap gap-2 text-sm">
			{#each page.children as child (child.id)}
				<a
					href="/categories/{child.slug}"
					class="rounded-full bg-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-300"
				>
					{child.name}
				</a>
			{/each}
		</p>
	{/if}

	<h2 class="mb-3 text-lg font-semibold text-slate-900">Facts</h2>
	{#if page.facts.length === 0}
		<p class="text-sm text-slate-500">No facts in this category yet.</p>
	{:else}
		<ul class="space-y-2">
			{#each page.facts as fact (fact.id)}
				<li
					class="flex items-center justify-between gap-4 rounded-md border border-slate-200 bg-white px-4 py-3"
				>
					<span class="text-sm text-slate-800">{fact.title}</span>
					<FactStatusBadge status={fact.status} />
				</li>
			{/each}
		</ul>
	{/if}
</div>
