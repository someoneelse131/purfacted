<script lang="ts">
	import type { PageData } from './$types';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import ContestedBadge from '$lib/components/ContestedBadge.svelte';

	let { data }: { data: PageData } = $props();

	function pageUrl(page: number): string {
		const params: string[] = [];
		if (data.sort !== 'newest') params.push(`sort=${data.sort}`);
		if (data.status) params.push(`status=${data.status}`);
		if (data.categorySlug) params.push(`category=${encodeURIComponent(data.categorySlug)}`);
		if (data.query) params.push(`q=${encodeURIComponent(data.query)}`);
		if (page > 1) params.push(`page=${page}`);
		return params.length > 0 ? `/facts?${params.join('&')}` : '/facts';
	}
</script>

<svelte:head><title>Facts - PurFacted</title></svelte:head>

<div class="mx-auto max-w-3xl">
	<h1 class="mb-2 text-2xl font-bold text-ink">Facts</h1>
	<p class="mb-6 text-sm text-ink-muted">
		Community-decided claims. Anything still being weighed lives in the
		<a href="/review" class="text-primary underline">Review Hub</a>.
	</p>

	<form method="GET" class="mb-6 flex flex-wrap items-end gap-3 text-sm">
		<div class="grow">
			<label for="q" class="field-label text-xs">Search</label>
			<input
				id="q"
				name="q"
				type="search"
				value={data.query}
				placeholder="Search claims..."
				class="input text-sm"
			/>
		</div>
		<div>
			<label for="status" class="field-label text-xs">Status</label>
			<select id="status" name="status" class="input w-auto text-sm">
				<option value="">All</option>
				<option value="VERIFIED" selected={data.status === 'VERIFIED'}>Verified</option>
				<option value="DISPUTED" selected={data.status === 'DISPUTED'}>Disputed</option>
				<option value="REFUTED" selected={data.status === 'REFUTED'}>Refuted</option>
			</select>
		</div>
		<div>
			<label for="category" class="field-label text-xs">Category</label>
			<select id="category" name="category" class="input w-auto text-sm">
				<option value="">All</option>
				{#each data.tree as top (top.id)}
					<option value={top.slug} selected={data.categorySlug === top.slug}>{top.name}</option>
					{#each top.children as child (child.id)}
						<option value={child.slug} selected={data.categorySlug === child.slug}>
							&nbsp;&nbsp;{child.name}
						</option>
					{/each}
				{/each}
			</select>
		</div>
		<div>
			<label for="sort" class="field-label text-xs">Sort</label>
			<select id="sort" name="sort" class="input w-auto text-sm">
				<option value="newest" selected={data.sort === 'newest'}>Newest</option>
				<option value="most-reviewed" selected={data.sort === 'most-reviewed'}>
					Most reviewed
				</option>
				<option value="controversial" selected={data.sort === 'controversial'}>
					Controversial
				</option>
			</select>
		</div>
		<button type="submit" class="btn btn-secondary">Apply</button>
	</form>

	{#if data.feed.entries.length === 0}
		<p class="text-sm text-ink-muted">No decided facts match.</p>
	{:else}
		<ul class="space-y-2">
			{#each data.feed.entries as entry (entry.id)}
				<li class="card flex items-center justify-between gap-4 px-4 py-3" data-testid="feed-entry">
					<div>
						<a
							href="/facts/{entry.id}"
							class="font-serif text-lg leading-snug font-semibold text-ink hover:text-primary hover:underline"
						>
							{entry.title}
						</a>
						<p class="mt-1 text-xs text-ink-faint">
							{entry.categoryName} · by {entry.author} · {entry.reviewCount}
							review vote{entry.reviewCount === 1 ? '' : 's'}
						</p>
					</div>
					<span class="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
						<StatusBadge status={entry.status} />
						{#if entry.contested}
							<ContestedBadge />
						{/if}
					</span>
				</li>
			{/each}
		</ul>

		{#if data.feed.totalPages > 1}
			<nav class="mt-6 flex items-center justify-between text-sm" aria-label="Pagination">
				{#if data.feed.page > 1}
					<a href={pageUrl(data.feed.page - 1)} class="text-primary underline">Previous</a>
				{:else}
					<span></span>
				{/if}
				<span class="text-ink-faint">Page {data.feed.page} of {data.feed.totalPages}</span>
				{#if data.feed.page < data.feed.totalPages}
					<a href={pageUrl(data.feed.page + 1)} class="text-primary underline">Next</a>
				{:else}
					<span></span>
				{/if}
			</nav>
		{/if}
	{/if}
</div>
