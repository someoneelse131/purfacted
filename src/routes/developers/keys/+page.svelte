<script lang="ts">
	import { enhance } from '$app/forms';

	export let data;
	export let form;

	let showCreateForm = false;
	let newKeyVisible = false;
	let copiedKey = false;

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text);
		copiedKey = true;
		setTimeout(() => copiedKey = false, 2000);
	}

	function formatDate(dateString: string | null) {
		if (!dateString) return 'Never';
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	$: if (form?.success && form?.newKey) {
		showCreateForm = false;
		newKeyVisible = true;
	}
</script>

<svelte:head>
	<title>API Keys - PurFacted Developer Portal</title>
</svelte:head>

<div class="max-w-4xl mx-auto px-4 py-8">
	<div class="flex items-center justify-between mb-8">
		<div>
			<h1 class="text-3xl font-bold text-gray-900">API Keys</h1>
			<p class="text-gray-600 mt-1">Manage your API keys for the PurFacted Source of Trust API</p>
		</div>
		<a href="/developers" class="text-blue-600 hover:underline">
			Back to Developer Portal
		</a>
	</div>

	<!-- New Key Created Alert -->
	{#if form?.success && form?.newKey}
		<div class="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
			<div class="flex items-start">
				<svg class="w-5 h-5 text-green-600 mr-3 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
					<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
				</svg>
				<div class="flex-1">
					<h3 class="font-semibold text-green-800">API Key Created</h3>
					<p class="text-sm text-green-700 mt-1">
						Copy your new API key below. You won't be able to see it again!
					</p>
					<div class="mt-3 flex items-center gap-2">
						<code class="flex-1 bg-white border border-green-300 rounded px-3 py-2 font-mono text-sm break-all">
							{form.newKey.rawKey}
						</code>
						<button
							on:click={() => copyToClipboard(form.newKey.rawKey)}
							class="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
						>
							{copiedKey ? 'Copied!' : 'Copy'}
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Error Alert -->
	{#if form?.error}
		<div class="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
			<p class="text-red-700">{form.error}</p>
		</div>
	{/if}

	<!-- Create New Key -->
	<div class="mb-8">
		{#if showCreateForm}
			<div class="bg-white rounded-lg shadow p-6">
				<h2 class="text-lg font-semibold mb-4">Create New API Key</h2>
				<form method="POST" action="?/create" use:enhance>
					<div class="space-y-4">
						<div>
							<label for="name" class="block text-sm font-medium text-gray-700 mb-1">
								Key Name *
							</label>
							<input
								type="text"
								id="name"
								name="name"
								required
								minlength="3"
								placeholder="My App API Key"
								class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
							/>
						</div>
						<div>
							<label for="description" class="block text-sm font-medium text-gray-700 mb-1">
								Description (optional)
							</label>
							<textarea
								id="description"
								name="description"
								rows="2"
								placeholder="What will this key be used for?"
								class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
							></textarea>
						</div>
					</div>
					<div class="mt-4 flex gap-2">
						<button
							type="submit"
							class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
						>
							Create Key
						</button>
						<button
							type="button"
							on:click={() => showCreateForm = false}
							class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
						>
							Cancel
						</button>
					</div>
				</form>
			</div>
		{:else}
			<button
				on:click={() => showCreateForm = true}
				class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2"
			>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				Create New API Key
			</button>
		{/if}
	</div>

	<!-- Existing Keys -->
	<div class="bg-white rounded-lg shadow overflow-hidden">
		<div class="px-6 py-4 border-b border-gray-200">
			<h2 class="text-lg font-semibold">Your API Keys</h2>
		</div>

		{#if data.apiKeys.length === 0}
			<div class="px-6 py-12 text-center text-gray-500">
				<svg class="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
				</svg>
				<p>You haven't created any API keys yet.</p>
				<p class="text-sm mt-1">Create one to start using the API.</p>
			</div>
		{:else}
			<div class="divide-y divide-gray-200">
				{#each data.apiKeys as key}
					<div class="px-6 py-4 {key.isActive ? '' : 'bg-gray-50 opacity-75'}">
						<div class="flex items-start justify-between">
							<div class="flex-1">
								<div class="flex items-center gap-2">
									<h3 class="font-medium text-gray-900">{key.name}</h3>
									<span class="px-2 py-0.5 text-xs font-medium rounded-full {key.tier === 'FREE' ? 'bg-gray-100 text-gray-600' : key.tier === 'BASIC' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}">
										{key.tier}
									</span>
									{#if !key.isActive}
										<span class="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">
											Revoked
										</span>
									{/if}
								</div>
								<div class="mt-1 text-sm text-gray-500">
									<span class="font-mono">{key.keyPrefix}...</span>
								</div>
								<div class="mt-2 flex flex-wrap gap-4 text-sm text-gray-500">
									<span>Created: {formatDate(key.createdAt)}</span>
									<span>Last used: {formatDate(key.lastUsedAt)}</span>
									<span>Requests (30d): {key.stats.totalRequests.toLocaleString()}</span>
									{#if key.stats.averageLatency}
										<span>Avg latency: {key.stats.averageLatency}ms</span>
									{/if}
								</div>
							</div>
							{#if key.isActive}
								<form method="POST" action="?/revoke" use:enhance>
									<input type="hidden" name="keyId" value={key.id} />
									<button
										type="submit"
										class="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
										onclick="return confirm('Are you sure you want to revoke this API key? This cannot be undone.')"
									>
										Revoke
									</button>
								</form>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Usage Info -->
	<div class="mt-8 bg-blue-50 rounded-lg p-6">
		<h3 class="font-semibold text-blue-900 mb-2">Free Tier Limits</h3>
		<ul class="text-sm text-blue-800 space-y-1">
			<li>100 API requests per day</li>
			<li>Rate limits reset at midnight UTC</li>
			<li>All endpoints available</li>
		</ul>
		<p class="mt-4 text-sm text-blue-700">
			Need more requests? <a href="/developers#pricing" class="underline">Upgrade your plan</a>
		</p>
	</div>
</div>
