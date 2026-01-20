<script lang="ts">
	import { onMount } from 'svelte';

	interface Category {
		id: string;
		name: string;
		_count?: { facts: number };
		aliases?: Array<{ alias: string }>;
	}

	let categories: Category[] = [];
	let loading = true;
	let error = '';

	async function loadCategories() {
		try {
			const res = await fetch('/api/categories');
			const data = await res.json();
			if (data.success) {
				categories = data.data.categories || data.data || [];
			} else {
				error = 'Failed to load categories';
			}
		} catch (err) {
			error = 'Error loading categories';
			console.error(err);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		loadCategories();
	});
</script>

<svelte:head>
	<title>Categories | PurFacted</title>
</svelte:head>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
	<div class="mb-8">
		<h1 class="text-3xl font-bold text-gray-900">Categories</h1>
		<p class="mt-2 text-gray-600">Browse facts by category</p>
	</div>

	{#if loading}
		<div class="text-center py-12">
			<div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
			<p class="mt-2 text-gray-600">Loading categories...</p>
		</div>
	{:else if error}
		<div class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
			{error}
		</div>
	{:else if categories.length === 0}
		<div class="bg-white rounded-lg shadow p-8 text-center">
			<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
			</svg>
			<p class="mt-4 text-gray-500">No categories found</p>
			<p class="mt-2 text-sm text-gray-400">Categories will appear here once facts are submitted</p>
		</div>
	{:else}
		<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
			{#each categories as category}
				<a
					href="/facts?category={category.id}"
					class="bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow"
				>
					<h2 class="text-xl font-semibold text-gray-900 mb-2">{category.name}</h2>

					{#if category._count?.facts !== undefined}
						<p class="text-sm text-gray-500">
							{category._count.facts} fact{category._count.facts !== 1 ? 's' : ''}
						</p>
					{/if}

					{#if category.aliases && category.aliases.length > 0}
						<div class="mt-3 flex flex-wrap gap-1">
							{#each category.aliases.slice(0, 3) as alias}
								<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
									{alias.alias}
								</span>
							{/each}
							{#if category.aliases.length > 3}
								<span class="text-xs text-gray-400">+{category.aliases.length - 3} more</span>
							{/if}
						</div>
					{/if}
				</a>
			{/each}
		</div>
	{/if}
</div>
