<script lang="ts">
	// Outline amber "contested" pill shown next to a status badge when a fact is
	// back under review under an open veto (R24). Mirrors CONTESTED_MARKER.
	import { CONTESTED_MARKER } from '$lib/status';
</script>

<span
	class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase {CONTESTED_MARKER.outlineClass}"
	title="Back under review after a veto"
	data-testid="contested-badge"
>
	<svg
		class="size-3.5"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		aria-hidden="true"
	>
		<path stroke-linecap="round" stroke-linejoin="round" d={CONTESTED_MARKER.icon} />
	</svg>
	Contested
</span>
