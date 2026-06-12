<script lang="ts">
	let { status }: { status: string } = $props();

	const styles: Record<string, string> = {
		UNDER_REVIEW: 'bg-amber-100 text-amber-800',
		VERIFIED: 'bg-green-100 text-green-800',
		DISPUTED: 'bg-orange-100 text-orange-800',
		REFUTED: 'bg-red-100 text-red-800',
		UNSUBSTANTIATED: 'bg-slate-200 text-slate-600'
	};

	const labels: Record<string, string> = {
		UNDER_REVIEW: 'Under review',
		VERIFIED: 'Verified',
		DISPUTED: 'Disputed',
		REFUTED: 'Refuted',
		UNSUBSTANTIATED: 'Unsubstantiated'
	};
</script>

<span
	class="rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap {styles[status] ??
		'bg-slate-200 text-slate-600'}"
>
	{labels[status] ?? status}
</span>
