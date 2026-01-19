<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	let loading = true;
	let success = false;
	let error = '';

	onMount(async () => {
		const token = $page.url.searchParams.get('token');

		if (!token) {
			error = 'No verification token provided';
			loading = false;
			return;
		}

		try {
			const response = await fetch('/api/auth/verify', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ token })
			});

			const data = await response.json();

			if (!response.ok) {
				error = data.error || 'Verification failed';
				return;
			}

			success = true;
		} catch (err) {
			error = 'An unexpected error occurred. Please try again.';
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head>
	<title>Verify Email - PurFacted</title>
</svelte:head>

<main class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
	<div class="max-w-md w-full space-y-8 text-center">
		{#if loading}
			<div>
				<h1 class="text-2xl font-bold text-gray-900">Verifying your email...</h1>
				<p class="mt-2 text-gray-600">Please wait while we verify your email address.</p>
			</div>
		{:else if success}
			<div class="bg-green-50 border border-green-200 rounded-lg p-6">
				<h1 class="text-2xl font-bold text-green-800">Email Verified!</h1>
				<p class="mt-2 text-green-700">Your email has been verified successfully.</p>
				<a
					href="/auth/login"
					class="inline-block mt-4 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium"
				>
					Sign In
				</a>
			</div>
		{:else}
			<div class="bg-red-50 border border-red-200 rounded-lg p-6">
				<h1 class="text-2xl font-bold text-red-800">Verification Failed</h1>
				<p class="mt-2 text-red-700">{error}</p>
				<a
					href="/auth/register"
					class="inline-block mt-4 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium"
				>
					Register Again
				</a>
			</div>
		{/if}
	</div>
</main>
