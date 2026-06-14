<script lang="ts">
	interface SourceView {
		id: string;
		url: string;
		title: string;
		type: string;
		credibility: number;
		// justification of how the source supports its side (R26); null for
		// sources created before R26 (grandfathered)
		quote: string | null;
		// archive.org snapshot URL (R26); null until the archive job completes
		archiveUrl: string | null;
		addedBy: string;
		// null while the fact is under review (blind review, R24)
		score: number | null;
		voteCount: number;
		myVote: number;
	}

	let { source, canVote }: { source: SourceView; canVote: boolean } = $props();

	const typeLabels: Record<string, string> = {
		PEER_REVIEWED: 'Peer-reviewed',
		OFFICIAL: 'Official',
		NEWS: 'News',
		COMPANY: 'Company',
		BLOG: 'Blog',
		OTHER: 'Other'
	};
</script>

<article class="card p-3" data-testid="source-card">
	<div class="mb-1 flex items-start justify-between gap-2">
		<a
			href={source.url}
			target="_blank"
			rel="noopener noreferrer nofollow"
			class="text-sm font-medium text-ink hover:text-primary hover:underline"
		>
			{source.title}
		</a>
		<span
			class="chip text-[11px] font-medium tracking-wide uppercase"
			title="Credibility {source.credibility}"
		>
			{typeLabels[source.type] ?? source.type} · C{source.credibility}
		</span>
	</div>
	{#if source.quote}
		<blockquote
			class="mb-2 border-l-2 border-line pl-2 text-xs text-ink-muted italic"
			data-testid="source-quote"
		>
			{source.quote}
		</blockquote>
	{/if}
	<p class="mb-2 flex items-center gap-2 text-xs text-ink-faint">
		<span>added by {source.addedBy}</span>
		{#if source.archiveUrl}
			<span aria-hidden="true">·</span>
			<a
				href={source.archiveUrl}
				target="_blank"
				rel="noopener noreferrer nofollow"
				class="text-ink-faint underline hover:text-primary"
				data-testid="source-archive-link"
			>
				archived copy
			</a>
		{/if}
	</p>
	<div class="flex items-center justify-between">
		{#if source.score === null}
			<span class="text-xs text-ink-faint italic" data-testid="source-score-hidden">
				{source.voteCount} vote{source.voteCount === 1 ? '' : 's'} · score hidden during review
			</span>
		{:else}
			<span class="text-xs font-medium text-ink-muted tabular-nums" data-testid="source-score">
				Score: {Math.round(source.score * 100) / 100}
			</span>
		{/if}
		{#if canVote}
			<span class="flex items-center gap-1">
				<form method="POST" action="?/vote">
					<input type="hidden" name="sourceId" value={source.id} />
					<input type="hidden" name="value" value="1" />
					<button
						type="submit"
						aria-label="credible and supports its side"
						aria-pressed={source.myVote === 1}
						class="flex h-11 w-11 items-center justify-center rounded-lg {source.myVote === 1
							? 'bg-primary-soft text-primary'
							: 'text-ink-faint hover:bg-primary-soft hover:text-primary'}"
					>
						<svg
							class="size-5"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							aria-hidden="true"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
						</svg>
					</button>
				</form>
				<form method="POST" action="?/vote">
					<input type="hidden" name="sourceId" value={source.id} />
					<input type="hidden" name="value" value="-1" />
					<button
						type="submit"
						aria-label="not credible or off-topic"
						aria-pressed={source.myVote === -1}
						class="flex h-11 w-11 items-center justify-center rounded-lg {source.myVote === -1
							? 'bg-primary-soft text-primary'
							: 'text-ink-faint hover:bg-primary-soft hover:text-primary'}"
					>
						<svg
							class="size-5"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							aria-hidden="true"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
						</svg>
					</button>
				</form>
				<form method="POST" action="?/flag">
					<input type="hidden" name="sourceId" value={source.id} />
					<input type="hidden" name="reason" value="spam/misleading" />
					<button
						type="submit"
						aria-label="flag as spam or misleading"
						title="Flag as spam/misleading"
						class="flex h-11 w-11 items-center justify-center rounded-lg text-ink-faint hover:bg-status-refuted-soft hover:text-status-refuted-strong"
					>
						<svg
							class="size-5"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							aria-hidden="true"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 21h18"
							/>
						</svg>
					</button>
				</form>
			</span>
		{/if}
	</div>
</article>
