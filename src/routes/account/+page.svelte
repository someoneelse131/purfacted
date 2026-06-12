<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	function feedback(section: string): { saved?: boolean; error?: string } | null {
		return form?.section === section ? form : null;
	}
</script>

<svelte:head><title>Account - PurFacted</title></svelte:head>

{#snippet notice(section: string)}
	{@const fb = feedback(section)}
	{#if fb?.saved}
		<p class="mb-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-700" role="status">
			{section === 'email'
				? 'Confirmation mail sent to the new address.'
				: section === 'password'
					? 'Password changed. Other devices were signed out.'
					: 'Saved.'}
		</p>
	{/if}
	{#if fb?.error}
		<p class="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
			{fb.error}
		</p>
	{/if}
{/snippet}

<div class="mx-auto max-w-md space-y-10">
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
		<h2 class="mb-3 text-lg font-semibold text-slate-900">Profile</h2>
		{@render notice('profile')}
		<form method="POST" action="?/updateProfile" class="space-y-4">
			<div>
				<label for="bio" class="mb-1 block text-sm font-medium text-slate-700">Bio</label>
				<textarea
					id="bio"
					name="bio"
					rows="3"
					maxlength="500"
					class="w-full rounded-md border-slate-300">{data.user?.bio ?? ''}</textarea
				>
			</div>
			<div>
				<label for="avatarUrl" class="mb-1 block text-sm font-medium text-slate-700">
					Avatar URL (optional)
				</label>
				<input
					id="avatarUrl"
					name="avatarUrl"
					type="url"
					value={data.user?.avatarUrl ?? ''}
					class="w-full rounded-md border-slate-300"
				/>
			</div>
			<button
				type="submit"
				class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
			>
				Save profile
			</button>
		</form>
	</section>

	<section>
		<h2 class="mb-3 text-lg font-semibold text-slate-900">Email</h2>
		{@render notice('email')}
		{#if data.user?.pendingEmail}
			<p class="mb-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
				Pending change to <span class="font-medium">{data.user.pendingEmail}</span> - confirm via the
				mail we sent there.
			</p>
		{/if}
		<form method="POST" action="?/changeEmail" class="space-y-4">
			<div>
				<label for="newEmail" class="mb-1 block text-sm font-medium text-slate-700">
					New email address
				</label>
				<input
					id="newEmail"
					name="newEmail"
					type="email"
					required
					class="w-full rounded-md border-slate-300"
				/>
				<p class="mt-1 text-xs text-slate-500">
					The change only applies after you confirm it from the new inbox.
				</p>
			</div>
			<div>
				<label for="emailCurrentPassword" class="mb-1 block text-sm font-medium text-slate-700">
					Your password
				</label>
				<input
					id="emailCurrentPassword"
					name="currentPassword"
					type="password"
					required
					class="w-full rounded-md border-slate-300"
				/>
			</div>
			<button
				type="submit"
				class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
			>
				Request change
			</button>
		</form>
	</section>

	<section>
		<h2 class="mb-3 text-lg font-semibold text-slate-900">Settings</h2>
		{@render notice('settings')}
		<form method="POST" action="?/updateSettings" class="space-y-3">
			<label class="flex items-center gap-2 text-sm text-slate-700">
				<input
					type="checkbox"
					name="hideStats"
					checked={data.user?.hideStats}
					class="rounded border-slate-300"
				/>
				Hide my stats and activity on the public profile
			</label>
			<label class="flex items-center gap-2 text-sm text-slate-700">
				<input
					type="checkbox"
					name="notifyEmail"
					checked={data.user?.notifyEmail}
					class="rounded border-slate-300"
				/>
				Email notifications
			</label>
			<button
				type="submit"
				class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
			>
				Save settings
			</button>
		</form>
	</section>

	<section>
		<h2 class="mb-3 text-lg font-semibold text-slate-900">Change password</h2>
		{@render notice('password')}
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

	<section class="rounded-md border border-red-200 p-4">
		<h2 class="mb-3 text-lg font-semibold text-red-700">Delete account</h2>
		{@render notice('delete')}
		<form method="POST" action="?/deleteAccount" class="space-y-4">
			<div>
				<label for="deletePassword" class="mb-1 block text-sm font-medium text-slate-700">
					Confirm with your password
				</label>
				<input
					id="deletePassword"
					name="password"
					type="password"
					required
					class="w-full rounded-md border-slate-300"
				/>
			</div>
			<button
				type="submit"
				class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
			>
				Delete my account
			</button>
		</form>
	</section>
</div>
