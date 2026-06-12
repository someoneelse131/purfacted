<script lang="ts">
	interface SourceView {
		id: string;
		url: string;
		title: string;
		type: string;
		credibility: number;
		addedBy: string;
		score: number;
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

<article class="rounded-md border border-slate-200 bg-white p-3" data-testid="source-card">
	<div class="mb-1 flex items-start justify-between gap-2">
		<a
			href={source.url}
			target="_blank"
			rel="noopener noreferrer nofollow"
			class="text-sm font-medium text-slate-900 hover:underline"
		>
			{source.title}
		</a>
		<span
			class="rounded-full bg-slate-100 px-2 py-0.5 text-xs whitespace-nowrap text-slate-600"
			title="Credibility {source.credibility}"
		>
			{typeLabels[source.type] ?? source.type} · C{source.credibility}
		</span>
	</div>
	<p class="mb-2 text-xs text-slate-500">added by {source.addedBy}</p>
	<div class="flex items-center justify-between">
		<span class="text-xs font-medium text-slate-700" data-testid="source-score">
			Score: {Math.round(source.score * 100) / 100}
		</span>
		{#if canVote}
			<span class="flex items-center gap-1">
				<form method="POST" action="?/vote">
					<input type="hidden" name="sourceId" value={source.id} />
					<input type="hidden" name="value" value="1" />
					<button
						type="submit"
						aria-label="credible and supports its side"
						class="rounded px-2 py-1 text-sm {source.myVote === 1
							? 'bg-green-100 text-green-700'
							: 'text-slate-500 hover:bg-slate-100'}"
					>
						▲
					</button>
				</form>
				<form method="POST" action="?/vote">
					<input type="hidden" name="sourceId" value={source.id} />
					<input type="hidden" name="value" value="-1" />
					<button
						type="submit"
						aria-label="not credible or off-topic"
						class="rounded px-2 py-1 text-sm {source.myVote === -1
							? 'bg-red-100 text-red-700'
							: 'text-slate-500 hover:bg-slate-100'}"
					>
						▼
					</button>
				</form>
				<form method="POST" action="?/flag">
					<input type="hidden" name="sourceId" value={source.id} />
					<input type="hidden" name="reason" value="spam/misleading" />
					<button
						type="submit"
						aria-label="flag as spam or misleading"
						title="Flag as spam/misleading"
						class="rounded px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600"
					>
						⚑
					</button>
				</form>
			</span>
		{/if}
	</div>
</article>
