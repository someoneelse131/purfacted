<script lang="ts">
	import { onMount } from 'svelte';

	export let data;

	let profile: any = null;
	let loading = true;
	let error = '';

	async function loadProfile() {
		if (!data.user) {
			error = 'Please log in to view your profile';
			loading = false;
			return;
		}

		try {
			const res = await fetch('/api/user/profile');
			const responseData = await res.json();
			if (responseData.success) {
				profile = responseData.data;
			} else {
				error = 'Failed to load profile';
			}
		} catch (err) {
			error = 'Error loading profile';
			console.error(err);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		loadProfile();
	});

	const userTypeLabels: Record<string, string> = {
		ANONYMOUS: 'Anonymous',
		VERIFIED: 'Verified User',
		EXPERT: 'Expert',
		PHD: 'PhD',
		ORGANIZATION: 'Organization',
		MODERATOR: 'Moderator'
	};

	const userTypeColors: Record<string, string> = {
		ANONYMOUS: 'bg-gray-100 text-gray-800',
		VERIFIED: 'bg-blue-100 text-blue-800',
		EXPERT: 'bg-green-100 text-green-800',
		PHD: 'bg-purple-100 text-purple-800',
		ORGANIZATION: 'bg-yellow-100 text-yellow-800',
		MODERATOR: 'bg-red-100 text-red-800'
	};
</script>

<svelte:head>
	<title>My Profile | PurFacted</title>
</svelte:head>

<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
	<div class="mb-8">
		<h1 class="text-3xl font-bold text-gray-900">My Profile</h1>
	</div>

	{#if loading}
		<div class="text-center py-12">
			<div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
			<p class="mt-2 text-gray-600">Loading profile...</p>
		</div>
	{:else if error}
		<div class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
			{error}
			{#if !data.user}
				<a href="/auth/login" class="ml-2 underline">Log in</a>
			{/if}
		</div>
	{:else if profile}
		<div class="bg-white rounded-lg shadow-sm border overflow-hidden">
			<!-- Header -->
			<div class="bg-gradient-to-r from-blue-600 to-blue-800 px-6 py-8 text-white">
				<div class="flex items-center gap-4">
					<div class="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center text-3xl font-bold">
						{profile.firstName?.[0] || '?'}{profile.lastName?.[0] || ''}
					</div>
					<div>
						<h2 class="text-2xl font-bold">{profile.firstName} {profile.lastName}</h2>
						<p class="text-blue-100">{profile.email}</p>
						<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-2 {userTypeColors[profile.userType] || 'bg-gray-100 text-gray-800'}">
							{userTypeLabels[profile.userType] || profile.userType}
						</span>
					</div>
				</div>
			</div>

			<!-- Stats -->
			<div class="grid grid-cols-3 divide-x border-b">
				<div class="px-6 py-4 text-center">
					<p class="text-2xl font-bold text-gray-900">{profile.trustScore || 0}</p>
					<p class="text-sm text-gray-500">Trust Score</p>
				</div>
				<div class="px-6 py-4 text-center">
					<p class="text-2xl font-bold text-gray-900">{profile._count?.facts || 0}</p>
					<p class="text-sm text-gray-500">Facts</p>
				</div>
				<div class="px-6 py-4 text-center">
					<p class="text-2xl font-bold text-gray-900">{profile._count?.factVotes || 0}</p>
					<p class="text-sm text-gray-500">Votes</p>
				</div>
			</div>

			<!-- Details -->
			<div class="px-6 py-4">
				<h3 class="text-lg font-semibold text-gray-900 mb-4">Account Details</h3>
				<dl class="space-y-3">
					<div class="flex justify-between">
						<dt class="text-gray-500">Email Verified</dt>
						<dd class="text-gray-900">{profile.emailVerified ? 'Yes' : 'No'}</dd>
					</div>
					<div class="flex justify-between">
						<dt class="text-gray-500">Member Since</dt>
						<dd class="text-gray-900">
							{new Date(profile.createdAt).toLocaleDateString('en-US', {
								year: 'numeric',
								month: 'long',
								day: 'numeric'
							})}
						</dd>
					</div>
					{#if profile.lastLoginAt}
						<div class="flex justify-between">
							<dt class="text-gray-500">Last Login</dt>
							<dd class="text-gray-900">
								{new Date(profile.lastLoginAt).toLocaleDateString('en-US', {
									year: 'numeric',
									month: 'long',
									day: 'numeric'
								})}
							</dd>
						</div>
					{/if}
				</dl>
			</div>

			<!-- Actions -->
			<div class="px-6 py-4 bg-gray-50 border-t">
				<div class="flex gap-4">
					<a
						href="/user/settings"
						class="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
					>
						Edit Settings
					</a>
					<a
						href="/facts?user={profile.id}"
						class="inline-flex items-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
					>
						View My Facts
					</a>
				</div>
			</div>
		</div>
	{/if}
</div>
