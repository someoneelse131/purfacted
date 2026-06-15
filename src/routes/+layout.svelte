<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import NotificationBell from '$lib/components/NotificationBell.svelte';

	let { children, data } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="flex min-h-screen flex-col bg-canvas">
	<header class="border-b border-line bg-surface">
		<nav
			class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3"
		>
			<div class="flex flex-wrap items-center gap-x-6 gap-y-2">
				<a href="/" class="font-serif text-xl font-semibold tracking-tight text-ink">PurFacted</a>
				{#if data.user}
					<a href="/home" class="text-sm text-ink-muted hover:text-ink">Home</a>
				{/if}
				<a href="/facts" class="text-sm text-ink-muted hover:text-ink">Facts</a>
				<a href="/review" class="text-sm text-ink-muted hover:text-ink">Review Hub</a>
				<a href="/categories" class="text-sm text-ink-muted hover:text-ink">Categories</a>
				<a href="/leaderboard" class="text-sm text-ink-muted hover:text-ink">Leaderboard</a>
			</div>
			<div class="flex items-center gap-4 text-sm">
				{#if data.user}
					<a href="/submit" class="btn btn-sm btn-primary">Submit</a>
					<NotificationBell
						initialItems={data.notifications.items}
						initialUnread={data.notifications.unread}
					/>
					<a href="/account" class="text-ink-muted hover:text-ink">{data.user.username}</a>
					<form method="POST" action="/logout">
						<button type="submit" class="text-ink-faint hover:text-ink">Log out</button>
					</form>
				{:else}
					<a href="/login" class="text-ink-muted hover:text-ink">Log in</a>
					<a href="/register" class="btn btn-sm btn-primary">Sign up</a>
				{/if}
			</div>
		</nav>
	</header>
	{#if data.user?.bannedUntil && new Date(data.user.bannedUntil) > new Date()}
		<div
			class="border-b border-line bg-status-refuted-soft px-4 py-3 text-center text-sm text-status-refuted-strong"
		>
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
	<main class="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
		{@render children()}
	</main>
	<footer class="border-t border-line">
		<div
			class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-6 text-xs text-ink-faint"
		>
			<p>PurFacted - community fact verification</p>
			<nav aria-label="Footer" class="flex flex-wrap gap-x-5 gap-y-1">
				<a href="#top" class="hover:text-ink">About</a>
				<a href="#top" class="hover:text-ink">Terms</a>
				<a href="#top" class="hover:text-ink">Privacy</a>
				<a href="#top" class="hover:text-ink">Contact</a>
			</nav>
		</div>
	</footer>
</div>
