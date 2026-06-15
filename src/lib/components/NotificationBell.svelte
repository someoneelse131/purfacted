<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { invalidateAll } from '$app/navigation';
	import type { NotificationView } from '$lib/server/services/notifications';

	let { initialItems, initialUnread }: { initialItems: NotificationView[]; initialUnread: number } =
		$props();

	// Server-rendered props are the baseline (refreshed by invalidateAll on
	// navigation). Live overlays carry SSE pushes and optimistic read state so
	// nothing here re-captures a prop into local state.
	let liveItems = $state<NotificationView[]>([]);
	let liveUnread = $state<number | null>(null);
	const readIds = new SvelteSet<string>();
	let open = $state(false);

	const unread = $derived(liveUnread ?? initialUnread);
	const items = $derived.by(() => {
		const seen: Record<string, boolean> = {};
		const merged: NotificationView[] = [];
		for (const i of [...liveItems, ...initialItems]) {
			if (seen[i.id]) continue;
			seen[i.id] = true;
			merged.push(readIds.has(i.id) ? { ...i, read: true } : i);
		}
		return merged.slice(0, 20);
	});

	onMount(() => {
		const source = new EventSource('/api/notifications/stream');
		source.addEventListener('notification', (event) => {
			try {
				const { item, unread: pushedUnread } = JSON.parse((event as MessageEvent).data) as {
					item: NotificationView;
					unread: number;
				};
				liveItems = [item, ...liveItems.filter((i) => i.id !== item.id)];
				liveUnread = pushedUnread;
			} catch {
				// malformed event - ignore
			}
		});
		source.onerror = () => {
			// the browser auto-reconnects EventSource; nothing to do
		};
		return () => source.close();
	});

	async function markRead(id: string) {
		const res = await fetch('/api/notifications', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ id })
		});
		if (res.ok) {
			const { unread: u } = (await res.json()) as { unread: number };
			liveUnread = u;
			readIds.add(id);
		}
	}

	async function markAll() {
		const res = await fetch('/api/notifications', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ all: true })
		});
		if (res.ok) {
			liveUnread = 0;
			for (const i of items) readIds.add(i.id);
		}
	}

	async function go(item: NotificationView) {
		open = false;
		if (!item.read) await markRead(item.id);
		await invalidateAll();
	}
</script>

<div class="relative">
	<button
		type="button"
		class="relative flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-canvas hover:text-ink"
		aria-label="Notifications"
		aria-haspopup="true"
		aria-expanded={open}
		data-testid="notif-bell"
		onclick={() => (open = !open)}
	>
		<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
			/>
		</svg>
		{#if unread > 0}
			<span
				class="absolute -top-0.5 -right-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] leading-[18px] font-semibold text-white"
				data-testid="notif-count"
			>
				{unread > 99 ? '99+' : unread}
			</span>
		{/if}
	</button>

	{#if open}
		<div
			class="card absolute right-0 z-20 mt-2 w-80 p-0 shadow-lg"
			role="menu"
			data-testid="notif-dropdown"
		>
			<div class="flex items-center justify-between border-b border-line px-4 py-2">
				<span class="text-sm font-semibold text-ink">Notifications</span>
				{#if items.some((i) => !i.read)}
					<button
						type="button"
						class="text-xs text-primary hover:underline"
						data-testid="notif-mark-all"
						onclick={markAll}
					>
						Mark all read
					</button>
				{/if}
			</div>
			{#if items.length === 0}
				<p class="px-4 py-6 text-center text-sm text-ink-faint">No notifications yet.</p>
			{:else}
				<ul class="max-h-96 overflow-y-auto">
					{#each items as item (item.id)}
						<li
							class="border-b border-line/60 last:border-0 {item.read ? '' : 'bg-primary-soft/40'}"
							data-testid="notif-item"
						>
							<a
								href={item.link}
								class="block px-4 py-3 text-sm hover:bg-canvas"
								onclick={() => go(item)}
							>
								<span class="text-ink">{item.summary}</span>
								{#if !item.read}
									<span class="ml-1 inline-block h-2 w-2 rounded-full bg-primary align-middle"
									></span>
								{/if}
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>
