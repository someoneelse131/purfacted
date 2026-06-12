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
				class="flex h-16 w-16 items-center justify-center rounded-full bg-slate-200 text-xl font-bold text-slate-600"
			>
				{profile.username.slice(0, 1).toUpperCase()}
			</div>
		{/if}
		<div>
			<h1 class="text-2xl font-bold text-slate-900">{profile.username}</h1>
			<p class="mt-1 flex flex-wrap items-center gap-2 text-sm">
				<span class="rounded-full bg-slate-200 px-2 py-0.5 text-slate-700">
					{roleLabels[profile.role] ?? profile.role}
				</span>
				{#if profile.level !== null}
					<span class="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-700">
						Level {profile.level}
					</span>
				{/if}
				{#if profile.reputation !== null}
					<span class="text-slate-500" data-testid="reputation">
						{profile.reputation} reputation
					</span>
				{/if}
			</p>
			<p class="mt-1 text-sm text-slate-500">
				Joined {new Date(profile.joinedAt).toLocaleDateString('en-GB', {
					year: 'numeric',
					month: 'long'
				})}
			</p>
		</div>
	</div>

	{#if profile.bio}
		<p class="mb-6 whitespace-pre-line text-slate-700">{profile.bio}</p>
	{/if}

	{#if profile.badges.length > 0}
		<div class="mb-8 flex flex-wrap gap-2" data-testid="badges">
			{#each profile.badges as badge (badge.key)}
				<span
					class="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800"
					title={badge.description}
				>
					🏅 {badge.name}
				</span>
			{/each}
		</div>
	{/if}

	{#if data.user && data.user.username !== profile.username}
		<div class="mb-8">
			{#if form?.reported}
				<p class="mb-2 rounded-md bg-green-50 px-4 py-3 text-sm text-green-700" role="status">
					Report sent - a moderator will take a look.
				</p>
			{/if}
			{#if form?.error}
				<p class="mb-2 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
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
						<p class="w-full rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
							User banned (level {form.level}).
						</p>
					{/if}
					{#if form?.liftedBan}
						<p class="w-full rounded-md bg-green-50 px-4 py-3 text-sm text-green-700" role="status">
							Ban lifted.
						</p>
					{/if}
					<form method="POST" action="?/ban" class="flex items-end gap-2">
						<input type="hidden" name="targetId" value={data.profileUserId} />
						<div>
							<label for="banReason" class="mb-1 block text-xs font-medium text-slate-600">
								Ban reason
							</label>
							<input
								id="banReason"
								name="reason"
								type="text"
								required
								minlength="3"
								class="rounded-md border-slate-300 text-sm"
							/>
						</div>
						<button
							type="submit"
							class="rounded-md bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-500"
						>
							Ban (escalating)
						</button>
					</form>
					{#if data.targetBanned && data.user.role === 'ADMIN'}
						<form method="POST" action="?/liftBan">
							<input type="hidden" name="targetId" value={data.profileUserId} />
							<button
								type="submit"
								class="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
							>
								Lift ban
							</button>
						</form>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	<section>
		<h2 class="mb-3 text-lg font-semibold text-slate-900">Recent activity</h2>
		{#if profile.activity.length === 0}
			<p class="text-sm text-slate-500">No public activity.</p>
		{:else}
			<ul class="space-y-2">
				{#each profile.activity as item (item.type + item.factId + item.createdAt)}
					<li class="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm">
						<span class="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs uppercase text-slate-500">
							{item.type}
						</span>
						<span class="text-slate-700">{item.title}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
