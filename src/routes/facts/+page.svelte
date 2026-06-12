<script lang="ts">
	import type { PageData } from './$types';
	import FactStatusBadge from '$lib/components/FactStatusBadge.svelte';

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
	<h1 class="mb-2 text-2xl font-bold text-slate-900">Facts</h1>
	<p class="mb-6 text-sm text-slate-600">
		Community-decided claims. Anything still being weighed lives in the
		<a href="/review" class="underline">Review Hub</a>.
	</p>

	<form method="GET" class="mb-6 flex flex-wrap items-end gap-3 text-sm">
		<div class="grow">
			<label for="q" class="mb-1 block text-xs font-medium text-slate-600">Search</label>
			<input
				id="q"
				name="q"
				type="search"
				value={data.query}
				placeholder="Search claims..."
				class="w-full rounded-md border-slate-300 text-sm"
			/>
		</div>
		<div>
			<label for="status" class="mb-1 block text-xs font-medium text-slate-600">Status</label>
			<select id="status" name="status" class="rounded-md border-slate-300 text-sm">
				<option value="">All</option>
				<option value="VERIFIED" selected={data.status === 'VERIFIED'}>Verified</option>
				<option value="DISPUTED" selected={data.status === 'DISPUTED'}>Disputed</option>
				<option value="REFUTED" selected={data.status === 'REFUTED'}>Refuted</option>
			</select>
		</div>
		<div>
			<label for="category" class="mb-1 block text-xs font-medium text-slate-600">Category</label>
			<select id="category" name="category" class="rounded-md border-slate-300 text-sm">
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
			<label for="sort" class="mb-1 block text-xs font-medium text-slate-600">Sort</label>
			<select id="sort" name="sort" class="rounded-md border-slate-300 text-sm">
				<option value="newest" selected={data.sort === 'newest'}>Newest</option>
				<option value="most-reviewed" selected={data.sort === 'most-reviewed'}>
					Most reviewed
				</option>
				<option value="controversial" selected={data.sort === 'controversial'}>
					Controversial
				</option>
			</select>
		</div>
		<button
			type="submit"
			class="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
		>
			Apply
		</button>
	</form>

	{#if data.feed.entries.length === 0}
		<p class="text-sm text-slate-500">No decided facts match.</p>
	{:else}
		<ul class="space-y-2">
			{#each data.feed.entries as entry (entry.id)}
				<li
					class="flex items-center justify-between gap-4 rounded-md border border-slate-200 bg-white px-4 py-3"
					data-testid="feed-entry"
				>
					<div>
						<a href="/facts/{entry.id}" class="font-medium text-slate-900 hover:underline">
							{entry.title}
						</a>
						<p class="mt-1 text-xs text-slate-500">
							{entry.categoryName} · by {entry.author} · {entry.reviewCount}
							review vote{entry.reviewCount === 1 ? '' : 's'}
						</p>
					</div>
					<FactStatusBadge status={entry.status} />
				</li>
			{/each}
		</ul>

		{#if data.feed.totalPages > 1}
			<nav class="mt-6 flex items-center justify-between text-sm" aria-label="Pagination">
				{#if data.feed.page > 1}
					<a href={pageUrl(data.feed.page - 1)} class="text-slate-700 underline">Previous</a>
				{:else}
					<span></span>
				{/if}
				<span class="text-slate-500">Page {data.feed.page} of {data.feed.totalPages}</span>
				{#if data.feed.page < data.feed.totalPages}
					<a href={pageUrl(data.feed.page + 1)} class="text-slate-700 underline">Next</a>
				{:else}
					<span></span>
				{/if}
			</nav>
		{/if}
	{/if}
</div>
