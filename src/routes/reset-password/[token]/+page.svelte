<script lang="ts">
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head><title>Reset password - PurFacted</title></svelte:head>

<div class="mx-auto max-w-md">
	<h1 class="mb-6 text-2xl font-bold text-slate-900">Choose a new password</h1>

	{#if form?.error}
		<p class="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
			{form.error}
		</p>
	{/if}

	<form method="POST" class="space-y-4">
		<div>
			<label for="password" class="mb-1 block text-sm font-medium text-slate-700">
				New password
			</label>
			<input
				id="password"
				name="password"
				type="password"
				required
				minlength="10"
				class="w-full rounded-md border-slate-300"
			/>
		</div>
		<button
			type="submit"
			class="w-full rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700"
		>
			Set password
		</button>
	</form>
</div>
