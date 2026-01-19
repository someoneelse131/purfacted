<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	interface Fact {
		id: string;
		title: string;
		body: string;
		status: string;
		createdAt: string;
		user: {
			id: string;
			firstName: string;
			lastName: string;
			userType: string;
		};
		category: { id: string; name: string } | null;
		sources: Array<{ id: string; url: string; type: string }>;
	}

	let facts: Fact[] = [];
	let total = 0;
	let pages = 0;
	let loading = true;
	let error = '';

	// Filters
	let search = '';
	let status = '';
	let sortBy = 'newest';
	let currentPage = 1;

	// Status badge colors
	const statusColors: Record<string, string> = {
		SUBMITTED: 'bg-gray-100 text-gray-800',
		IN_REVIEW: 'bg-yellow-100 text-yellow-800',
		PROVEN: 'bg-green-100 text-green-800',
		DISPROVEN: 'bg-red-100 text-red-800',
		CONTROVERSIAL: 'bg-orange-100 text-orange-800',
		UNDER_VETO_REVIEW: 'bg-purple-100 text-purple-800'
	};

	// User type badge colors
	const userTypeColors: Record<string, string> = {
		VERIFIED: 'bg-blue-100 text-blue-800',
		EXPERT: 'bg-green-100 text-green-800',
		PHD: 'bg-purple-100 text-purple-800',
		ORGANIZATION: 'bg-yellow-100 text-yellow-800',
		MODERATOR: 'bg-red-100 text-red-800'
	};

	async function loadFacts() {
		loading = true;
		error = '';

		try {
			const params = new URLSearchParams();
			params.set('page', currentPage.toString());
			params.set('limit', '20');
			if (search) params.set('search', search);
			if (status) params.set('status', status);
			params.set('sortBy', sortBy);

			const response = await fetch(`/api/facts?${params}`);
			const data = await response.json();

			if (data.success) {
				facts = data.data.facts;
				total = data.data.total;
				pages = data.data.pages;
			} else {
				error = 'Failed to load facts';
			}
		} catch (err) {
			error = 'Error loading facts';
			console.error(err);
		} finally {
			loading = false;
		}
	}

	function handleSearch() {
		currentPage = 1;
		loadFacts();
	}

	function changePage(newPage: number) {
		currentPage = newPage;
		loadFacts();
	}

	function truncate(text: string, length: number): string {
		if (text.length <= length) return text;
		return text.slice(0, length) + '...';
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	onMount(() => {
		loadFacts();
	});
</script>

<svelte:head>
	<title>Facts | PurFacted</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
		<!-- Header -->
		<div class="mb-8">
			<h1 class="text-3xl font-bold text-gray-900">Facts</h1>
			<p class="mt-2 text-gray-600">Browse and search community-verified facts</p>
		</div>

		<!-- Filters -->
		<div class="bg-white rounded-lg shadow p-4 mb-6">
			<div class="flex flex-col sm:flex-row gap-4">
				<!-- Search -->
				<div class="flex-1">
					<label for="search" class="sr-only">Search</label>
					<div class="relative">
						<input
							type="text"
							id="search"
							bind:value={search}
							on:keyup={(e) => e.key === 'Enter' && handleSearch()}
							placeholder="Search facts..."
							class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						/>
						<div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
							<svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
							</svg>
						</div>
					</div>
				</div>

				<!-- Status Filter -->
				<div class="w-full sm:w-48">
					<select
						bind:value={status}
						on:change={handleSearch}
						class="w-full py-2 px-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					>
						<option value="">All Status</option>
						<option value="SUBMITTED">Submitted</option>
						<option value="PROVEN">Proven</option>
						<option value="DISPROVEN">Disproven</option>
						<option value="CONTROVERSIAL">Controversial</option>
					</select>
				</div>

				<!-- Sort -->
				<div class="w-full sm:w-48">
					<select
						bind:value={sortBy}
						on:change={handleSearch}
						class="w-full py-2 px-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					>
						<option value="newest">Newest First</option>
						<option value="oldest">Oldest First</option>
					</select>
				</div>

				<!-- Search Button -->
				<button
					on:click={handleSearch}
					class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
				>
					Search
				</button>
			</div>
		</div>

		<!-- Results Count -->
		<div class="mb-4 text-gray-600">
			{#if !loading}
				<span>Showing {facts.length} of {total} facts</span>
			{/if}
		</div>

		<!-- Facts List -->
		{#if loading}
			<div class="text-center py-12">
				<div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
				<p class="mt-2 text-gray-600">Loading facts...</p>
			</div>
		{:else if error}
			<div class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
				{error}
			</div>
		{:else if facts.length === 0}
			<div class="bg-white rounded-lg shadow p-8 text-center">
				<p class="text-gray-500">No facts found</p>
				<a href="/facts/new" class="mt-4 inline-block text-blue-600 hover:text-blue-800">
					Submit a new fact
				</a>
			</div>
		{:else}
			<div class="space-y-4">
				{#each facts as fact}
					<a
						href="/facts/{fact.id}"
						class="block bg-white rounded-lg shadow hover:shadow-md transition-shadow"
					>
						<div class="p-6">
							<div class="flex items-start justify-between">
								<div class="flex-1">
									<!-- Title -->
									<h2 class="text-xl font-semibold text-gray-900 hover:text-blue-600">
										{fact.title}
									</h2>

									<!-- Meta -->
									<div class="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-500">
										<!-- Status Badge -->
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

										<!-- Sources count -->
										<span>{fact.sources.length} source{fact.sources.length !== 1 ? 's' : ''}</span>
									</div>

									<!-- Body Preview -->
									<p class="mt-3 text-gray-600">
										{truncate(fact.body, 200)}
									</p>
								</div>
							</div>
						</div>
					</a>
				{/each}
			</div>

			<!-- Pagination -->
			{#if pages > 1}
				<div class="mt-8 flex justify-center">
					<nav class="inline-flex rounded-md shadow-sm -space-x-px">
						<!-- Previous -->
						<button
							on:click={() => changePage(currentPage - 1)}
							disabled={currentPage === 1}
							class="relative inline-flex items-center px-3 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							Previous
						</button>

						<!-- Page numbers -->
						{#each Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1) as pageNum}
							<button
								on:click={() => changePage(pageNum)}
								class="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium {currentPage === pageNum ? 'bg-blue-50 text-blue-600 border-blue-500' : 'bg-white text-gray-700 hover:bg-gray-50'}"
							>
								{pageNum}
							</button>
						{/each}

						<!-- Next -->
						<button
							on:click={() => changePage(currentPage + 1)}
							disabled={currentPage === pages}
							class="relative inline-flex items-center px-3 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							Next
						</button>
					</nav>
				</div>
			{/if}
		{/if}
	</div>
</div>
