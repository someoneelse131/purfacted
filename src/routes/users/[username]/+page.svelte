<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
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
		<p class="mb-8 whitespace-pre-line text-slate-700">{profile.bio}</p>
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
