<script lang="ts">
	/**
	 * Thin quorum progress bar (primary fill on line track) + a text line like
	 * "Needs 3 more reviewers". Deliberately never shows the balance direction
	 * (review stays blind); it only communicates how far quorum is.
	 */
	let { progress, label }: { progress: number; label: string } = $props();

	const percent = $derived(Math.round(Math.min(1, Math.max(0, progress)) * 100));
</script>

<div>
	<div
		class="h-1 w-full overflow-hidden rounded-full bg-line"
		role="progressbar"
		aria-label="Quorum progress"
		aria-valuemin="0"
		aria-valuemax="100"
		aria-valuenow={percent}
	>
		<div class="h-full rounded-full bg-primary" style="width: {percent}%"></div>
	</div>
	<p class="mt-1 text-xs text-ink-muted">{label}</p>
</div>
