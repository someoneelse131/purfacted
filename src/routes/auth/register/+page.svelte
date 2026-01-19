<script lang="ts">
	let firstName = '';
	let lastName = '';
	let email = '';
	let password = '';
	let confirmPassword = '';
	let loading = false;
	let error = '';
	let success = false;
	let fieldErrors: Record<string, string[]> = {};

	async function handleSubmit() {
		error = '';
		fieldErrors = {};

		// Client-side validation
		if (password !== confirmPassword) {
			error = 'Passwords do not match';
			return;
		}

		loading = true;

		try {
			const response = await fetch('/api/auth/register', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					firstName,
					lastName,
					email,
					password
				})
			});

			const data = await response.json();

			if (!response.ok) {
				if (data.details) {
					fieldErrors = data.details;
				}
				error = data.error || 'Registration failed';
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
	<title>Register - PurFacted</title>
</svelte:head>

<main class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
	<div class="max-w-md w-full space-y-8">
		<div>
			<h1 class="text-3xl font-bold text-center text-gray-900">Create Account</h1>
			<p class="mt-2 text-center text-gray-600">Join the community-driven fact verification platform</p>
		</div>

		{#if success}
			<div class="bg-green-50 border border-green-200 rounded-lg p-4">
				<h2 class="text-green-800 font-medium">Registration Successful!</h2>
				<p class="text-green-700 mt-1">
					Please check your email to verify your account. The verification link will expire in 24
					hours.
				</p>
				<a href="/auth/login" class="inline-block mt-4 text-primary-600 hover:text-primary-700 font-medium">
					Go to Login
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
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label for="firstName" class="block text-sm font-medium text-gray-700">
								First Name
							</label>
							<input
								id="firstName"
								type="text"
								bind:value={firstName}
								required
								class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
								class:border-red-500={fieldErrors.firstName}
							/>
							{#if fieldErrors.firstName}
								<p class="mt-1 text-sm text-red-600">{fieldErrors.firstName[0]}</p>
							{/if}
						</div>

						<div>
							<label for="lastName" class="block text-sm font-medium text-gray-700">
								Last Name
							</label>
							<input
								id="lastName"
								type="text"
								bind:value={lastName}
								required
								class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
								class:border-red-500={fieldErrors.lastName}
							/>
							{#if fieldErrors.lastName}
								<p class="mt-1 text-sm text-red-600">{fieldErrors.lastName[0]}</p>
							{/if}
						</div>
					</div>

					<div>
						<label for="email" class="block text-sm font-medium text-gray-700">Email</label>
						<input
							id="email"
							type="email"
							bind:value={email}
							required
							class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
							class:border-red-500={fieldErrors.email}
						/>
						{#if fieldErrors.email}
							<p class="mt-1 text-sm text-red-600">{fieldErrors.email[0]}</p>
						{/if}
					</div>

					<div>
						<label for="password" class="block text-sm font-medium text-gray-700">Password</label>
						<input
							id="password"
							type="password"
							bind:value={password}
							required
							minlength="8"
							class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
							class:border-red-500={fieldErrors.password}
						/>
						<p class="mt-1 text-xs text-gray-500">
							Min 8 characters, 1 number, 1 special character
						</p>
						{#if fieldErrors.password}
							<p class="mt-1 text-sm text-red-600">{fieldErrors.password[0]}</p>
						{/if}
					</div>

					<div>
						<label for="confirmPassword" class="block text-sm font-medium text-gray-700">
							Confirm Password
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
						Creating Account...
					{:else}
						Create Account
					{/if}
				</button>

				<p class="text-center text-sm text-gray-600">
					Already have an account?
					<a href="/auth/login" class="text-primary-600 hover:text-primary-700 font-medium">
						Sign in
					</a>
				</p>
			</form>
		{/if}
	</div>
</main>
