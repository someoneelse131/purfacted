<script lang="ts">
	import { goto } from '$app/navigation';
	import Alert from '$lib/components/Alert.svelte';
	import Button from '$lib/components/Button.svelte';

	let title = '';
	let content = '';
	let categoryId = '';
	let sourceUrls: string[] = [''];

	let categories: Array<{ id: string; name: string }> = [];
	let loading = false;
	let error = '';
	let grammarSuggestions = '';
	let checkingGrammar = false;

	// Load categories on mount
	import { onMount } from 'svelte';
	onMount(async () => {
		try {
			const res = await fetch('/api/categories');
			const data = await res.json();
			if (data.success) {
				categories = data.data.categories || data.data || [];
			}
		} catch (err) {
			console.error('Failed to load categories:', err);
		}
	});

	function addSource() {
		sourceUrls = [...sourceUrls, ''];
	}

	function removeSource(index: number) {
		sourceUrls = sourceUrls.filter((_, i) => i !== index);
	}

	async function checkGrammar() {
		if (!content.trim()) return;

		checkingGrammar = true;
		try {
			const res = await fetch('/api/facts/grammar-check', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: content })
			});
			const data = await res.json();
			if (data.success && data.data.suggestions) {
				grammarSuggestions = data.data.suggestions;
			} else {
				grammarSuggestions = '';
			}
		} catch (err) {
			console.error('Grammar check failed:', err);
		} finally {
			checkingGrammar = false;
		}
	}

	async function handleSubmit() {
		error = '';

		if (!title.trim()) {
			error = 'Please enter a title';
			return;
		}
		if (!content.trim()) {
			error = 'Please enter the fact content';
			return;
		}

		const validSources = sourceUrls.filter((url) => url.trim());
		if (validSources.length === 0) {
			error = 'Please add at least one source';
			return;
		}

		loading = true;

		try {
			const res = await fetch('/api/facts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: title.trim(),
					content: content.trim(),
					categoryId: categoryId || undefined,
					sourceUrls: validSources
				})
			});

			const data = await res.json();

			if (data.success) {
				goto(`/facts/${data.data.id}`);
			} else {
				error = data.error || 'Failed to create fact';
			}
		} catch (err) {
			error = 'An error occurred. Please try again.';
			console.error(err);
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Submit a Fact | PurFacted</title>
</svelte:head>

<div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
	<div class="mb-8">
		<h1 class="text-3xl font-bold text-gray-900">Submit a New Fact</h1>
		<p class="mt-2 text-gray-600">Share a claim with the community for verification</p>
	</div>

	{#if error}
		<div class="mb-6">
			<Alert type="error" message={error} dismissible />
		</div>
	{/if}

	<form on:submit|preventDefault={handleSubmit} class="space-y-6">
		<!-- Title -->
		<div>
			<label for="title" class="block text-sm font-medium text-gray-700 mb-1">
				Title <span class="text-red-500">*</span>
			</label>
			<input
				type="text"
				id="title"
				bind:value={title}
				maxlength="200"
				placeholder="A clear, concise statement of the fact"
				class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
			/>
			<p class="mt-1 text-sm text-gray-500">{title.length}/200 characters</p>
		</div>

		<!-- Content -->
		<div>
			<label for="content" class="block text-sm font-medium text-gray-700 mb-1">
				Description <span class="text-red-500">*</span>
			</label>
			<textarea
				id="content"
				bind:value={content}
				rows="6"
				maxlength="5000"
				placeholder="Provide detailed context, explanation, and evidence for this fact..."
				class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
			></textarea>
			<div class="mt-1 flex justify-between text-sm text-gray-500">
				<span>{content.length}/5000 characters</span>
				<button
					type="button"
					on:click={checkGrammar}
					disabled={checkingGrammar || !content.trim()}
					class="text-blue-600 hover:text-blue-800 disabled:text-gray-400"
				>
					{checkingGrammar ? 'Checking...' : 'Check Grammar'}
				</button>
			</div>
			{#if grammarSuggestions}
				<div class="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
					<strong class="text-yellow-800">Grammar suggestions:</strong>
					<p class="mt-1 text-yellow-700">{grammarSuggestions}</p>
				</div>
			{/if}
		</div>

		<!-- Category -->
		<div>
			<label for="category" class="block text-sm font-medium text-gray-700 mb-1">
				Category
			</label>
			<select
				id="category"
				bind:value={categoryId}
				class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
			>
				<option value="">Select a category (optional)</option>
				{#each categories as category}
					<option value={category.id}>{category.name}</option>
				{/each}
			</select>
		</div>

		<!-- Sources -->
		<div>
			<label class="block text-sm font-medium text-gray-700 mb-1">
				Sources <span class="text-red-500">*</span>
			</label>
			<p class="text-sm text-gray-500 mb-3">
				Add URLs to credible sources that support this fact
			</p>

			<div class="space-y-3">
				{#each sourceUrls as url, index}
					<div class="flex gap-2">
						<input
							type="url"
							bind:value={sourceUrls[index]}
							placeholder="https://example.com/article"
							class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						/>
						{#if sourceUrls.length > 1}
							<button
								type="button"
								on:click={() => removeSource(index)}
								class="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
							>
								<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
						{/if}
					</div>
				{/each}
			</div>

			<button
				type="button"
				on:click={addSource}
				class="mt-3 text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
			>
				<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				Add another source
			</button>
		</div>

		<!-- Submit -->
		<div class="flex gap-4 pt-4">
			<Button type="submit" {loading} fullWidth>
				{loading ? 'Submitting...' : 'Submit Fact'}
			</Button>
			<a
				href="/facts"
				class="flex-1 inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50"
			>
				Cancel
			</a>
		</div>
	</form>

	<!-- Guidelines -->
	<div class="mt-8 p-6 bg-gray-50 rounded-lg">
		<h3 class="font-semibold text-gray-900 mb-3">Submission Guidelines</h3>
		<ul class="space-y-2 text-sm text-gray-600">
			<li class="flex items-start gap-2">
				<svg class="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
				</svg>
				State facts clearly and objectively
			</li>
			<li class="flex items-start gap-2">
				<svg class="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
				</svg>
				Include credible, verifiable sources
			</li>
			<li class="flex items-start gap-2">
				<svg class="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
				</svg>
				Check for duplicates before submitting
			</li>
			<li class="flex items-start gap-2">
				<svg class="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
				</svg>
				Use proper grammar and spelling
			</li>
		</ul>
	</div>
</div>
