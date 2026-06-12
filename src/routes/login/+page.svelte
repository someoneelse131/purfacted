<script lang="ts">
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head><title>Log in - PurFacted</title></svelte:head>

<div class="mx-auto max-w-md">
	<h1 class="mb-6 text-2xl font-bold text-slate-900">Log in</h1>

	{#if form?.error}
		<p class="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
			{form.error}
		</p>
	{/if}

	<form method="POST" class="space-y-4">
		<div>
			<label for="identifier" class="mb-1 block text-sm font-medium text-slate-700">
				Email or username
			</label>
			<input
				id="identifier"
				name="identifier"
				type="text"
				required
				value={form?.identifier ?? ''}
				class="w-full rounded-md border-slate-300"
			/>
		</div>
		<div>
			<label for="password" class="mb-1 block text-sm font-medium text-slate-700">Password</label>
			<input
				id="password"
				name="password"
				type="password"
				required
				class="w-full rounded-md border-slate-300"
			/>
		</div>
		<label class="flex items-center gap-2 text-sm text-slate-700">
			<input type="checkbox" name="rememberMe" class="rounded border-slate-300" />
			Remember me
		</label>
		<button
			type="submit"
			class="w-full rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700"
		>
			Log in
		</button>
	</form>

	<p class="mt-4 text-sm text-slate-600">
		<a href="/forgot-password" class="underline">Forgot password?</a> ·
		<a href="/register" class="underline">Create an account</a>
	</p>
</div>
