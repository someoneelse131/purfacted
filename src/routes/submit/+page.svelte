<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const sourceTypes = [
		{ value: '', label: 'Auto-detect from URL' },
		{ value: 'PEER_REVIEWED', label: 'Peer-reviewed' },
		{ value: 'OFFICIAL', label: 'Official' },
		{ value: 'NEWS', label: 'News' },
		{ value: 'COMPANY', label: 'Company' },
		{ value: 'BLOG', label: 'Blog' },
		{ value: 'OTHER', label: 'Other' }
	];
</script>

<svelte:head><title>Submit a fact - PurFacted</title></svelte:head>

<div class="mx-auto max-w-xl">
	<h1 class="mb-2 text-2xl font-bold text-slate-900">Submit a claim</h1>
	<p class="mb-6 text-sm text-slate-600">
		Every claim starts in review. Bring at least one source - the community will weigh the evidence.
	</p>

	{#if form?.error}
		<p class="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
			{form.error}
		</p>
	{/if}

	<form method="POST" class="space-y-4">
		<div>
			<label for="title" class="mb-1 block text-sm font-medium text-slate-700">Claim</label>
			<input
				id="title"
				name="title"
				type="text"
				required
				minlength="10"
				maxlength="200"
				value={form?.title ?? ''}
				placeholder="e.g. Coffee consumption lowers the risk of type 2 diabetes"
				class="w-full rounded-md border-slate-300"
			/>
		</div>
		<div>
			<label for="body" class="mb-1 block text-sm font-medium text-slate-700">Context</label>
			<textarea
				id="body"
				name="body"
				rows="4"
				required
				maxlength="3000"
				placeholder="What exactly does the claim state? Add definitions and scope."
				class="w-full rounded-md border-slate-300">{form?.body ?? ''}</textarea
			>
		</div>
		<div>
			<label for="categoryId" class="mb-1 block text-sm font-medium text-slate-700">Category</label>
			<select id="categoryId" name="categoryId" required class="w-full rounded-md border-slate-300">
				<option value="">Choose...</option>
				{#each data.tree as top (top.id)}
					<option value={top.id} selected={form?.categoryId === top.id}>{top.name}</option>
					{#each top.children as child (child.id)}
						<option value={child.id} selected={form?.categoryId === child.id}>
							&nbsp;&nbsp;{child.name}
						</option>
					{/each}
				{/each}
			</select>
		</div>

		<fieldset class="space-y-4 rounded-md border border-slate-200 p-4">
			<legend class="px-1 text-sm font-medium text-slate-700">Starting source (PRO)</legend>
			<div>
				<label for="sourceUrl" class="mb-1 block text-sm font-medium text-slate-700">URL</label>
				<input
					id="sourceUrl"
					name="sourceUrl"
					type="url"
					required
					value={form?.sourceUrl ?? ''}
					class="w-full rounded-md border-slate-300"
				/>
			</div>
			<div>
				<label for="sourceTitle" class="mb-1 block text-sm font-medium text-slate-700">
					Source title
				</label>
				<input
					id="sourceTitle"
					name="sourceTitle"
					type="text"
					required
					minlength="3"
					maxlength="200"
					value={form?.sourceTitle ?? ''}
					class="w-full rounded-md border-slate-300"
				/>
			</div>
			<div>
				<label for="sourceType" class="mb-1 block text-sm font-medium text-slate-700">Type</label>
				<select id="sourceType" name="sourceType" class="w-full rounded-md border-slate-300">
					{#each sourceTypes as t (t.value)}
						<option value={t.value} selected={form?.sourceType === t.value}>{t.label}</option>
					{/each}
				</select>
			</div>
		</fieldset>

		<!-- honeypot -->
		<div class="absolute -left-[9999px]" aria-hidden="true">
			<label for="website">Website</label>
			<input id="website" name="website" type="text" tabindex="-1" autocomplete="off" />
		</div>

		<button
			type="submit"
			class="w-full rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700"
		>
			Submit for review
		</button>
	</form>
</div>
