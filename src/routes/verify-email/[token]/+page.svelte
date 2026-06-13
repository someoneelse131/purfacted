<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Email verification - PurFacted</title></svelte:head>

<div class="mx-auto max-w-md text-center">
	{#if data.verified}
		<h1 class="mb-4 text-2xl font-bold text-ink">Email verified</h1>
		<p class="mb-6 text-ink-muted">
			Welcome{data.username ? `, ${data.username}` : ''}! Your account is active.
		</p>
		<a href="/login" class="btn btn-primary">Log in</a>
	{:else}
		<h1 class="mb-4 text-2xl font-bold text-ink">Link invalid or expired</h1>
		<p class="text-ink-muted">
			This verification link is no longer valid. Register again or request a new link by logging in.
		</p>
	{/if}
</div>
