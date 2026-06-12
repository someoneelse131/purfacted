<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children, data } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="flex min-h-screen flex-col bg-slate-50">
	<header class="border-b border-slate-200 bg-white">
		<nav class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
			<a href="/" class="text-lg font-bold text-slate-900">PurFacted</a>
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
	<main class="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
		{@render children()}
	</main>
</div>
