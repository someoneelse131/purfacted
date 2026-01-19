<script lang="ts">
	import { page } from '$app/stores';
	import NotificationBell from './NotificationBell.svelte';

	export let user: { id: string; firstName: string; userType: string } | null = null;

	let mobileMenuOpen = false;

	function toggleMobileMenu() {
		mobileMenuOpen = !mobileMenuOpen;
	}

	function closeMobileMenu() {
		mobileMenuOpen = false;
	}

	$: currentPath = $page.url.pathname;

	const navLinks = [
		{ href: '/facts', label: 'Facts' },
		{ href: '/categories', label: 'Categories' },
		{ href: '/debates', label: 'Debates' }
	];

	const userLinks = [
		{ href: '/user/profile', label: 'Profile' },
		{ href: '/user/settings', label: 'Settings' }
	];

	const modLinks = [{ href: '/moderation', label: 'Moderation' }];
</script>

<nav class="bg-white shadow-sm border-b sticky top-0 z-40">
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
		<div class="flex justify-between h-16">
			<!-- Logo & Desktop Nav -->
			<div class="flex">
				<div class="flex-shrink-0 flex items-center">
					<a href="/" class="text-xl font-bold text-blue-600">
						PurFacted
					</a>
				</div>

				<!-- Desktop Navigation -->
				<div class="hidden sm:ml-8 sm:flex sm:space-x-4">
					{#each navLinks as link}
						<a
							href={link.href}
							class="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors
								{currentPath.startsWith(link.href)
								? 'text-blue-600 bg-blue-50'
								: 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}"
						>
							{link.label}
						</a>
					{/each}
					{#if user?.userType === 'MODERATOR'}
						{#each modLinks as link}
							<a
								href={link.href}
								class="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors
									{currentPath.startsWith(link.href)
									? 'text-blue-600 bg-blue-50'
									: 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}"
							>
								{link.label}
							</a>
						{/each}
					{/if}
				</div>
			</div>

			<!-- Right side -->
			<div class="flex items-center gap-2">
				{#if user}
					<!-- Notifications -->
					<div class="hidden sm:block">
						<NotificationBell />
					</div>

					<!-- User Menu (Desktop) -->
					<div class="hidden sm:ml-4 sm:flex sm:items-center">
						<div class="relative group">
							<button
								class="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-50"
							>
								<span class="max-w-[120px] truncate">{user.firstName}</span>
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M19 9l-7 7-7-7"
									/>
								</svg>
							</button>

							<!-- Dropdown -->
							<div
								class="absolute right-0 w-48 mt-1 py-1 bg-white rounded-md shadow-lg border opacity-0 invisible
									group-hover:opacity-100 group-hover:visible transition-all duration-200"
							>
								{#each userLinks as link}
									<a
										href={link.href}
										class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
									>
										{link.label}
									</a>
								{/each}
								<hr class="my-1" />
								<form method="POST" action="/api/auth/logout">
									<button
										type="submit"
										class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
									>
										Sign out
									</button>
								</form>
							</div>
						</div>
					</div>
				{:else}
					<!-- Auth buttons (Desktop) -->
					<div class="hidden sm:flex sm:items-center sm:gap-2">
						<a
							href="/auth/login"
							class="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
						>
							Sign in
						</a>
						<a
							href="/auth/register"
							class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
						>
							Sign up
						</a>
					</div>
				{/if}

				<!-- Mobile menu button -->
				<button
					type="button"
					class="sm:hidden inline-flex items-center justify-center p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100"
					on:click={toggleMobileMenu}
				>
					<span class="sr-only">Open menu</span>
					{#if mobileMenuOpen}
						<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					{:else}
						<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M4 6h16M4 12h16M4 18h16"
							/>
						</svg>
					{/if}
				</button>
			</div>
		</div>
	</div>

	<!-- Mobile menu -->
	{#if mobileMenuOpen}
		<div class="sm:hidden border-t">
			<div class="pt-2 pb-3 space-y-1 px-4">
				{#each navLinks as link}
					<a
						href={link.href}
						on:click={closeMobileMenu}
						class="block px-3 py-2 rounded-md text-base font-medium
							{currentPath.startsWith(link.href)
							? 'text-blue-600 bg-blue-50'
							: 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}"
					>
						{link.label}
					</a>
				{/each}
				{#if user?.userType === 'MODERATOR'}
					{#each modLinks as link}
						<a
							href={link.href}
							on:click={closeMobileMenu}
							class="block px-3 py-2 rounded-md text-base font-medium
								{currentPath.startsWith(link.href)
								? 'text-blue-600 bg-blue-50'
								: 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}"
						>
							{link.label}
						</a>
					{/each}
				{/if}
			</div>

			{#if user}
				<div class="pt-4 pb-3 border-t">
					<div class="px-4 mb-3">
						<p class="text-sm font-medium text-gray-900">{user.firstName}</p>
						<p class="text-xs text-gray-500 capitalize">{user.userType.toLowerCase()}</p>
					</div>
					<div class="space-y-1 px-4">
						{#each userLinks as link}
							<a
								href={link.href}
								on:click={closeMobileMenu}
								class="block px-3 py-2 rounded-md text-base font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50"
							>
								{link.label}
							</a>
						{/each}
						<form method="POST" action="/api/auth/logout">
							<button
								type="submit"
								class="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50"
							>
								Sign out
							</button>
						</form>
					</div>
				</div>
			{:else}
				<div class="pt-4 pb-3 border-t px-4 space-y-2">
					<a
						href="/auth/login"
						on:click={closeMobileMenu}
						class="block w-full text-center px-4 py-2 text-sm font-medium text-gray-700 border rounded-md hover:bg-gray-50"
					>
						Sign in
					</a>
					<a
						href="/auth/register"
						on:click={closeMobileMenu}
						class="block w-full text-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
					>
						Sign up
					</a>
				</div>
			{/if}
		</div>
	{/if}
</nav>
