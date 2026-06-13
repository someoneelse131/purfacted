<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head><title>{page.status} - PurFacted</title></svelte:head>

<div class="mx-auto max-w-md py-16 text-center">
	<p class="text-sm font-semibold tracking-wide text-ink-faint tabular-nums">{page.status}</p>
	<h1 class="mt-2 text-2xl font-bold text-ink">
		{page.error?.message ?? 'Something went wrong'}
	</h1>
	<p class="mt-6">
		<a href="/" class="btn btn-secondary">Back to the start page</a>
	</p>
</div>
