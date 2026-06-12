<script lang="ts">
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head><title>Sign up - PurFacted</title></svelte:head>

<div class="mx-auto max-w-md">
	<h1 class="mb-6 text-2xl font-bold text-slate-900">Create your account</h1>

	{#if form?.error}
		<p class="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
			{form.error}
		</p>
	{/if}

	<form method="POST" class="space-y-4">
		<div>
			<label for="username" class="mb-1 block text-sm font-medium text-slate-700">Username</label>
			<input
				id="username"
				name="username"
				type="text"
				required
				minlength="3"
				maxlength="30"
				value={form?.username ?? ''}
				class="w-full rounded-md border-slate-300"
			/>
		</div>
		<div>
			<label for="email" class="mb-1 block text-sm font-medium text-slate-700">Email</label>
			<input
				id="email"
				name="email"
				type="email"
				required
				value={form?.email ?? ''}
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
				minlength="10"
				class="w-full rounded-md border-slate-300"
			/>
			<p class="mt-1 text-xs text-slate-500">At least 10 characters, not easily guessable.</p>
		</div>
		<!-- honeypot: humans never see or fill this -->
		<div class="absolute -left-[9999px]" aria-hidden="true">
			<label for="website">Website</label>
			<input id="website" name="website" type="text" tabindex="-1" autocomplete="off" />
		</div>
		<button
			type="submit"
			class="w-full rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700"
		>
			Sign up
		</button>
	</form>

	<p class="mt-4 text-sm text-slate-600">
		Already have an account? <a href="/login" class="underline">Log in</a>
	</p>
</div>
