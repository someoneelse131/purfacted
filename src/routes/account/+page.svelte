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
		<p class="alert-success mb-4" role="status">
			{section === 'email'
				? 'Confirmation mail sent to the new address.'
				: section === 'password'
					? 'Password changed. Other devices were signed out.'
					: 'Saved.'}
		</p>
	{/if}
	{#if fb?.error}
		<p class="alert-error mb-4" role="alert">
			{fb.error}
		</p>
	{/if}
{/snippet}

<div class="mx-auto max-w-md space-y-10">
	<div>
		<h1 class="mb-2 text-2xl font-bold text-ink">Account</h1>
		<p class="text-sm text-ink-muted">
			Signed in as <span class="font-medium">{data.user?.username}</span> ({data.user?.email})
		</p>
		{#if data.user && !data.user.emailVerifiedAt}
			<p class="alert-warning mt-2">
				Your email is not verified yet. Check your inbox - voting and posting stay disabled until
				then.
			</p>
		{/if}
	</div>

	<section>
		<h2 class="mb-3 text-lg font-semibold text-ink">Profile</h2>
		{@render notice('profile')}
		<form method="POST" action="?/updateProfile" class="space-y-4">
			<div>
				<label for="bio" class="field-label">Bio</label>
				<textarea id="bio" name="bio" rows="3" maxlength="500" class="input"
					>{data.user?.bio ?? ''}</textarea
				>
			</div>
			<div>
				<label for="avatarUrl" class="field-label">Avatar URL (optional)</label>
				<input
					id="avatarUrl"
					name="avatarUrl"
					type="url"
					value={data.user?.avatarUrl ?? ''}
					class="input"
				/>
			</div>
			<button type="submit" class="btn btn-primary">Save profile</button>
		</form>
	</section>

	<section>
		<h2 class="mb-3 text-lg font-semibold text-ink">Email</h2>
		{@render notice('email')}
		{#if data.user?.pendingEmail}
			<p class="alert-warning mb-4">
				Pending change to <span class="font-medium">{data.user.pendingEmail}</span> - confirm via the
				mail we sent there.
			</p>
		{/if}
		<form method="POST" action="?/changeEmail" class="space-y-4">
			<div>
				<label for="newEmail" class="field-label">New email address</label>
				<input id="newEmail" name="newEmail" type="email" required class="input" />
				<p class="field-help">The change only applies after you confirm it from the new inbox.</p>
			</div>
			<div>
				<label for="emailCurrentPassword" class="field-label">Your password</label>
				<input
					id="emailCurrentPassword"
					name="currentPassword"
					type="password"
					required
					class="input"
				/>
			</div>
			<button type="submit" class="btn btn-primary">Request change</button>
		</form>
	</section>

	<section>
		<h2 class="mb-3 text-lg font-semibold text-ink">Settings</h2>
		{@render notice('settings')}
		<form method="POST" action="?/updateSettings" class="space-y-3">
			<label class="flex items-center gap-2 text-sm text-ink-muted">
				<input
					type="checkbox"
					name="hideStats"
					checked={data.user?.hideStats}
					class="rounded border-line text-primary focus:ring-0"
				/>
				Hide my stats and activity on the public profile
			</label>
			<label class="flex items-center gap-2 text-sm text-ink-muted">
				<input
					type="checkbox"
					name="notifyEmail"
					checked={data.user?.notifyEmail}
					class="rounded border-line text-primary focus:ring-0"
				/>
				Email notifications
			</label>
			<button type="submit" class="btn btn-primary">Save settings</button>
		</form>
	</section>

	<section data-testid="following">
		<h2 class="mb-3 text-lg font-semibold text-ink">Following</h2>
		{@render notice('follows')}
		<h3 class="mb-2 text-sm font-semibold text-ink-muted">People</h3>
		{#if data.follows.users.length === 0}
			<p class="mb-4 text-sm text-ink-faint">You are not following anyone yet.</p>
		{:else}
			<ul class="mb-4 space-y-2">
				{#each data.follows.users as u (u.id)}
					<li class="card flex items-center justify-between gap-3 px-3 py-2 text-sm">
						<a href="/users/{u.username}" class="font-medium text-primary hover:underline"
							>{u.username}</a
						>
						<form method="POST" action="?/unfollow">
							<input type="hidden" name="targetType" value="USER" />
							<input type="hidden" name="targetId" value={u.id} />
							<button type="submit" class="btn btn-sm btn-secondary">Unfollow</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
		<h3 class="mb-2 text-sm font-semibold text-ink-muted">Categories</h3>
		{#if data.follows.categories.length === 0}
			<p class="text-sm text-ink-faint">You are not following any categories yet.</p>
		{:else}
			<ul class="space-y-2">
				{#each data.follows.categories as c (c.id)}
					<li class="card flex items-center justify-between gap-3 px-3 py-2 text-sm">
						<a href="/categories/{c.slug}" class="font-medium text-primary hover:underline"
							>{c.name}</a
						>
						<form method="POST" action="?/unfollow">
							<input type="hidden" name="targetType" value="CATEGORY" />
							<input type="hidden" name="targetId" value={c.id} />
							<button type="submit" class="btn btn-sm btn-secondary">Unfollow</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section>
		<h2 class="mb-3 text-lg font-semibold text-ink">Change password</h2>
		{@render notice('password')}
		<form method="POST" action="?/changePassword" class="space-y-4">
			<div>
				<label for="currentPassword" class="field-label">Current password</label>
				<input id="currentPassword" name="currentPassword" type="password" required class="input" />
			</div>
			<div>
				<label for="newPassword" class="field-label">New password</label>
				<input
					id="newPassword"
					name="newPassword"
					type="password"
					required
					minlength="10"
					class="input"
				/>
			</div>
			<button type="submit" class="btn btn-primary">Change password</button>
		</form>
	</section>

	<section>
		<h2 class="mb-3 text-lg font-semibold text-ink">Sessions</h2>
		<form method="POST" action="?/logoutEverywhere">
			<button type="submit" class="btn btn-secondary">Log out everywhere</button>
		</form>
	</section>

	<section class="rounded-lg border border-status-refuted-strong/40 p-4">
		<h2 class="mb-3 text-lg font-semibold text-status-refuted-strong">Delete account</h2>
		{@render notice('delete')}
		<form method="POST" action="?/deleteAccount" class="space-y-4">
			<div>
				<label for="deletePassword" class="field-label">Confirm with your password</label>
				<input id="deletePassword" name="password" type="password" required class="input" />
			</div>
			<button type="submit" class="btn btn-danger">Delete my account</button>
		</form>
	</section>
</div>
