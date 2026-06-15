<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const feed = $derived(data.feed);

	function timeAgo(date: Date | string): string {
		const d = typeof date === 'string' ? new Date(date) : date;
		return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
	}
</script>

<svelte:head><title>Home - PurFacted</title></svelte:head>

<div class="mx-auto max-w-2xl">
	<h1 class="mb-2 text-2xl font-bold text-ink">Home</h1>
	<p class="mb-6 text-sm text-ink-muted">
		Activity from the people and categories you follow. Manage your follows in
		<a href="/account" class="text-primary underline">your account</a>.
	</p>

	<div class="mb-6 flex gap-2 text-sm" role="tablist" aria-label="Feed scope">
		<a
			href="/home"
			role="tab"
			aria-selected={feed.tab === 'following'}
			class={feed.tab === 'following' ? 'chip-primary px-3 py-1' : 'chip px-3 py-1'}
			data-testid="tab-following"
		>
			Following
		</a>
		<a
			href="/home?tab=global"
			role="tab"
			aria-selected={feed.tab === 'global'}
			class={feed.tab === 'global' ? 'chip-primary px-3 py-1' : 'chip px-3 py-1'}
			data-testid="tab-global"
		>
			Global
		</a>
	</div>

	{#if feed.fellBack}
		<p class="alert-info mb-4 text-sm" data-testid="fallback-notice">
			Nothing from your follows yet, so here's what's happening across PurFacted. Follow users and
			categories to personalize this feed.
		</p>
	{/if}

	{#if feed.items.length === 0}
		<p class="text-sm text-ink-muted" data-testid="empty-feed">No activity to show yet.</p>
	{:else}
		<ul class="space-y-2" data-testid="home-feed">
			{#each feed.items as item (item.id)}
				<li class="card px-4 py-3 text-sm" data-testid="home-feed-item">
					<p class="text-ink-muted">
						{#if item.actorUsername}
							<a href="/users/{item.actorUsername}" class="font-medium text-ink hover:underline">
								{item.actorUsername}
							</a>
						{:else}
							<span class="font-medium text-ink">A claim</span>
						{/if}
						<span>{item.summary}</span>
						{#if item.categoryName && item.categorySlug}
							<span class="text-ink-faint">
								in
								<a href="/categories/{item.categorySlug}" class="hover:underline">
									{item.categoryName}
								</a>
							</span>
						{/if}
					</p>
					{#if item.factId && item.factTitle}
						<a
							href="/facts/{item.factId}"
							class="mt-1 block font-serif leading-snug font-semibold text-ink hover:text-primary hover:underline"
						>
							{item.factTitle}
						</a>
					{/if}
					<p class="mt-1 text-xs text-ink-faint">{timeAgo(item.createdAt)}</p>
				</li>
			{/each}
		</ul>
	{/if}
</div>
