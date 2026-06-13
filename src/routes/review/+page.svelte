<script lang="ts">
	import type { PageData } from './$types';
	import QuorumProgress from '$lib/components/QuorumProgress.svelte';

	let { data }: { data: PageData } = $props();

	function pageUrl(page: number): string {
		const params: string[] = [];
		if (data.tab !== 'review') params.push(`tab=${data.tab}`);
		if (data.sort !== 'newest') params.push(`sort=${data.sort}`);
		if (data.categorySlug) params.push(`category=${encodeURIComponent(data.categorySlug)}`);
		if (page > 1) params.push(`page=${page}`);
		return params.length > 0 ? `/review?${params.join('&')}` : '/review';
	}

	function missingParts(entry: (typeof data.hub.entries)[number]): string[] {
		const parts: string[] = [];
		if (entry.missingReviewers > 0) {
			parts.push(
				`${entry.missingReviewers} more reviewer${entry.missingReviewers === 1 ? '' : 's'}`
			);
		}
		if (entry.missingWeight > 0) parts.push(`${entry.missingWeight} more vote weight`);
		if (entry.missingHours > 0) parts.push(`${entry.missingHours}h review time`);
		return parts;
	}

	function balanceLabel(balance: number | null): string {
		if (balance === null) return 'no rated evidence yet';
		const sign = balance > 0 ? '+' : '';
		return `evidence balance ${sign}${Math.round(balance * 100) / 100}`;
	}
</script>

<svelte:head><title>Review Hub - PurFacted</title></svelte:head>

<div class="mx-auto max-w-3xl">
	<h1 class="mb-2 text-2xl font-bold text-ink">Review Hub</h1>
	<p class="mb-6 text-sm text-ink-muted">
		Claims under review. Add evidence, vote on sources, help reach a verdict.
	</p>

	<div class="mb-4 flex gap-2 border-b border-line text-sm">
		<a
			href="/review"
			class="border-b-2 px-3 py-2 {data.tab === 'review'
				? 'border-primary font-medium text-primary'
				: 'border-transparent text-ink-muted hover:text-ink'}"
		>
			Under review
		</a>
		<a
			href="/review?tab=unsubstantiated"
			class="border-b-2 px-3 py-2 {data.tab === 'unsubstantiated'
				? 'border-primary font-medium text-primary'
				: 'border-transparent text-ink-muted hover:text-ink'}"
		>
			Unsubstantiated
		</a>
	</div>

	<form method="GET" class="mb-6 flex flex-wrap items-end gap-3 text-sm">
		<input type="hidden" name="tab" value={data.tab} />
		<div>
			<label for="category" class="field-label text-xs">Category</label>
			<select id="category" name="category" class="input w-auto text-sm">
				<option value="">All categories</option>
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
				<option value="oldest" selected={data.sort === 'oldest'}>Oldest</option>
				<option value="close-to-quorum" selected={data.sort === 'close-to-quorum'}>
					Close to quorum
				</option>
			</select>
		</div>
		<button type="submit" class="btn btn-secondary">Apply</button>
	</form>

	{#if data.hub.entries.length === 0}
		<p class="text-sm text-ink-muted">
			{data.tab === 'review' ? 'Nothing under review right now.' : 'No unsubstantiated facts.'}
		</p>
	{:else}
		<ul class="space-y-2">
			{#each data.hub.entries as entry (entry.id)}
				<li class="card px-4 py-3" data-testid="hub-entry">
					<a
						href="/facts/{entry.id}"
						class="font-serif text-lg leading-snug font-semibold text-ink hover:text-primary hover:underline"
					>
						{entry.title}
					</a>
					<p class="mt-1 text-xs text-ink-faint">
						{entry.categoryName} · by {entry.author} · {entry.sourceCount}
						source{entry.sourceCount === 1 ? '' : 's'} · {balanceLabel(entry.balance)}
					</p>
					{#if data.tab === 'review'}
						<div class="mt-2">
							<QuorumProgress
								progress={entry.quorumReached ? 1 : entry.quorumProgress}
								label={entry.quorumReached
									? 'Quorum reached - decision pending'
									: `Needs ${missingParts(entry).join(' · ')}`}
							/>
						</div>
					{:else}
						<p class="mt-1 text-xs text-ink-faint">
							Review expired without quorum - add new evidence to revive it.
						</p>
					{/if}
				</li>
			{/each}
		</ul>

		{#if data.hub.totalPages > 1}
			<nav class="mt-6 flex items-center justify-between text-sm" aria-label="Pagination">
				{#if data.hub.page > 1}
					<a href={pageUrl(data.hub.page - 1)} class="text-primary underline">Previous</a>
				{:else}
					<span></span>
				{/if}
				<span class="text-ink-faint">Page {data.hub.page} of {data.hub.totalPages}</span>
				{#if data.hub.page < data.hub.totalPages}
					<a href={pageUrl(data.hub.page + 1)} class="text-primary underline">Next</a>
				{:else}
					<span></span>
				{/if}
			</nav>
		{/if}
	{/if}
</div>
