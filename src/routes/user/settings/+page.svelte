<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	interface Profile {
		id: string;
		email: string;
		firstName: string;
		lastName: string;
		userType: string;
		trustScore: number;
	}

	interface NotificationPreference {
		type: string;
		email: boolean;
		inApp: boolean;
	}

	let profile: Profile | null = null;
	let preferences: NotificationPreference[] = [];
	let loading = true;
	let saving = false;
	let error = '';
	let success = '';

	// Form state
	let firstName = '';
	let lastName = '';
	let newEmail = '';
	let currentPassword = '';
	let newPassword = '';
	let confirmPassword = '';
	let showDeleteConfirm = false;

	onMount(async () => {
		await loadProfile();
		await loadPreferences();
		loading = false;
	});

	async function loadProfile() {
		const response = await fetch('/api/user/profile');
		const data = await response.json();
		if (data.success) {
			profile = data.profile;
			firstName = profile?.firstName || '';
			lastName = profile?.lastName || '';
		}
	}

	async function loadPreferences() {
		const response = await fetch('/api/user/notifications');
		const data = await response.json();
		if (data.success) {
			preferences = data.preferences;
		}
	}

	async function updateProfile() {
		error = '';
		success = '';
		saving = true;

		try {
			const response = await fetch('/api/user/profile', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ firstName, lastName })
			});

			const data = await response.json();

			if (!response.ok) {
				error = data.error || 'Failed to update profile';
				return;
			}

			success = 'Profile updated successfully';
			await loadProfile();
		} catch (err) {
			error = 'An unexpected error occurred';
		} finally {
			saving = false;
		}
	}

	async function requestEmailChange() {
		error = '';
		success = '';

		if (!newEmail) {
			error = 'Please enter a new email address';
			return;
		}

		saving = true;

		try {
			const response = await fetch('/api/user/email', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: newEmail })
			});

			const data = await response.json();

			if (!response.ok) {
				error = data.error || 'Failed to request email change';
				return;
			}

			success = 'Verification email sent to your new address';
			newEmail = '';
		} catch (err) {
			error = 'An unexpected error occurred';
		} finally {
			saving = false;
		}
	}

	async function changePassword() {
		error = '';
		success = '';

		if (newPassword !== confirmPassword) {
			error = 'Passwords do not match';
			return;
		}

		saving = true;

		try {
			const response = await fetch('/api/auth/change-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ currentPassword, newPassword })
			});

			const data = await response.json();

			if (!response.ok) {
				error = data.error || 'Failed to change password';
				return;
			}

			success = 'Password changed successfully';
			currentPassword = '';
			newPassword = '';
			confirmPassword = '';
		} catch (err) {
			error = 'An unexpected error occurred';
		} finally {
			saving = false;
		}
	}

	async function toggleNotification(type: string, field: 'email' | 'inApp') {
		const pref = preferences.find((p) => p.type === type);
		const currentValue = pref ? pref[field] : true;

		await fetch('/api/user/notifications', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				type,
				email: field === 'email' ? !currentValue : pref?.email ?? true,
				inApp: field === 'inApp' ? !currentValue : pref?.inApp ?? true
			})
		});

		await loadPreferences();
	}

	async function deleteAccount() {
		const response = await fetch('/api/user/delete', {
			method: 'POST'
		});

		if (response.ok) {
			goto('/');
		} else {
			const data = await response.json();
			error = data.error || 'Failed to delete account';
		}
	}

	const notificationTypeLabels: Record<string, string> = {
		TRUST_CHANGE: 'Trust score changes',
		FACT_REPLY: 'Replies to your facts',
		FACT_DISPUTED: 'Facts disputed',
		VETO_RECEIVED: 'Veto on your facts',
		VERIFICATION_RESULT: 'Verification results',
		ORG_COMMENT: 'Organization comments',
		DEBATE_REQUEST: 'Debate requests',
		DEBATE_PUBLISHED: 'Published debates',
		MODERATOR_STATUS: 'Moderator status changes',
		FACT_STATUS: 'Fact status updates'
	};
</script>

<svelte:head>
	<title>Settings - PurFacted</title>
</svelte:head>

