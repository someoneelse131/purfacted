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
	<h1 class="mb-2 text-2xl font-bold text-ink">Submit a claim</h1>
	<p class="mb-6 text-sm text-ink-muted">
		Every claim starts in review. Bring at least one source - the community will weigh the evidence.
	</p>

	{#if form?.error}
		<p class="alert-error mb-4" role="alert">
			{form.error}
		</p>
	{/if}

	<form method="POST" class="space-y-4">
		<div>
			<label for="title" class="field-label">Claim</label>
			<input
				id="title"
				name="title"
				type="text"
				required
				minlength={data.limits.titleMin}
				maxlength={data.limits.titleMax}
				value={form?.title ?? ''}
				placeholder="e.g. Coffee consumption lowers the risk of type 2 diabetes"
				class="input"
			/>
		</div>
		<div>
			<label for="body" class="field-label">Context</label>
			<textarea
				id="body"
				name="body"
				rows="4"
				required
				maxlength={data.limits.bodyMax}
				placeholder="What exactly does the claim state? Add definitions and scope."
				class="input">{form?.body ?? ''}</textarea
			>
		</div>
		<div>
			<label for="categoryId" class="field-label">Category</label>
			<select id="categoryId" name="categoryId" required class="input">
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

		<fieldset class="card space-y-4 p-4">
			<legend class="px-1 text-sm font-medium text-ink">Starting source (PRO)</legend>
			<div>
				<label for="sourceUrl" class="field-label">URL</label>
				<input
					id="sourceUrl"
					name="sourceUrl"
					type="url"
					required
					value={form?.sourceUrl ?? ''}
					class="input"
				/>
			</div>
			<div>
				<label for="sourceTitle" class="field-label">Source title</label>
				<input
					id="sourceTitle"
					name="sourceTitle"
					type="text"
					required
					minlength="3"
					maxlength="200"
					value={form?.sourceTitle ?? ''}
					class="input"
				/>
			</div>
			<div>
				<label for="sourceType" class="field-label">Type</label>
				<select id="sourceType" name="sourceType" class="input">
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

		<button type="submit" class="btn btn-primary w-full">Submit for review</button>
	</form>
</div>
