<script lang="ts">
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head><title>Forgot password - PurFacted</title></svelte:head>

<div class="mx-auto max-w-md">
	<h1 class="mb-6 text-2xl font-bold text-ink">Forgot your password?</h1>

	{#if form?.sent}
		<p class="alert-success" role="status">
			If an account with that email exists, a reset link is on its way.
		</p>
	{:else}
		<form method="POST" class="space-y-4">
			<div>
				<label for="email" class="field-label">Email</label>
				<input id="email" name="email" type="email" required class="input" />
			</div>
			<!-- honeypot -->
			<div class="absolute -left-[9999px]" aria-hidden="true">
				<label for="website">Website</label>
				<input id="website" name="website" type="text" tabindex="-1" autocomplete="off" />
			</div>
			<button type="submit" class="btn btn-primary w-full">Send reset link</button>
		</form>
	{/if}
</div>
