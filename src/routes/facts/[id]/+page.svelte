<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	interface Fact {
		id: string;
		title: string;
		body: string;
		status: string;
		createdAt: string;
		updatedAt: string;
		credibilityScore: number;
		user: {
			id: string;
			firstName: string;
			lastName: string;
			userType: string;
		};
		category: { id: string; name: string } | null;
		sources: Array<{
			id: string;
			url: string;
			title: string | null;
			type: string;
			createdAt: string;
		}>;
	}

	interface VotingSummary {
		score: number;
		totalVotes: number;
		upvotes: number;
		downvotes: number;
		positivePercent: number;
		status: string;
		minVotesRequired: number;
		votesRemaining: number;
	}

	let fact: Fact | null = null;
	let votingSummary: VotingSummary | null = null;
	let userVote: { value: number; weight: number } | null = null;
	let loading = true;
	let voting = false;
	let error = '';

	// Status colors
	const statusColors: Record<string, string> = {
		SUBMITTED: 'bg-gray-100 text-gray-800',
		IN_REVIEW: 'bg-yellow-100 text-yellow-800',
		PROVEN: 'bg-green-100 text-green-800',
		DISPROVEN: 'bg-red-100 text-red-800',
		CONTROVERSIAL: 'bg-orange-100 text-orange-800',
		UNDER_VETO_REVIEW: 'bg-purple-100 text-purple-800'
	};

	// Source type colors
	const sourceTypeColors: Record<string, string> = {
		PEER_REVIEWED: 'bg-green-100 text-green-800',
		OFFICIAL: 'bg-blue-100 text-blue-800',
		NEWS: 'bg-purple-100 text-purple-800',
		COMPANY: 'bg-yellow-100 text-yellow-800',
		BLOG: 'bg-orange-100 text-orange-800',
		OTHER: 'bg-gray-100 text-gray-800'
	};

	// User type colors
	const userTypeColors: Record<string, string> = {
		VERIFIED: 'bg-blue-100 text-blue-800',
		EXPERT: 'bg-green-100 text-green-800',
		PHD: 'bg-purple-100 text-purple-800',
		ORGANIZATION: 'bg-yellow-100 text-yellow-800',
		MODERATOR: 'bg-red-100 text-red-800'
	};

	async function loadFact() {
		loading = true;
		error = '';

		try {
			const factId = $page.params.id;

			// Load fact details
			const factResponse = await fetch(`/api/facts/${factId}`);
			const factData = await factResponse.json();

			if (factData.success) {
				fact = factData.data;
			} else {
				error = 'Failed to load fact';
				return;
			}

			// Load voting summary
			const voteResponse = await fetch(`/api/facts/${factId}/vote`);
			const voteData = await voteResponse.json();

			if (voteData.success) {
				votingSummary = voteData.data.summary;
				userVote = voteData.data.userVote;
			}
		} catch (err) {
			error = 'Error loading fact';
			console.error(err);
		} finally {
			loading = false;
		}
	}

	async function vote(value: 1 | -1) {
		if (voting) return;
		voting = true;

		try {
			const factId = $page.params.id;
			const response = await fetch(`/api/facts/${factId}/vote`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ value })
			});

			const data = await response.json();

			if (response.ok && data.success) {
				userVote = { value: data.data.vote.value, weight: data.data.vote.weight };
				// Reload voting summary
				const voteResponse = await fetch(`/api/facts/${factId}/vote`);
				const voteData = await voteResponse.json();
				if (voteData.success) {
					votingSummary = voteData.data.summary;
				}
			} else {
				alert(data.message || 'Failed to vote');
			}
		} catch (err) {
			alert('Error voting');
		} finally {
			voting = false;
		}
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function getSourceDomain(url: string): string {
		try {
			return new URL(url).hostname;
		} catch {
			return url;
		}
	}

	onMount(() => {
		loadFact();
	});
</script>

