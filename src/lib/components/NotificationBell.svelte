<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	interface Notification {
		id: string;
		type: string;
		title: string;
		body: string;
		data?: Record<string, unknown>;
		readAt: string | null;
		createdAt: string;
	}

	let unreadCount = 0;
	let notifications: Notification[] = [];
	let showDropdown = false;
	let eventSource: EventSource | null = null;
	let loading = false;

	// Notification type to route mapping
	const notificationRoutes: Record<string, (data?: Record<string, unknown>) => string> = {
		FACT_REPLY: (data) => `/facts/${data?.factId}`,
		FACT_DISPUTED: (data) => `/facts/${data?.factId}`,
		VETO_RECEIVED: (data) => `/facts/${data?.factId}`,
		VERIFICATION_RESULT: () => '/user/settings',
		ORG_COMMENT: (data) => `/facts/${data?.factId}`,
		DEBATE_REQUEST: (data) => `/debates/${data?.debateId}`,
		DEBATE_PUBLISHED: (data) => `/debates/${data?.debateId}`,
		MODERATOR_STATUS: () => '/user/profile',
		FACT_STATUS: (data) => `/facts/${data?.factId}`,
		TRUST_LOST: () => '/user/profile',
		TRUST_GAINED: () => '/user/profile'
	};

	function getNotificationLink(notification: Notification): string {
		const routeFn = notificationRoutes[notification.type];
		if (routeFn) {
			return routeFn(notification.data as Record<string, unknown>);
		}
		return '/';
	}

	async function fetchNotifications() {
		try {
			loading = true;
			const response = await fetch('/api/notifications?limit=10');
			const result = await response.json();
			if (result.success) {
				notifications = result.data.notifications;
				unreadCount = result.data.unreadCount;
			}
		} catch (err) {
			console.error('Error fetching notifications:', err);
		} finally {
			loading = false;
		}
	}

	async function markAsRead(notificationId: string) {
		try {
			const response = await fetch(`/api/notifications/${notificationId}`, {
				method: 'PATCH'
			});
			if (response.ok) {
				notifications = notifications.map((n) =>
					n.id === notificationId ? { ...n, readAt: new Date().toISOString() } : n
				);
				unreadCount = Math.max(0, unreadCount - 1);
			}
		} catch (err) {
			console.error('Error marking as read:', err);
		}
	}

	async function markAllAsRead() {
		try {
			const response = await fetch('/api/notifications', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'mark_all_read' })
			});
			if (response.ok) {
				notifications = notifications.map((n) => ({
					...n,
					readAt: n.readAt || new Date().toISOString()
				}));
				unreadCount = 0;
			}
		} catch (err) {
			console.error('Error marking all as read:', err);
		}
	}

	function connectSSE() {
		if (!browser) return;

		eventSource = new EventSource('/api/notifications/stream');

		eventSource.addEventListener('count', (event) => {
			const data = JSON.parse(event.data);
			unreadCount = data.unreadCount;
		});

		eventSource.addEventListener('notification', (event) => {
			const notification = JSON.parse(event.data);
			// Add new notification to the beginning
			notifications = [notification, ...notifications.slice(0, 9)];
		});

		eventSource.addEventListener('error', () => {
			// Reconnect on error
			eventSource?.close();
			setTimeout(connectSSE, 5000);
		});
	}

	function toggleDropdown() {
		showDropdown = !showDropdown;
		if (showDropdown) {
			fetchNotifications();
		}
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.notification-bell-container')) {
			showDropdown = false;
		}
	}

	function formatTime(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return 'Just now';
		if (minutes < 60) return `${minutes}m ago`;
		if (hours < 24) return `${hours}h ago`;
		if (days < 7) return `${days}d ago`;
		return date.toLocaleDateString();
	}

	onMount(() => {
		if (browser) {
			connectSSE();
			document.addEventListener('click', handleClickOutside);
		}
	});

	onDestroy(() => {
		if (browser) {
			eventSource?.close();
			document.removeEventListener('click', handleClickOutside);
		}
	});
</script>

<div class="notification-bell-container relative">
	<button
		type="button"
		class="relative p-2 text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full"
		on:click={toggleDropdown}
		aria-label="Notifications"
	>
		<svg
			class="w-6 h-6"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
			/>
		</svg>

		{#if unreadCount > 0}
			<span
				class="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-500 rounded-full"
			>
				{unreadCount > 99 ? '99+' : unreadCount}
			</span>
		{/if}
	</button>

	{#if showDropdown}
		<div
			class="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg ring-1 ring-black ring-opacity-5 z-50"
		>
			<div class="p-3 border-b border-gray-200 flex justify-between items-center">
				<h3 class="text-sm font-semibold text-gray-900">Notifications</h3>
				{#if unreadCount > 0}
					<button
						type="button"
						class="text-xs text-blue-600 hover:text-blue-800"
						on:click={markAllAsRead}
					>
						Mark all read
					</button>
				{/if}
			</div>

			<div class="max-h-96 overflow-y-auto">
				{#if loading}
					<div class="p-4 text-center text-gray-500">Loading...</div>
				{:else if notifications.length === 0}
					<div class="p-4 text-center text-gray-500">No notifications</div>
				{:else}
					{#each notifications as notification (notification.id)}
						<a
							href={getNotificationLink(notification)}
							class="block px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0 {notification.readAt
								? 'bg-white'
								: 'bg-blue-50'}"
							on:click={() => markAsRead(notification.id)}
						>
							<div class="flex justify-between">
								<p class="text-sm font-medium text-gray-900">{notification.title}</p>
								<span class="text-xs text-gray-500">{formatTime(notification.createdAt)}</span>
							</div>
							<p class="text-sm text-gray-600 mt-1 line-clamp-2">{notification.body}</p>
						</a>
					{/each}
				{/if}
			</div>

			<div class="p-2 border-t border-gray-200">
				<a
					href="/user/notifications"
					class="block text-center text-sm text-blue-600 hover:text-blue-800 py-1"
				>
					View all notifications
				</a>
			</div>
		</div>
	{/if}
</div>

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
