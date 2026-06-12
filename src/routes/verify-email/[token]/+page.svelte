<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Email verification - PurFacted</title></svelte:head>

<div class="mx-auto max-w-md text-center">
	{#if data.verified}
		<h1 class="mb-4 text-2xl font-bold text-slate-900">Email verified</h1>
		<p class="mb-6 text-slate-600">
			Welcome{data.username ? `, ${data.username}` : ''}! Your account is active.
		</p>
		<a
			href="/login"
			class="inline-block rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700"
		>
			Log in
		</a>
	{:else}
		<h1 class="mb-4 text-2xl font-bold text-slate-900">Link invalid or expired</h1>
		<p class="text-slate-600">
			This verification link is no longer valid. Register again or request a new link by logging in.
		</p>
	{/if}
</div>
