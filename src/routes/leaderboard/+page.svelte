<script lang="ts">
	import type { PageData } from './$types';
	import type { LeaderboardWindow } from '$lib/server/services/leaderboard';

	let { data }: { data: PageData } = $props();

	const WINDOW_LABELS: Record<LeaderboardWindow, string> = {
		week: 'This week',
		month: 'This month',
		all: 'All time'
	};

	function windowHref(w: LeaderboardWindow): string {
		const params = new URLSearchParams();
		params.set('window', w);
		if (data.categorySlug) params.set('category', data.categorySlug);
		return `?${params.toString()}`;
	}

	const scopeLabel = $derived(
		data.categorySlug
			? (data.categories.find((c) => c.slug === data.categorySlug)?.name ?? 'Category')
			: 'All categories'
	);
</script>

<svelte:head><title>Leaderboard - PurFacted</title></svelte:head>

<div class="mx-auto max-w-3xl">
	<h1 class="mb-2 text-2xl font-bold text-ink">Leaderboard</h1>
	<p class="mb-6 text-sm text-ink-muted">
		Top contributors by reputation earned through verification work.
	</p>

	<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
		<nav class="flex gap-1" aria-label="Time window">
			{#each data.windows as w (w)}
				<a
					href={windowHref(w)}
					data-window={w}
					class={w === data.window ? 'chip-primary' : 'chip'}
					aria-current={w === data.window ? 'page' : undefined}
				>
					{WINDOW_LABELS[w]}
				</a>
			{/each}
		</nav>

		<form method="GET" class="flex items-center gap-2">
			<input type="hidden" name="window" value={data.window} />
			<label for="category" class="sr-only">Category</label>
			<select
				id="category"
				name="category"
				class="input w-auto text-sm"
				onchange={(e) => e.currentTarget.form?.requestSubmit()}
			>
				<option value="">All categories</option>
				{#each data.categories as c (c.id)}
					<option value={c.slug} selected={c.slug === data.categorySlug}>{c.name}</option>
				{/each}
			</select>
		</form>
	</div>

	<h2 class="mb-3 text-sm font-medium text-ink-muted">
		{WINDOW_LABELS[data.window]} · {scopeLabel}
	</h2>

	{#if data.entries.length === 0}
		<p class="card p-6 text-center text-ink-muted" data-testid="leaderboard-empty">
			No reputation has been earned in this window yet.
		</p>
	{:else}
		<ol class="card divide-y divide-line" data-testid="leaderboard">
			{#each data.entries as entry (entry.userId)}
				<li class="flex items-center gap-4 px-4 py-3">
					<span class="w-8 text-right font-semibold text-ink-faint tabular-nums">{entry.rank}</span>
					<a
						href="/users/{entry.username}"
						class="flex-1 font-medium text-ink hover:text-primary hover:underline"
					>
						{entry.username}
					</a>
					<span class="text-sm text-ink-faint">{entry.role.toLowerCase()}</span>
					<span class="w-20 text-right font-semibold text-primary tabular-nums">
						+{entry.gained}
					</span>
				</li>
			{/each}
		</ol>
	{/if}
</div>
