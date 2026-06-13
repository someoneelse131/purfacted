<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const topCategories = $derived(
		data.categories.filter((c) => c.parentId === null && c.status === 'ACTIVE')
	);
</script>

<svelte:head><title>Moderation - PurFacted</title></svelte:head>

<div class="mx-auto max-w-3xl">
	<h1 class="mb-6 text-2xl font-bold text-slate-900">Moderation</h1>

	{#if form?.error}
		<p class="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
			{form.error}
		</p>
	{/if}

	<div class="mb-4 flex gap-2 border-b border-slate-200 text-sm">
		<a
			href="/moderation"
			class="border-b-2 px-3 py-2 {data.tab === 'reports'
				? 'border-slate-900 font-medium text-slate-900'
				: 'border-transparent text-slate-500 hover:text-slate-900'}"
		>
			Reports ({data.reportQueue.total})
		</a>
		<a
			href="/moderation?tab=categories"
			class="border-b-2 px-3 py-2 {data.tab === 'categories'
				? 'border-slate-900 font-medium text-slate-900'
				: 'border-transparent text-slate-500 hover:text-slate-900'}"
		>
			Category proposals ({data.proposals.length})
		</a>
		<a
			href="/moderation?tab=manage"
			class="border-b-2 px-3 py-2 {data.tab === 'manage'
				? 'border-slate-900 font-medium text-slate-900'
				: 'border-transparent text-slate-500 hover:text-slate-900'}"
		>
			Manage categories
		</a>
	</div>

	{#if data.tab === 'reports'}
		{#if data.reportQueue.entries.length === 0}
			<p class="text-sm text-slate-500">No open reports.</p>
		{:else}
			<ul class="space-y-3">
				{#each data.reportQueue.entries as report (report.id)}
					<li
						class="rounded-md border border-slate-200 bg-white px-4 py-3"
						data-testid="report-row"
					>
						<p class="text-xs text-slate-500">
							<span class="rounded bg-slate-100 px-1.5 py-0.5 uppercase">{report.targetType}</span>
							· {report.reason} · reported by {report.reporter}
							{#if report.claimedBy}
								· <span class="text-amber-700">claimed by {report.claimedBy}</span>
							{/if}
						</p>
						<p class="mt-1 text-sm text-slate-800">{report.targetPreview}</p>
						{#if report.detail}
							<p class="mt-1 text-xs text-slate-500">"{report.detail}"</p>
						{/if}
						<div class="mt-2 flex gap-2">
							{#if !report.claimedBy}
								<form method="POST" action="?/claimReport">
									<input type="hidden" name="reportId" value={report.id} />
									<button
										type="submit"
										class="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
									>
										Claim
									</button>
								</form>
							{/if}
							<form method="POST" action="?/resolveReport">
								<input type="hidden" name="reportId" value={report.id} />
								<button
									type="submit"
									name="outcome"
									value="removed"
									class="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
								>
									Remove content
								</button>
							</form>
							<form method="POST" action="?/resolveReport">
								<input type="hidden" name="reportId" value={report.id} />
								<button
									type="submit"
									name="outcome"
									value="dismissed"
									class="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
								>
									Dismiss
								</button>
							</form>
						</div>
					</li>
				{/each}
			</ul>

			{#if data.reportQueue.totalPages > 1}
				<nav class="mt-6 flex items-center justify-between text-sm" aria-label="Pagination">
					{#if data.reportQueue.page > 1}
						<a href="/moderation?page={data.reportQueue.page - 1}" class="text-slate-700 underline">
							Previous
						</a>
					{:else}
						<span></span>
					{/if}
					<span class="text-slate-500">
						Page {data.reportQueue.page} of {data.reportQueue.totalPages}
					</span>
					{#if data.reportQueue.page < data.reportQueue.totalPages}
						<a href="/moderation?page={data.reportQueue.page + 1}" class="text-slate-700 underline">
							Next
						</a>
					{:else}
						<span></span>
					{/if}
				</nav>
			{/if}
		{/if}
	{:else if data.tab === 'categories'}
		{#if data.proposals.length === 0}
			<p class="text-sm text-slate-500">Nothing to review.</p>
		{:else}
			<ul class="space-y-2">
				{#each data.proposals as proposal (proposal.id)}
					<li
						class="flex items-center justify-between gap-4 rounded-md border border-slate-200 bg-white px-4 py-3"
					>
						<div>
							<span class="text-sm font-medium text-slate-800">{proposal.name}</span>
							{#if proposal.parent}
								<span class="text-xs text-slate-500">in {proposal.parent.name}</span>
							{/if}
						</div>
						<form method="POST" action="?/resolveProposal" class="flex gap-2">
							<input type="hidden" name="categoryId" value={proposal.id} />
							<button
								type="submit"
								name="decision"
								value="approve"
								class="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500"
							>
								Approve
							</button>
							<button
								type="submit"
								name="decision"
								value="reject"
								class="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
							>
								Reject
							</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	{:else}
		<section class="mb-8 rounded-md border border-slate-200 bg-white p-4">
			<h2 class="mb-3 text-lg font-semibold text-slate-900">Create a category</h2>
			<form
				method="POST"
				action="?tab=manage&/createCategory"
				class="flex flex-wrap items-end gap-3"
			>
				<div class="grow">
					<label for="new-name" class="mb-1 block text-sm font-medium text-slate-700">Name</label>
					<input
						id="new-name"
						name="name"
						type="text"
						required
						minlength="2"
						maxlength="60"
						class="w-full rounded-md border-slate-300 text-sm"
					/>
				</div>
				<div>
					<label for="new-parent" class="mb-1 block text-sm font-medium text-slate-700">
						Parent (optional)
					</label>
					<select id="new-parent" name="parentId" class="rounded-md border-slate-300 text-sm">
						<option value="">None (top level)</option>
						{#each topCategories as top (top.id)}
							<option value={top.id}>{top.name}</option>
						{/each}
					</select>
				</div>
				<button
					type="submit"
					class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
				>
					Create
				</button>
			</form>
		</section>

		<ul class="space-y-2">
			{#each data.categories as category (category.id)}
				<li
					class="rounded-md border border-slate-200 bg-white px-4 py-3"
					data-testid="manage-category-row"
				>
					<div class="flex items-center justify-between gap-4">
						<div>
							<span class="text-sm font-medium text-slate-800" data-testid="category-name">
								{category.name}
							</span>
							{#if category.parentName}
								<span class="text-xs text-slate-500">in {category.parentName}</span>
							{/if}
							{#if category.status === 'DISABLED'}
								<span
									class="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600"
								>
									Disabled
								</span>
							{/if}
						</div>
						<form method="POST" action="?tab=manage&/setCategoryStatus">
							<input type="hidden" name="categoryId" value={category.id} />
							<input
								type="hidden"
								name="status"
								value={category.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'}
							/>
							<button
								type="submit"
								class="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
							>
								{category.status === 'ACTIVE' ? 'Disable' : 'Enable'}
							</button>
						</form>
					</div>
					<div class="mt-2 flex flex-wrap gap-4 text-xs">
						<details>
							<summary class="cursor-pointer text-slate-500 hover:text-slate-900">Rename</summary>
							<form method="POST" action="?tab=manage&/renameCategory" class="mt-2 flex gap-2">
								<input type="hidden" name="categoryId" value={category.id} />
								<input
									name="name"
									type="text"
									required
									minlength="2"
									maxlength="60"
									value={category.name}
									aria-label="New name for {category.name}"
									class="rounded-md border-slate-300 text-sm"
								/>
								<button
									type="submit"
									class="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
								>
									Save
								</button>
							</form>
						</details>
						<details>
							<summary class="cursor-pointer text-slate-500 hover:text-slate-900">Move</summary>
							<form method="POST" action="?tab=manage&/moveCategory" class="mt-2 flex gap-2">
								<input type="hidden" name="categoryId" value={category.id} />
								<select
									name="parentId"
									aria-label="New parent for {category.name}"
									class="rounded-md border-slate-300 text-sm"
								>
									<option value="" selected={category.parentId === null}>None (top level)</option>
									{#each topCategories.filter((t) => t.id !== category.id) as top (top.id)}
										<option value={top.id} selected={category.parentId === top.id}>
											{top.name}
										</option>
									{/each}
								</select>
								<button
									type="submit"
									class="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
								>
									Save
								</button>
							</form>
						</details>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	<section class="mt-10">
		<h2 class="mb-3 text-lg font-semibold text-slate-900">Action log</h2>
		{#if data.actionLog.length === 0}
			<p class="text-sm text-slate-500">No actions yet.</p>
		{:else}
			<ul class="space-y-1 text-xs text-slate-600">
				{#each data.actionLog as entry (entry.id)}
					<li>
						{new Date(entry.createdAt).toLocaleString('en-GB')} ·
						<span class="font-medium">{entry.moderator}</span>
						· {entry.action} ({entry.targetType}){entry.detail ? ` · ${entry.detail}` : ''}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