<main class="min-h-screen bg-gray-50 py-8 px-4">
	<div class="max-w-2xl mx-auto">
		<h1 class="text-3xl font-bold text-gray-900 mb-8">Account Settings</h1>

		{#if loading}
			<div class="text-center py-12">Loading...</div>
		{:else}
			{#if error}
				<div class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 mb-6">
					{error}
				</div>
			{/if}

			{#if success}
				<div class="bg-green-50 border border-green-200 rounded-lg p-4 text-green-700 mb-6">
					{success}
				</div>
			{/if}

			<!-- Profile Section -->
			<section class="bg-white rounded-lg shadow p-6 mb-6">
				<h2 class="text-xl font-semibold mb-4">Profile Information</h2>

				<div class="space-y-4">
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label for="firstName" class="block text-sm font-medium text-gray-700">First Name</label>
							<input
								id="firstName"
								type="text"
								bind:value={firstName}
								class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
							/>
						</div>
						<div>
							<label for="lastName" class="block text-sm font-medium text-gray-700">Last Name</label>
							<input
								id="lastName"
								type="text"
								bind:value={lastName}
								class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
							/>
						</div>
					</div>

					<button
						on:click={updateProfile}
						disabled={saving}
						class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
					>
						{saving ? 'Saving...' : 'Update Profile'}
					</button>
				</div>
			</section>

			<!-- Email Section -->
			<section class="bg-white rounded-lg shadow p-6 mb-6">
				<h2 class="text-xl font-semibold mb-4">Email Address</h2>
				<p class="text-gray-600 mb-4">Current email: <strong>{profile?.email}</strong></p>

				<div class="flex gap-4">
					<input
						type="email"
						bind:value={newEmail}
						placeholder="New email address"
						class="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
					/>
					<button
						on:click={requestEmailChange}
						disabled={saving}
						class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
					>
						Change Email
					</button>
				</div>
				<p class="text-sm text-gray-500 mt-2">A verification email will be sent to your new address.</p>
			</section>

			<!-- Password Section -->
			<section class="bg-white rounded-lg shadow p-6 mb-6">
				<h2 class="text-xl font-semibold mb-4">Change Password</h2>

				<div class="space-y-4">
					<div>
						<label for="currentPassword" class="block text-sm font-medium text-gray-700">Current Password</label>
						<input
							id="currentPassword"
							type="password"
							bind:value={currentPassword}
							class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
						/>
					</div>
					<div>
						<label for="newPassword" class="block text-sm font-medium text-gray-700">New Password</label>
						<input
							id="newPassword"
							type="password"
							bind:value={newPassword}
							class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
						/>
					</div>
					<div>
						<label for="confirmPassword" class="block text-sm font-medium text-gray-700">Confirm New Password</label>
						<input
							id="confirmPassword"
							type="password"
							bind:value={confirmPassword}
							class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
						/>
					</div>

					<button
						on:click={changePassword}
						disabled={saving}
						class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
					>
						Change Password
					</button>
				</div>
			</section>

			<!-- Notifications Section -->
			<section class="bg-white rounded-lg shadow p-6 mb-6">
				<h2 class="text-xl font-semibold mb-4">Notification Preferences</h2>

				<div class="space-y-3">
					{#each Object.entries(notificationTypeLabels) as [type, label]}
						{@const pref = preferences.find((p) => p.type === type)}
						<div class="flex items-center justify-between py-2 border-b border-gray-100">
							<span class="text-gray-700">{label}</span>
							<div class="flex gap-4">
								<label class="flex items-center gap-2 text-sm">
									<input
										type="checkbox"
										checked={pref?.email ?? true}
										on:change={() => toggleNotification(type, 'email')}
										class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
									/>
									Email
								</label>
								<label class="flex items-center gap-2 text-sm">
									<input
										type="checkbox"
										checked={pref?.inApp ?? true}
										on:change={() => toggleNotification(type, 'inApp')}
										class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
									/>
									In-App
								</label>
							</div>
						</div>
					{/each}
				</div>
			</section>

			<!-- Danger Zone -->
			<section class="bg-white rounded-lg shadow p-6 border-2 border-red-200">
				<h2 class="text-xl font-semibold text-red-600 mb-4">Danger Zone</h2>

				{#if !showDeleteConfirm}
					<button
						on:click={() => (showDeleteConfirm = true)}
						class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
					>
						Delete Account
					</button>
				{:else}
					<div class="bg-red-50 p-4 rounded-lg">
						<p class="text-red-700 mb-4">
							Are you sure you want to delete your account? This action cannot be undone.
						</p>
						<div class="flex gap-4">
							<button
								on:click={deleteAccount}
								class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
							>
								Yes, Delete My Account
							</button>
							<button
								on:click={() => (showDeleteConfirm = false)}
								class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
							>
								Cancel
							</button>
						</div>
					</div>
				{/if}
			</section>
		{/if}
	</div>
</main>
