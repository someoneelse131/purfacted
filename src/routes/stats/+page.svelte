<script lang="ts">
	import { onMount } from 'svelte';

	interface Stats {
		users: { total: number; verified: number; experts: number; organizations: number };
		facts: { total: number; proven: number; disproven: number; disputed: number; pending: number };
		votes: { total: number };
		comments: { total: number };
		debates: { total: number; published: number };
	}

	let stats: Stats | null = null;
	let loading = true;
	let error = '';

	async function loadStats() {
		try {
			const res = await fetch('/api/stats');
			const data = await res.json();
			if (data.success) {
				stats = data.data;
			} else {
				error = 'Failed to load statistics';
			}
		} catch (err) {
			error = 'Error loading statistics';
			console.error(err);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		loadStats();
	});
</script>

<svelte:head>
	<title>Statistics | PurFacted</title>
</svelte:head>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
	<div class="mb-8">
		<h1 class="text-3xl font-bold text-gray-900">Platform Statistics</h1>
		<p class="mt-2 text-gray-600">Overview of PurFacted community activity</p>
	</div>

	{#if loading}
		<div class="text-center py-12">
			<div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
			<p class="mt-2 text-gray-600">Loading statistics...</p>
		</div>
	{:else if error}
		<div class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
			{error}
		</div>
	{:else if stats}
		<!-- User Stats -->
		<div class="mb-8">
			<h2 class="text-xl font-semibold text-gray-900 mb-4">Users</h2>
			<div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
				<div class="bg-white rounded-lg shadow-sm border p-6">
					<p class="text-sm font-medium text-gray-500">Total Users</p>
					<p class="text-3xl font-bold text-gray-900">{stats.users?.total || 0}</p>
				</div>
				<div class="bg-white rounded-lg shadow-sm border p-6">
					<p class="text-sm font-medium text-gray-500">Verified</p>
					<p class="text-3xl font-bold text-blue-600">{stats.users?.verified || 0}</p>
				</div>
				<div class="bg-white rounded-lg shadow-sm border p-6">
					<p class="text-sm font-medium text-gray-500">Experts</p>
					<p class="text-3xl font-bold text-green-600">{stats.users?.experts || 0}</p>
				</div>
				<div class="bg-white rounded-lg shadow-sm border p-6">
					<p class="text-sm font-medium text-gray-500">Organizations</p>
					<p class="text-3xl font-bold text-purple-600">{stats.users?.organizations || 0}</p>
				</div>
			</div>
		</div>

		<!-- Fact Stats -->
		<div class="mb-8">
			<h2 class="text-xl font-semibold text-gray-900 mb-4">Facts</h2>
			<div class="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
				<div class="bg-white rounded-lg shadow-sm border p-6">
					<p class="text-sm font-medium text-gray-500">Total Facts</p>
					<p class="text-3xl font-bold text-gray-900">{stats.facts?.total || 0}</p>
				</div>
				<div class="bg-white rounded-lg shadow-sm border p-6">
					<p class="text-sm font-medium text-gray-500">Proven</p>
					<p class="text-3xl font-bold text-green-600">{stats.facts?.proven || 0}</p>
				</div>
				<div class="bg-white rounded-lg shadow-sm border p-6">
					<p class="text-sm font-medium text-gray-500">Disproven</p>
					<p class="text-3xl font-bold text-red-600">{stats.facts?.disproven || 0}</p>
				</div>
				<div class="bg-white rounded-lg shadow-sm border p-6">
					<p class="text-sm font-medium text-gray-500">Disputed</p>
					<p class="text-3xl font-bold text-yellow-600">{stats.facts?.disputed || 0}</p>
				</div>
				<div class="bg-white rounded-lg shadow-sm border p-6">
					<p class="text-sm font-medium text-gray-500">Pending</p>
					<p class="text-3xl font-bold text-gray-400">{stats.facts?.pending || 0}</p>
				</div>
			</div>
		</div>

		<!-- Activity Stats -->
		<div class="mb-8">
			<h2 class="text-xl font-semibold text-gray-900 mb-4">Activity</h2>
			<div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
				<div class="bg-white rounded-lg shadow-sm border p-6">
					<p class="text-sm font-medium text-gray-500">Total Votes</p>
					<p class="text-3xl font-bold text-gray-900">{stats.votes?.total || 0}</p>
				</div>
				<div class="bg-white rounded-lg shadow-sm border p-6">
					<p class="text-sm font-medium text-gray-500">Comments</p>
					<p class="text-3xl font-bold text-gray-900">{stats.comments?.total || 0}</p>
				</div>
				<div class="bg-white rounded-lg shadow-sm border p-6">
					<p class="text-sm font-medium text-gray-500">Total Debates</p>
					<p class="text-3xl font-bold text-gray-900">{stats.debates?.total || 0}</p>
				</div>
				<div class="bg-white rounded-lg shadow-sm border p-6">
					<p class="text-sm font-medium text-gray-500">Published Debates</p>
					<p class="text-3xl font-bold text-blue-600">{stats.debates?.published || 0}</p>
				</div>
			</div>
		</div>
	{/if}
</div>
