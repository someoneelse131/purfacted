<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { toast } from '$lib/stores/toast';

	let email = '';
	let password = '';
	let rememberMe = false;
	let loading = false;
	let error = '';

	async function handleSubmit() {
		error = '';
		loading = true;

		try {
			const response = await fetch('/api/auth/login', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email,
					password,
					rememberMe
				})
			});

			const data = await response.json();

			if (!response.ok) {
				if (response.status === 429) {
					error = data.error || 'Too many login attempts. Please try again later.';
				} else if (data.code === 'EMAIL_NOT_VERIFIED') {
					error = 'Please verify your email address before logging in. Check your inbox for the verification link.';
				} else {
					error = data.error || 'Login failed';
				}
				return;
			}

			// Invalidate all data to refresh user state, then redirect
			await invalidateAll();
			toast.success('Welcome back!');
			goto('/');
		} catch (err) {
			error = 'An unexpected error occurred. Please try again.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Sign In - PurFacted</title>
</svelte:head>

<main class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
	<div class="max-w-md w-full space-y-8">
		<div>
			<h1 class="text-3xl font-bold text-center text-gray-900">Sign In</h1>
			<p class="mt-2 text-center text-gray-600">Welcome back to PurFacted</p>
		</div>

		<form on:submit|preventDefault={handleSubmit} class="mt-8 space-y-6">
			{#if error}
				<div class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
					{error}
				</div>
			{/if}

			<div class="space-y-4">
				<div>
					<label for="email" class="block text-sm font-medium text-gray-700">Email</label>
					<input
						id="email"
						type="email"
						bind:value={email}
						required
						class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
					/>
				</div>

				<div>
					<label for="password" class="block text-sm font-medium text-gray-700">Password</label>
					<input
						id="password"
						type="password"
						bind:value={password}
						required
						class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
					/>
				</div>

				<div class="flex items-center justify-between">
					<label class="flex items-center">
						<input
							type="checkbox"
							bind:checked={rememberMe}
							class="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
						/>
						<span class="ml-2 text-sm text-gray-600">Remember me for 30 days</span>
					</label>

					<a href="/auth/forgot-password" class="text-sm text-primary-600 hover:text-primary-700">
						Forgot password?
					</a>
				</div>
			</div>

			<button
				type="submit"
				disabled={loading}
				class="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
			>
				{#if loading}
					Signing in...
				{:else}
					Sign In
				{/if}
			</button>

			<p class="text-center text-sm text-gray-600">
				Don't have an account?
				<a href="/auth/register" class="text-primary-600 hover:text-primary-700 font-medium">
					Create one
				</a>
			</p>
		</form>
	</div>
</main>
