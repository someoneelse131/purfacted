<script lang="ts">
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head><title>Reset password - PurFacted</title></svelte:head>

<div class="mx-auto max-w-md">
	<h1 class="mb-6 text-2xl font-bold text-ink">Choose a new password</h1>

	{#if form?.error}
		<p class="alert-error mb-4" role="alert">
			{form.error}
		</p>
	{/if}

	<form method="POST" class="space-y-4">
		<div>
			<label for="password" class="field-label">New password</label>
			<input id="password" name="password" type="password" required minlength="10" class="input" />
		</div>
		<div>
			<label for="confirmPassword" class="field-label">Confirm new password</label>
			<input
				id="confirmPassword"
				name="confirmPassword"
				type="password"
				required
				minlength="10"
				class="input"
			/>
		</div>
		<button type="submit" class="btn btn-primary w-full">Set password</button>
	</form>
</div>
