<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import ReportForm from '$lib/components/ReportForm.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const profile = $derived(data.profile);

	const roleLabels: Record<string, string> = {
		VERIFIED: 'Member',
		EXPERT: 'Expert',
		MODERATOR: 'Moderator',
		ORGANIZATION: 'Organization',
		ADMIN: 'Admin'
	};
</script>

<svelte:head><title>{profile.username} - PurFacted</title></svelte:head>

<div class="mx-auto max-w-2xl">
	<div class="mb-8 flex items-start gap-4">
		{#if profile.avatarUrl}
			<img
				src={profile.avatarUrl}
				alt="{profile.username}'s avatar"
				class="h-16 w-16 rounded-full object-cover"
			/>
		{:else}
			<div
				class="flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft text-xl font-bold text-primary"
			>
				{profile.username.slice(0, 1).toUpperCase()}
			</div>
		{/if}
		<div>
			<h1 class="text-2xl font-bold text-ink">{profile.username}</h1>
			<p class="mt-1 flex flex-wrap items-center gap-2 text-sm">
				<span class={profile.role === 'VERIFIED' ? 'chip' : 'chip-primary'}>
					{roleLabels[profile.role] ?? profile.role}
				</span>
				{#if profile.level !== null}
					<span class="chip-primary">Level {profile.level}</span>
				{/if}
				{#if profile.reputation !== null}
					<span class="text-ink-faint tabular-nums" data-testid="reputation">
						{profile.reputation} reputation
					</span>
				{/if}
			</p>
			<p class="mt-1 text-sm text-ink-faint">
				Joined {new Date(profile.joinedAt).toLocaleDateString('en-GB', {
					year: 'numeric',
					month: 'long'
				})}
				<span aria-hidden="true">·</span>
				<span data-testid="follower-count">
					{profile.followerCount}
					{profile.followerCount === 1 ? 'follower' : 'followers'}
				</span>
			</p>
		</div>
		{#if data.user && data.user.username !== profile.username}
			<form method="POST" action={data.following ? '?/unfollow' : '?/follow'} class="ml-auto">
				<input type="hidden" name="targetId" value={data.profileUserId} />
				<button
					type="submit"
					class={data.following ? 'btn btn-sm btn-secondary' : 'btn btn-sm btn-primary'}
					data-testid="follow-toggle"
				>
					{data.following ? 'Following' : 'Follow'}
				</button>
			</form>
		{/if}
	</div>

	{#if profile.bio}
		<p class="mb-6 whitespace-pre-line text-ink-muted">{profile.bio}</p>
	{/if}

	{#if profile.badges.length > 0}
		<div class="mb-8 flex flex-wrap gap-2" data-testid="badges">
			{#each profile.badges as badge (badge.key)}
				<span class="chip-primary px-3 py-1 font-medium" title={badge.description}>
					{badge.name}
				</span>
			{/each}
		</div>
	{/if}

	{#if data.user && data.user.username !== profile.username}
		<div class="mb-8">
			{#if form?.reported}
				<p class="alert-success mb-2" role="status">Report sent - a moderator will take a look.</p>
			{/if}
			{#if form?.error}
				<p class="alert-error mb-2" role="alert">
					{form.error}
				</p>
			{/if}
			<ReportForm
				action="?/report"
				targetType="USER"
				targetId={data.profileUserId}
				label="Report this user"
			/>

			{#if data.user.role === 'MODERATOR' || data.user.role === 'ADMIN'}
				<div class="mt-3 flex flex-wrap items-end gap-3">
					{#if form?.banned}
						<p class="alert-warning w-full" role="status">
							User banned (level {form.level}).
						</p>
					{/if}
					{#if form?.liftedBan}
						<p class="alert-success w-full" role="status">Ban lifted.</p>
					{/if}
					{#if form?.revokedExpert}
						<p class="alert-success w-full" role="status">Expert status revoked.</p>
					{/if}
					<form method="POST" action="?/ban" class="flex items-end gap-2">
						<input type="hidden" name="targetId" value={data.profileUserId} />
						<div>
							<label for="banReason" class="field-label text-xs">Ban reason</label>
							<input
								id="banReason"
								name="reason"
								type="text"
								required
								minlength="3"
								class="input text-sm"
							/>
						</div>
						<button type="submit" class="btn btn-sm btn-danger">Ban (escalating)</button>
					</form>
					{#if data.targetBanned && data.user.role === 'ADMIN'}
						<form method="POST" action="?/liftBan">
							<input type="hidden" name="targetId" value={data.profileUserId} />
							<button type="submit" class="btn btn-sm btn-secondary">Lift ban</button>
						</form>
					{/if}
					{#if profile.role === 'EXPERT' && data.user.role === 'ADMIN'}
						<form method="POST" action="?/revokeExpert">
							<input type="hidden" name="targetId" value={data.profileUserId} />
							<button type="submit" class="btn btn-sm btn-secondary" data-testid="revoke-expert">
								Revoke expert
							</button>
						</form>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	<section>
		<h2 class="mb-3 text-lg font-semibold text-ink">Recent activity</h2>
		{#if profile.activity.length === 0}
			<p class="text-sm text-ink-muted">No public activity.</p>
		{:else}
			<ul class="space-y-2">
				{#each profile.activity as item (item.type + item.factId + item.createdAt)}
					<li class="card px-4 py-3 text-sm">
						<span class="chip mr-2 text-[11px] font-medium tracking-wide uppercase">
							{item.type}
						</span>
						<span class="text-ink-muted">{item.title}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
