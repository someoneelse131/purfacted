<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Review Hub - PurFacted</title></svelte:head>

<div class="mx-auto max-w-2xl">
	<h1 class="mb-2 text-2xl font-bold text-slate-900">Review Hub</h1>
	<p class="mb-6 text-sm text-slate-600">
		Claims under review. Add evidence, vote on sources, help reach a verdict.
	</p>

	{#if data.facts.length === 0}
		<p class="text-sm text-slate-500">Nothing under review right now.</p>
	{:else}
		<ul class="space-y-2">
			{#each data.facts as fact (fact.id)}
				<li class="rounded-md border border-slate-200 bg-white px-4 py-3">
					<a href="/facts/{fact.id}" class="font-medium text-slate-900 hover:underline">
						{fact.title}
					</a>
					<p class="mt-1 text-xs text-slate-500">
						{fact.category.name} · by {fact.author.username} · {fact._count.sources}
						source{fact._count.sources === 1 ? '' : 's'}
					</p>
				</li>
			{/each}
		</ul>
	{/if}
</div>
