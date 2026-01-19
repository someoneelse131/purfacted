<script lang="ts">
	let email = '';
	let loading = false;
	let error = '';
	let success = false;

	async function handleSubmit() {
		error = '';
		loading = true;

		try {
			const response = await fetch('/api/auth/forgot-password', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ email })
			});

			const data = await response.json();

			if (!response.ok) {
				error = data.error || 'Failed to send reset email';
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
	<title>Forgot Password - PurFacted</title>
</svelte:head>

<main class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
	<div class="max-w-md w-full space-y-8">
		<div>
			<h1 class="text-3xl font-bold text-center text-gray-900">Forgot Password</h1>
			<p class="mt-2 text-center text-gray-600">
				Enter your email address and we'll send you a link to reset your password.
			</p>
		</div>

		{#if success}
			<div class="bg-green-50 border border-green-200 rounded-lg p-4">
				<h2 class="text-green-800 font-medium">Check Your Email</h2>
				<p class="text-green-700 mt-1">
					If an account with that email exists, we've sent you a password reset link. The link will
					expire in 1 hour.
				</p>
				<a
					href="/auth/login"
					class="inline-block mt-4 text-primary-600 hover:text-primary-700 font-medium"
				>
					Back to Login
				</a>
			</div>
		{:else}
			<form on:submit|preventDefault={handleSubmit} class="mt-8 space-y-6">
				{#if error}
					<div class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
						{error}
					</div>
				{/if}

				<div>
					<label for="email" class="block text-sm font-medium text-gray-700">Email Address</label>
					<input
						id="email"
						type="email"
						bind:value={email}
						required
						class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
					/>
				</div>

				<button
					type="submit"
					disabled={loading}
					class="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
				>
					{#if loading}
						Sending...
					{:else}
						Send Reset Link
					{/if}
				</button>

				<p class="text-center text-sm text-gray-600">
					Remember your password?
					<a href="/auth/login" class="text-primary-600 hover:text-primary-700 font-medium">
						Sign in
					</a>
				</p>
			</form>
		{/if}
	</div>
</main>
