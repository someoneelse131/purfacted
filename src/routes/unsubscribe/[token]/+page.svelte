<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Unsubscribe - PurFacted</title></svelte:head>

<div class="mx-auto max-w-md text-center">
	{#if data.ok}
		<h1 class="mb-4 text-2xl font-bold text-slate-900">You are unsubscribed</h1>
		<p class="text-slate-600">
			Email notifications are off. You can re-enable them anytime in your
			<a href="/account" class="underline">account settings</a>.
		</p>
	{:else}
		<h1 class="mb-4 text-2xl font-bold text-slate-900">Invalid link</h1>
		<p class="text-slate-600">This unsubscribe link is not valid.</p>
	{/if}
</div>
