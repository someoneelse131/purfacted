<script lang="ts">
	import { onMount } from 'svelte';

	export let data;

	interface Debate {
		id: string;
		title: string;
		status: string;
		createdAt: string;
		publishedAt: string | null;
		initiator: { id: string; firstName: string; lastName: string };
		opponent: { id: string; firstName: string; lastName: string };
		fact: { id: string; title: string };
		_count?: { messages: number; votes: number };
	}

	let debates: Debate[] = [];
	let loading = true;
	let error = '';
	let filter: 'published' | 'my' = 'published';

	async function loadDebates() {
		loading = true;
		error = '';

		try {
			const params = new URLSearchParams();
			if (filter === 'published') {
				params.set('status', 'PUBLISHED');
			}

			const res = await fetch(`/api/debates?${params}`);
			const responseData = await res.json();

			if (responseData.success) {
				debates = responseData.data.debates || responseData.data || [];
			} else {
				error = responseData.error || 'Failed to load debates';
			}
		} catch (err) {
			error = 'Error loading debates';
			console.error(err);
		} finally {
			loading = false;
		}
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	onMount(() => {
		loadDebates();
	});
</script>

<svelte:head>
	<title>Debates | PurFacted</title>
</svelte:head>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
	<div class="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold text-gray-900">Debates</h1>
			<p class="mt-2 text-gray-600">Public debates between community members</p>
		</div>

		{#if data.user}
			<div class="flex gap-2">
				<button
					on:click={() => { filter = 'published'; loadDebates(); }}
					class="px-4 py-2 text-sm font-medium rounded-md {filter === 'published' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}"
				>
					Published
				</button>
				<button
					on:click={() => { filter = 'my'; loadDebates(); }}
					class="px-4 py-2 text-sm font-medium rounded-md {filter === 'my' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}"
				>
					My Debates
				</button>
			</div>
		{/if}
	</div>

	{#if loading}
		<div class="text-center py-12">
			<div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
			<p class="mt-2 text-gray-600">Loading debates...</p>
		</div>
	{:else if error}
		<div class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
			{error}
		</div>
	{:else if debates.length === 0}
		<div class="bg-white rounded-lg shadow p-8 text-center">
			<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
			</svg>
			<p class="mt-4 text-gray-500">No debates found</p>
			<p class="mt-2 text-sm text-gray-400">
				{#if filter === 'my'}
					Start a debate from any fact page
				{:else}
					Published debates will appear here
				{/if}
			</p>
		</div>
	{:else}
		<div class="space-y-4">
			{#each debates as debate}
				<a
					href="/debates/{debate.id}"
					class="block bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow"
				>
					<div class="flex items-start justify-between">
						<div class="flex-1">
							<h2 class="text-xl font-semibold text-gray-900">
								{debate.title || 'Untitled Debate'}
							</h2>

							<p class="mt-1 text-sm text-gray-500">
								About: <span class="text-gray-700">{debate.fact.title}</span>
							</p>

							<div class="mt-3 flex items-center gap-4 text-sm text-gray-600">
								<span>
									{debate.initiator.firstName} {debate.initiator.lastName}
									<span class="text-gray-400">vs</span>
									{debate.opponent.firstName} {debate.opponent.lastName}
								</span>

								{#if debate.publishedAt}
									<span class="text-gray-400">|</span>
									<span>{formatDate(debate.publishedAt)}</span>
								{/if}

								{#if debate._count}
									<span class="text-gray-400">|</span>
									<span>{debate._count.messages} messages</span>
									<span class="text-gray-400">|</span>
									<span>{debate._count.votes} votes</span>
								{/if}
							</div>
						</div>

						<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
							{debate.status === 'PUBLISHED' ? 'bg-green-100 text-green-800' :
							 debate.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
							 debate.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' :
							 'bg-gray-100 text-gray-800'}">
							{debate.status.replace('_', ' ')}
						</span>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>
