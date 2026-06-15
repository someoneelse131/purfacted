<script lang="ts">
	import type { HotspotEntry } from '$lib/server/services/facts/hotspots';

	let { hotspots, heading = 'Needs your review' }: { hotspots: HotspotEntry[]; heading?: string } =
		$props();
</script>

{#if hotspots.length > 0}
	<section class="mb-8" data-testid="hotspots">
		<h2 class="mb-1 text-lg font-semibold text-ink">{heading}</h2>
		<p class="mb-3 text-sm text-ink-muted">
			Facts that need attention before they lapse, contested claims, and under-reviewed evidence.
		</p>
		<ul class="space-y-2">
			{#each hotspots as h (h.id)}
				<li class="card px-4 py-3" data-testid="hotspot-item">
					<a
						href="/facts/{h.id}"
						class="font-serif leading-snug font-semibold text-ink hover:text-primary hover:underline"
					>
						{h.title}
					</a>
					<div class="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
						{#if h.flags.freshVeto}
							<span class="chip border border-contested text-contested">Contested</span>
						{/if}
						{#if h.flags.closeToQuorum}
							<span class="chip-primary">Close to quorum</span>
						{/if}
						{#if h.flags.underReviewedSources}
							<span class="chip">
								{h.underReviewedSourceCount} source{h.underReviewedSourceCount === 1 ? '' : 's'} need
								votes
							</span>
						{/if}
						<span class="text-ink-faint">
							{h.categoryName}
							{#if h.missingReviewers > 0}
								· needs {h.missingReviewers} more reviewer{h.missingReviewers === 1 ? '' : 's'}
							{/if}
						</span>
					</div>
				</li>
			{/each}
		</ul>
	</section>
{/if}
