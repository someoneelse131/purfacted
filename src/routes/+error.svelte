<script lang="ts">
	import { page } from '$app/stores';
</script>

<svelte:head>
	<title>Error {$page.status} | PurFacted</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 flex flex-col justify-center items-center px-4">
	<div class="max-w-md w-full text-center">
		<div class="mb-8">
			<span class="text-6xl font-bold text-gray-300">{$page.status}</span>
		</div>

		<h1 class="text-2xl font-semibold text-gray-900 mb-4">
			{#if $page.status === 404}
				Page Not Found
			{:else if $page.status === 403}
				Access Denied
			{:else if $page.status === 401}
				Authentication Required
			{:else if $page.status === 500}
				Server Error
			{:else}
				Something Went Wrong
			{/if}
		</h1>

		<p class="text-gray-600 mb-8">
			{#if $page.status === 404}
				The page you're looking for doesn't exist or has been moved.
			{:else if $page.status === 403}
				You don't have permission to access this resource.
			{:else if $page.status === 401}
				Please log in to continue.
			{:else if $page.status === 500}
				An unexpected error occurred. Our team has been notified.
			{:else if $page.error?.message}
				{$page.error.message}
			{:else}
				An unexpected error occurred. Please try again.
			{/if}
		</p>

		<div class="flex flex-col sm:flex-row gap-4 justify-center">
			<a
				href="/"
				class="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
			>
				Go Home
			</a>

			<button
				on:click={() => history.back()}
				class="inline-flex items-center justify-center px-6 py-3 border border-gray-300 text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
			>
				Go Back
			</button>
		</div>

		{#if $page.status === 401}
			<div class="mt-6">
				<a href="/auth/login" class="text-blue-600 hover:text-blue-500">
					Sign in to your account
				</a>
			</div>
		{/if}
	</div>
</div>
