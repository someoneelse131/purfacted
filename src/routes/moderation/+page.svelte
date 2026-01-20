<script lang="ts">
	import { onMount } from 'svelte';

	export let data;

	interface QueueItem {
		id: string;
		type: string;
		status: string;
		priority: number;
		createdAt: string;
		content: any;
	}

	let queue: QueueItem[] = [];
	let stats = { pending: 0, inProgress: 0, resolved: 0 };
	let loading = true;
	let error = '';
	let filterType = '';
	let filterStatus = 'PENDING';

	const typeLabels: Record<string, string> = {
		REPORTED_CONTENT: 'Reported Content',
		EDIT_REQUEST: 'Edit Request',
		DUPLICATE_MERGE: 'Duplicate Merge',
		VETO_REVIEW: 'Veto Review',
		ORG_APPROVAL: 'Organization Approval',
		VERIFICATION_REVIEW: 'Verification Review',
		FLAGGED_ACCOUNT: 'Flagged Account'
	};

	async function loadQueue() {
		if (!data.user || data.user.userType !== 'MODERATOR') {
			error = 'Access denied. Moderators only.';
			loading = false;
			return;
		}

		loading = true;
		error = '';

		try {
			const params = new URLSearchParams();
			if (filterType) params.set('type', filterType);
			if (filterStatus) params.set('status', filterStatus);

			const res = await fetch(`/api/moderation/queue?${params}`);
			const responseData = await res.json();

			if (responseData.success) {
				queue = responseData.data.items || [];
				stats = responseData.data.stats || stats;
			} else {
				error = responseData.error || 'Failed to load queue';
			}
		} catch (err) {
			error = 'Error loading moderation queue';
			console.error(err);
		} finally {
			loading = false;
		}
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	onMount(() => {
		loadQueue();
	});
</script>

<svelte:head>
	<title>Moderation | PurFacted</title>
</svelte:head>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
	<div class="mb-8">
		<h1 class="text-3xl font-bold text-gray-900">Moderation Dashboard</h1>
		<p class="mt-2 text-gray-600">Review and manage reported content</p>
	</div>

	{#if !data.user || data.user.userType !== 'MODERATOR'}
		<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-700">
			<p class="font-medium">Access Restricted</p>
			<p class="text-sm mt-1">This page is only available to moderators.</p>
		</div>
	{:else}
		<!-- Stats -->
		<div class="grid grid-cols-3 gap-4 mb-6">
			<div class="bg-white rounded-lg shadow-sm border p-4">
				<p class="text-sm font-medium text-gray-500">Pending</p>
				<p class="text-2xl font-bold text-yellow-600">{stats.pending}</p>
			</div>
			<div class="bg-white rounded-lg shadow-sm border p-4">
				<p class="text-sm font-medium text-gray-500">In Progress</p>
				<p class="text-2xl font-bold text-blue-600">{stats.inProgress}</p>
			</div>
			<div class="bg-white rounded-lg shadow-sm border p-4">
				<p class="text-sm font-medium text-gray-500">Resolved Today</p>
				<p class="text-2xl font-bold text-green-600">{stats.resolved}</p>
			</div>
		</div>

		<!-- Filters -->
		<div class="bg-white rounded-lg shadow-sm border p-4 mb-6">
			<div class="flex flex-wrap gap-4">
				<select
					bind:value={filterType}
					on:change={loadQueue}
					class="px-3 py-2 border border-gray-300 rounded-md text-sm"
				>
					<option value="">All Types</option>
					{#each Object.entries(typeLabels) as [value, label]}
						<option {value}>{label}</option>
					{/each}
				</select>

				<select
					bind:value={filterStatus}
					on:change={loadQueue}
					class="px-3 py-2 border border-gray-300 rounded-md text-sm"
				>
					<option value="">All Status</option>
					<option value="PENDING">Pending</option>
					<option value="IN_PROGRESS">In Progress</option>
					<option value="RESOLVED">Resolved</option>
					<option value="DISMISSED">Dismissed</option>
				</select>
			</div>
		</div>

		<!-- Queue -->
		{#if loading}
			<div class="text-center py-12">
				<div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
				<p class="mt-2 text-gray-600">Loading queue...</p>
			</div>
		{:else if error}
			<div class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
				{error}
			</div>
		{:else if queue.length === 0}
			<div class="bg-white rounded-lg shadow p-8 text-center">
				<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
				<p class="mt-4 text-gray-500">No items in queue</p>
			</div>
		{:else}
			<div class="bg-white rounded-lg shadow-sm border overflow-hidden">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#each queue as item}
							<tr class="hover:bg-gray-50">
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
									{typeLabels[item.type] || item.type}
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
										{item.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
										 item.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' :
										 item.status === 'RESOLVED' ? 'bg-green-100 text-green-800' :
										 'bg-gray-100 text-gray-800'}">
										{item.status}
									</span>
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
									{item.priority}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
									{formatDate(item.createdAt)}
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-sm">
									<a href="/moderation/{item.id}" class="text-blue-600 hover:text-blue-800">
										Review
									</a>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/if}
</div>