<svelte:head>
	<title>{fact?.title || 'Fact'} | PurFacted</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
	<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
		<!-- Back Link -->
		<a href="/facts" class="inline-flex items-center text-blue-600 hover:text-blue-800 mb-6">
			<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
			</svg>
			Back to Facts
		</a>

		{#if loading}
			<div class="text-center py-12">
				<div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
				<p class="mt-2 text-gray-600">Loading...</p>
			</div>
		{:else if error}
			<div class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
				{error}
			</div>
		{:else if fact}
			<!-- Fact Card -->
			<div class="bg-white rounded-lg shadow-lg overflow-hidden">
				<!-- Header -->
				<div class="p-6 border-b">
					<div class="flex items-start justify-between">
						<div>
							<h1 class="text-2xl font-bold text-gray-900">{fact.title}</h1>
							<div class="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-500">
								<!-- Status -->
								<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {statusColors[fact.status] || 'bg-gray-100 text-gray-800'}">
									{fact.status.replace('_', ' ')}
								</span>

								<!-- Category -->
								{#if fact.category}
									<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
										{fact.category.name}
									</span>
								{/if}

								<!-- Author -->
								<span>
									by {fact.user.firstName} {fact.user.lastName}
									{#if fact.user.userType !== 'VERIFIED'}
										<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium {userTypeColors[fact.user.userType] || ''}">
											{fact.user.userType}
										</span>
									{/if}
								</span>

								<!-- Date -->
								<span>{formatDate(fact.createdAt)}</span>
							</div>
						</div>

						<!-- Credibility Score -->
						<div class="text-center">
							<div class="text-2xl font-bold text-blue-600">{fact.credibilityScore}</div>
							<div class="text-xs text-gray-500">Credibility</div>
						</div>
					</div>
				</div>

				<!-- Body -->
				<div class="p-6">
					<p class="text-gray-800 whitespace-pre-wrap">{fact.body}</p>
				</div>

				<!-- Voting Section -->
				{#if votingSummary}
					<div class="px-6 py-4 bg-gray-50 border-t">
						<h3 class="text-sm font-medium text-gray-700 mb-3">Community Vote</h3>
						<div class="flex items-center gap-4">
							<!-- Vote Buttons -->
							<div class="flex items-center gap-2">
								<button
									on:click={() => vote(1)}
									disabled={voting}
									class="inline-flex items-center px-4 py-2 rounded-lg {userVote?.value === 1 ? 'bg-green-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}"
								>
									<svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
									</svg>
									Upvote
								</button>
								<button
									on:click={() => vote(-1)}
									disabled={voting}
									class="inline-flex items-center px-4 py-2 rounded-lg {userVote?.value === -1 ? 'bg-red-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}"
								>
									<svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
									</svg>
									Downvote
								</button>
							</div>

							<!-- Score Display -->
							<div class="flex-1 text-right">
								<div class="text-lg font-semibold">
									{votingSummary.score.toFixed(1)} points
								</div>
								<div class="text-sm text-gray-500">
									{votingSummary.upvotes} up / {votingSummary.downvotes} down
									({votingSummary.positivePercent.toFixed(0)}% positive)
								</div>
								{#if votingSummary.votesRemaining > 0}
									<div class="text-xs text-gray-400">
										{votingSummary.votesRemaining} more votes needed for status change
									</div>
								{/if}
							</div>
						</div>

						{#if userVote}
							<div class="mt-2 text-xs text-gray-500">
								Your vote weight: {userVote.weight.toFixed(2)}
							</div>
						{/if}
					</div>
				{/if}

				<!-- Sources -->
				<div class="p-6 border-t">
					<h3 class="text-lg font-semibold text-gray-900 mb-4">Sources ({fact.sources.length})</h3>
					<div class="space-y-3">
						{#each fact.sources as source}
							<div class="flex items-start p-3 bg-gray-50 rounded-lg">
								<div class="flex-1">
									<div class="flex items-center gap-2">
										<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium {sourceTypeColors[source.type] || 'bg-gray-100 text-gray-800'}">
											{source.type.replace('_', ' ')}
										</span>
										{#if source.title}
											<span class="font-medium text-gray-900">{source.title}</span>
										{/if}
									</div>
									<a
										href={source.url}
										target="_blank"
										rel="noopener noreferrer"
										class="mt-1 text-blue-600 hover:text-blue-800 text-sm truncate block"
									>
										{getSourceDomain(source.url)}
										<svg class="inline-block w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
										</svg>
									</a>
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
