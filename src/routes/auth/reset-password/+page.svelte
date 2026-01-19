<script lang="ts">
	import { page } from '$app/stores';

	let password = '';
	let confirmPassword = '';
	let loading = false;
	let error = '';
	let success = false;

	$: token = $page.url.searchParams.get('token') || '';

	async function handleSubmit() {
		error = '';

		if (!token) {
			error = 'Invalid reset link. Please request a new password reset.';
			return;
		}

		if (password !== confirmPassword) {
			error = 'Passwords do not match';
			return;
		}

		loading = true;

		try {
			const response = await fetch('/api/auth/reset-password', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					token,
					password
				})
			});

			const data = await response.json();

			if (!response.ok) {
				error = data.error || 'Failed to reset password';
				return;
			}

			success = true;
		} catch (err) {
			error = 'An unexpected error occurred. Please try again.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Reset Password - PurFacted</title>
</svelte:head>

<main class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
	<div class="max-w-md w-full space-y-8">
		<div>
			<h1 class="text-3xl font-bold text-center text-gray-900">Reset Password</h1>
			<p class="mt-2 text-center text-gray-600">Enter your new password below.</p>
		</div>

		{#if success}
			<div class="bg-green-50 border border-green-200 rounded-lg p-4">
				<h2 class="text-green-800 font-medium">Password Reset Successful!</h2>
				<p class="text-green-700 mt-1">
					Your password has been reset. You can now log in with your new password.
				</p>
				<a
					href="/auth/login"
					class="inline-block mt-4 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium"
				>
					Sign In
				</a>
			</div>
		{:else if !token}
			<div class="bg-red-50 border border-red-200 rounded-lg p-4">
				<h2 class="text-red-800 font-medium">Invalid Reset Link</h2>
				<p class="text-red-700 mt-1">
					This password reset link is invalid or has expired. Please request a new one.
				</p>
				<a
					href="/auth/forgot-password"
					class="inline-block mt-4 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium"
				>
					Request New Link
				</a>
			</div>
		{:else}
			<form on:submit|preventDefault={handleSubmit} class="mt-8 space-y-6">
				{#if error}
					<div class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
						{error}
					</div>
				{/if}

				<div class="space-y-4">
					<div>
						<label for="password" class="block text-sm font-medium text-gray-700">
							New Password
						</label>
						<input
							id="password"
							type="password"
							bind:value={password}
							required
							minlength="8"
							class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
						/>
						<p class="mt-1 text-xs text-gray-500">
							Min 8 characters, 1 number, 1 special character
						</p>
					</div>

					<div>
						<label for="confirmPassword" class="block text-sm font-medium text-gray-700">
							Confirm New Password
						</label>
						<input
							id="confirmPassword"
							type="password"
							bind:value={confirmPassword}
							required
							minlength="8"
							class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
						/>
					</div>
				</div>

				<button
					type="submit"
					disabled={loading}
					class="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
				>
					{#if loading}
						Resetting Password...
					{:else}
						Reset Password
					{/if}
				</button>
			</form>
		{/if}
	</div>
</main>
