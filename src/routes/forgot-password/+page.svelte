<script lang="ts">
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head><title>Forgot password - PurFacted</title></svelte:head>

<div class="mx-auto max-w-md">
	<h1 class="mb-6 text-2xl font-bold text-slate-900">Forgot your password?</h1>

	{#if form?.sent}
		<p class="rounded-md bg-green-50 px-4 py-3 text-sm text-green-700" role="status">
			If an account with that email exists, a reset link is on its way.
		</p>
	{:else}
		<form method="POST" class="space-y-4">
			<div>
				<label for="email" class="mb-1 block text-sm font-medium text-slate-700">Email</label>
				<input
					id="email"
					name="email"
					type="email"
					required
					class="w-full rounded-md border-slate-300"
				/>
			</div>
			<!-- honeypot -->
			<div class="absolute -left-[9999px]" aria-hidden="true">
				<label for="website">Website</label>
				<input id="website" name="website" type="text" tabindex="-1" autocomplete="off" />
			</div>
			<button
				type="submit"
				class="w-full rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700"
			>
				Send reset link
			</button>
		</form>
	{/if}
</div>
