<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children, data } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="flex min-h-screen flex-col bg-slate-50">
	<header class="border-b border-slate-200 bg-white">
		<nav class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
			<div class="flex items-center gap-6">
				<a href="/" class="text-lg font-bold text-slate-900">PurFacted</a>
				<a href="/facts" class="text-sm text-slate-700 hover:text-slate-900">Facts</a>
				<a href="/categories" class="text-sm text-slate-700 hover:text-slate-900">Categories</a>
				<a href="/review" class="text-sm text-slate-700 hover:text-slate-900">Review Hub</a>
				{#if data.user}
					<a href="/submit" class="text-sm text-slate-700 hover:text-slate-900">Submit</a>
				{/if}
			</div>
			<div class="flex items-center gap-4 text-sm">
				{#if data.user}
					<a href="/account" class="text-slate-700 hover:text-slate-900">{data.user.username}</a>
					<form method="POST" action="/logout">
						<button type="submit" class="text-slate-500 hover:text-slate-900">Log out</button>
					</form>
				{:else}
					<a href="/login" class="text-slate-700 hover:text-slate-900">Log in</a>
					<a
						href="/register"
						class="rounded-md bg-slate-900 px-3 py-1.5 text-white hover:bg-slate-700"
					>
						Sign up
					</a>
				{/if}
			</div>
		</nav>
	</header>
	{#if data.user?.bannedUntil && new Date(data.user.bannedUntil) > new Date()}
		<div class="border-b border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-800">
			Your account is banned and read-only{data.user.banReason
				? ` (reason: ${data.user.banReason})`
				: ''}.
			{#if new Date(data.user.bannedUntil).getFullYear() > 9000}
				This ban is permanent.
			{:else}
				The ban ends on {new Date(data.user.bannedUntil).toLocaleString('en-GB')}.
			{/if}
		</div>
	{/if}
	<main class="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
		{@render children()}
	</main>
</div>
