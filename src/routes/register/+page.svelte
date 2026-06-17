<script lang="ts">
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head><title>Sign up - PurFacted</title></svelte:head>

<div class="mx-auto max-w-md">
	<h1 class="mb-6 text-2xl font-bold text-ink">Create your account</h1>

	{#if form?.error}
		<p class="alert-error mb-4" role="alert">
			{form.error}
		</p>
	{/if}

	<form method="POST" class="space-y-4">
		<div>
			<label for="username" class="field-label">Username</label>
			<input
				id="username"
				name="username"
				type="text"
				required
				minlength="3"
				maxlength="30"
				value={form?.username ?? ''}
				class="input"
			/>
		</div>
		<div>
			<label for="email" class="field-label">Email</label>
			<input
				id="email"
				name="email"
				type="email"
				required
				value={form?.email ?? ''}
				class="input"
			/>
		</div>
		<div>
			<label for="password" class="field-label">Password</label>
			<input id="password" name="password" type="password" required minlength="10" class="input" />
			<p class="field-help">At least 10 characters, not easily guessable.</p>
		</div>
		<div>
			<label for="confirmPassword" class="field-label">Confirm password</label>
			<input
				id="confirmPassword"
				name="confirmPassword"
				type="password"
				required
				minlength="10"
				class="input"
			/>
		</div>
		<!-- honeypot: humans never see or fill this -->
		<div class="absolute -left-[9999px]" aria-hidden="true">
			<label for="website">Website</label>
			<input id="website" name="website" type="text" tabindex="-1" autocomplete="off" />
		</div>
		<button type="submit" class="btn btn-primary w-full">Sign up</button>
	</form>

	<p class="mt-4 text-sm text-ink-muted">
		Already have an account? <a href="/login" class="text-primary underline">Log in</a>
	</p>
</div>
