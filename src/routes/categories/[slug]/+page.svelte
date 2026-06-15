<script lang="ts">
	import type { PageData } from './$types';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import ContestedBadge from '$lib/components/ContestedBadge.svelte';

	let { data }: { data: PageData } = $props();
	const page = $derived(data.categoryPage);
</script>

<svelte:head><title>{page.category.name} - PurFacted</title></svelte:head>

<div class="mx-auto max-w-2xl">
	<div class="mb-2 flex items-start justify-between gap-4">
		<h1 class="text-2xl font-bold text-ink">{page.category.name}</h1>
		{#if data.user}
			<form method="POST" action={data.following ? '?/unfollow' : '?/follow'}>
				<input type="hidden" name="targetId" value={page.category.id} />
				<button
					type="submit"
					class={data.following ? 'btn btn-sm btn-secondary' : 'btn btn-sm btn-primary'}
					data-testid="follow-toggle"
				>
					{data.following ? 'Following' : 'Follow'}
				</button>
			</form>
		{/if}
	</div>
	<p class="mb-6 text-sm text-ink-faint" data-testid="follower-count">
		{page.followerCount}
		{page.followerCount === 1 ? 'follower' : 'followers'}
	</p>

	{#if page.children.length > 0}
		<p class="mb-6 flex flex-wrap gap-2 text-sm">
			{#each page.children as child (child.id)}
				<a
					href="/categories/{child.slug}"
					class="chip-primary px-3 py-1 text-sm hover:bg-primary hover:text-white dark:hover:text-canvas"
				>
					{child.name}
				</a>
			{/each}
		</p>
	{/if}

	<h2 class="mb-3 text-lg font-semibold text-ink">Facts</h2>
	{#if page.facts.length === 0}
		<p class="text-sm text-ink-muted">No facts in this category yet.</p>
	{:else}
		<ul class="space-y-2">
			{#each page.facts as fact (fact.id)}
				<li class="card flex items-center justify-between gap-4 px-4 py-3">
					<span class="font-serif leading-snug font-semibold text-ink">{fact.title}</span>
					<span class="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
						<StatusBadge status={fact.status} />
						{#if fact.contested}
							<ContestedBadge />
						{/if}
					</span>
				</li>
			{/each}
		</ul>

		{#if page.totalPages > 1}
			<nav class="mt-6 flex items-center justify-between text-sm" aria-label="Pagination">
				{#if page.page > 1}
					<a
						href="/categories/{page.category.slug}?page={page.page - 1}"
						class="text-primary underline"
					>
						Previous
					</a>
				{:else}
					<span></span>
				{/if}
				<span class="text-ink-faint">Page {page.page} of {page.totalPages}</span>
				{#if page.page < page.totalPages}
					<a
						href="/categories/{page.category.slug}?page={page.page + 1}"
						class="text-primary underline"
					>
						Next
					</a>
				{:else}
					<span></span>
				{/if}
			</nav>
		{/if}
	{/if}
</div>
