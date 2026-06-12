<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>Account - PurFacted</title></svelte:head>

<div class="mx-auto max-w-md space-y-8">
	<div>
		<h1 class="mb-2 text-2xl font-bold text-slate-900">Account</h1>
		<p class="text-sm text-slate-600">
			Signed in as <span class="font-medium">{data.user?.username}</span> ({data.user?.email})
		</p>
		{#if data.user && !data.user.emailVerifiedAt}
			<p class="mt-2 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
				Your email is not verified yet. Check your inbox - voting and posting stay disabled until
				then.
			</p>
		{/if}
	</div>

	<section>
		<h2 class="mb-3 text-lg font-semibold text-slate-900">Change password</h2>

		{#if form?.changed}
			<p class="mb-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-700" role="status">
				Password changed. Other devices were signed out.
			</p>
		{/if}
		{#if form?.error}
			<p class="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
				{form.error}
			</p>
		{/if}

		<form method="POST" action="?/changePassword" class="space-y-4">
			<div>
				<label for="currentPassword" class="mb-1 block text-sm font-medium text-slate-700">
					Current password
				</label>
				<input
					id="currentPassword"
					name="currentPassword"
					type="password"
					required
					class="w-full rounded-md border-slate-300"
				/>
			</div>
			<div>
				<label for="newPassword" class="mb-1 block text-sm font-medium text-slate-700">
					New password
				</label>
				<input
					id="newPassword"
					name="newPassword"
					type="password"
					required
					minlength="10"
					class="w-full rounded-md border-slate-300"
				/>
			</div>
			<button
				type="submit"
				class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
			>
				Change password
			</button>
		</form>
	</section>

	<section>
		<h2 class="mb-3 text-lg font-semibold text-slate-900">Sessions</h2>
		<form method="POST" action="?/logoutEverywhere">
			<button
				type="submit"
				class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
			>
				Log out everywhere
			</button>
		</form>
	</section>
</div>
