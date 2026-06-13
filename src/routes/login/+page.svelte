<script lang="ts">
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head><title>Log in - PurFacted</title></svelte:head>

<div class="mx-auto max-w-md">
	<h1 class="mb-6 text-2xl font-bold text-ink">Log in</h1>

	{#if form?.error}
		<p class="alert-error mb-4" role="alert">
			{form.error}
		</p>
	{/if}

	<form method="POST" class="space-y-4">
		<div>
			<label for="identifier" class="field-label">Email or username</label>
			<input
				id="identifier"
				name="identifier"
				type="text"
				required
				value={form?.identifier ?? ''}
				class="input"
			/>
		</div>
		<div>
			<label for="password" class="field-label">Password</label>
			<input id="password" name="password" type="password" required class="input" />
		</div>
		<label class="flex items-center gap-2 text-sm text-ink-muted">
			<input
				type="checkbox"
				name="rememberMe"
				class="rounded border-line text-primary focus:ring-0"
			/>
			Remember me
		</label>
		<!-- honeypot -->
		<div class="absolute -left-[9999px]" aria-hidden="true">
			<label for="website">Website</label>
			<input id="website" name="website" type="text" tabindex="-1" autocomplete="off" />
		</div>
		<button type="submit" class="btn btn-primary w-full">Log in</button>
	</form>

	<p class="mt-4 text-sm text-ink-muted">
		<a href="/forgot-password" class="text-primary underline">Forgot password?</a> ·
		<a href="/register" class="text-primary underline">Create an account</a>
	</p>
</div>
