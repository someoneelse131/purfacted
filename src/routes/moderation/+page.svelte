<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const topCategories = $derived(
		data.categories.filter((c) => c.parentId === null && c.status === 'ACTIVE')
	);
</script>

<svelte:head><title>Moderation - PurFacted</title></svelte:head>

<div class="mx-auto max-w-3xl">
	<h1 class="mb-6 text-2xl font-bold text-ink">Moderation</h1>

	{#if form?.error}
		<p class="alert-error mb-4" role="alert">
			{form.error}
		</p>
	{/if}

	<div class="mb-4 flex gap-2 border-b border-line text-sm">
		<a
			href="/moderation"
			class="border-b-2 px-3 py-2 {data.tab === 'reports'
				? 'border-primary font-medium text-primary'
				: 'border-transparent text-ink-muted hover:text-ink'}"
		>
			Reports ({data.reportQueue.total})
		</a>
		<a
			href="/moderation?tab=categories"
			class="border-b-2 px-3 py-2 {data.tab === 'categories'
				? 'border-primary font-medium text-primary'
				: 'border-transparent text-ink-muted hover:text-ink'}"
		>
			Category proposals ({data.proposals.length})
		</a>
		<a
			href="/moderation?tab=manage"
			class="border-b-2 px-3 py-2 {data.tab === 'manage'
				? 'border-primary font-medium text-primary'
				: 'border-transparent text-ink-muted hover:text-ink'}"
		>
			Manage categories
		</a>
		<a
			href="/moderation?tab=experts"
			class="border-b-2 px-3 py-2 {data.tab === 'experts'
				? 'border-primary font-medium text-primary'
				: 'border-transparent text-ink-muted hover:text-ink'}"
		>
			Expert verification ({data.expertApplications.length})
		</a>
	</div>

	{#if data.tab === 'reports'}
		{#if data.reportQueue.entries.length === 0}
			<p class="text-sm text-ink-muted">No open reports.</p>
		{:else}
			<ul class="space-y-3">
				{#each data.reportQueue.entries as report (report.id)}
					<li class="card px-4 py-3" data-testid="report-row">
						<p class="text-xs text-ink-faint">
							<span class="chip text-[11px] font-medium tracking-wide uppercase">
								{report.targetType}
							</span>
							· {report.reason} · reported by {report.reporter}
							{#if report.claimedBy}
								· <span class="text-status-disputed-strong">claimed by {report.claimedBy}</span>
							{/if}
						</p>
						<p class="mt-1 text-sm text-ink">{report.targetPreview}</p>
						{#if report.detail}
							<p class="mt-1 text-xs text-ink-faint">"{report.detail}"</p>
						{/if}
						<div class="mt-2 flex gap-2">
							{#if !report.claimedBy}
								<form method="POST" action="?/claimReport">
									<input type="hidden" name="reportId" value={report.id} />
									<button type="submit" class="btn btn-sm btn-secondary">Claim</button>
								</form>
							{/if}
							<form method="POST" action="?/resolveReport">
								<input type="hidden" name="reportId" value={report.id} />
								<button type="submit" name="outcome" value="removed" class="btn btn-sm btn-danger">
									Remove content
								</button>
							</form>
							<form method="POST" action="?/resolveReport">
								<input type="hidden" name="reportId" value={report.id} />
								<button
									type="submit"
									name="outcome"
									value="dismissed"
									class="btn btn-sm btn-secondary"
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
						<a href="/moderation?page={data.reportQueue.page - 1}" class="text-primary underline">
							Previous
						</a>
					{:else}
						<span></span>
					{/if}
					<span class="text-ink-faint">
						Page {data.reportQueue.page} of {data.reportQueue.totalPages}
					</span>
					{#if data.reportQueue.page < data.reportQueue.totalPages}
						<a href="/moderation?page={data.reportQueue.page + 1}" class="text-primary underline">
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
			<p class="text-sm text-ink-muted">Nothing to review.</p>
		{:else}
			<ul class="space-y-2">
				{#each data.proposals as proposal (proposal.id)}
					<li class="card flex items-center justify-between gap-4 px-4 py-3">
						<div>
							<span class="text-sm font-medium text-ink">{proposal.name}</span>
							{#if proposal.parent}
								<span class="text-xs text-ink-faint">in {proposal.parent.name}</span>
							{/if}
						</div>
						<form method="POST" action="?/resolveProposal" class="flex gap-2">
							<input type="hidden" name="categoryId" value={proposal.id} />
							<button type="submit" name="decision" value="approve" class="btn btn-sm btn-primary">
								Approve
							</button>
							<button type="submit" name="decision" value="reject" class="btn btn-sm btn-secondary">
								Reject
							</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	{:else if data.tab === 'experts'}
		{#if data.expertApplications.length === 0}
			<p class="text-sm text-ink-muted">No expert applications to review.</p>
		{:else}
			<ul class="space-y-3">
				{#each data.expertApplications as app (app.id)}
					<li class="card px-4 py-3" data-testid="expert-application-row">
						<p class="text-sm">
							<a href="/users/{app.applicant}" class="font-medium text-primary underline">
								{app.applicant}
							</a>
							· <span class="text-ink">{app.field}</span>
						</p>
						<p class="mt-1 text-xs text-ink-faint">
							Categories: {app.categories.map((c) => c.name).join(', ')}
						</p>
						<p class="mt-1 text-xs">
							<a
								href="/moderation/credential/{app.id}"
								target="_blank"
								rel="noopener"
								class="text-primary underline"
							>
								View credential ({app.credentialMime})
							</a>
						</p>
						<form method="POST" action="?tab=experts&/reviewExpert" class="mt-3 space-y-2">
							<input type="hidden" name="applicationId" value={app.id} />
							<input
								name="note"
								type="text"
								maxlength="500"
								placeholder="Note (optional)"
								aria-label="Review note for {app.applicant}"
								class="input text-sm"
							/>
							<div class="flex gap-2">
								<button
									type="submit"
									name="decision"
									value="approve"
									class="btn btn-sm btn-primary"
								>
									Approve
								</button>
								<button
									type="submit"
									name="decision"
									value="reject"
									class="btn btn-sm btn-secondary"
								>
									Reject
								</button>
							</div>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	{:else}
		<section class="card mb-8 p-4">
			<h2 class="mb-3 text-lg font-semibold text-ink">Create a category</h2>
			<form
				method="POST"
				action="?tab=manage&/createCategory"
				class="flex flex-wrap items-end gap-3"
			>
				<div class="grow">
					<label for="new-name" class="field-label">Name</label>
					<input
						id="new-name"
						name="name"
						type="text"
						required
						minlength="2"
						maxlength="60"
						class="input text-sm"
					/>
				</div>
				<div>
					<label for="new-parent" class="field-label">Parent (optional)</label>
					<select id="new-parent" name="parentId" class="input w-auto text-sm">
						<option value="">None (top level)</option>
						{#each topCategories as top (top.id)}
							<option value={top.id}>{top.name}</option>
						{/each}
					</select>
				</div>
				<button type="submit" class="btn btn-primary">Create</button>
			</form>
		</section>

		<ul class="space-y-2">
			{#each data.categories as category (category.id)}
				<li class="card px-4 py-3" data-testid="manage-category-row">
					<div class="flex items-center justify-between gap-4">
						<div>
							<span class="text-sm font-medium text-ink" data-testid="category-name">
								{category.name}
							</span>
							{#if category.parentName}
								<span class="text-xs text-ink-faint">in {category.parentName}</span>
							{/if}
							{#if category.status === 'DISABLED'}
								<span class="chip ml-2 font-medium">Disabled</span>
							{/if}
						</div>
						<form method="POST" action="?tab=manage&/setCategoryStatus">
							<input type="hidden" name="categoryId" value={category.id} />
							<input
								type="hidden"
								name="status"
								value={category.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'}
							/>
							<button type="submit" class="btn btn-sm btn-secondary">
								{category.status === 'ACTIVE' ? 'Disable' : 'Enable'}
							</button>
						</form>
					</div>
					<div class="mt-2 flex flex-wrap gap-4 text-xs">
						<details>
							<summary class="cursor-pointer text-ink-faint hover:text-primary">Rename</summary>
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
									class="input w-auto text-sm"
								/>
								<button type="submit" class="btn btn-sm btn-primary">Save</button>
							</form>
						</details>
						<details>
							<summary class="cursor-pointer text-ink-faint hover:text-primary">Move</summary>
							<form method="POST" action="?tab=manage&/moveCategory" class="mt-2 flex gap-2">
								<input type="hidden" name="categoryId" value={category.id} />
								<select
									name="parentId"
									aria-label="New parent for {category.name}"
									class="input w-auto text-sm"
								>
									<option value="" selected={category.parentId === null}>None (top level)</option>
									{#each topCategories.filter((t) => t.id !== category.id) as top (top.id)}
										<option value={top.id} selected={category.parentId === top.id}>
											{top.name}
										</option>
									{/each}
								</select>
								<button type="submit" class="btn btn-sm btn-primary">Save</button>
							</form>
						</details>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	<section class="mt-10">
		<h2 class="mb-3 text-lg font-semibold text-ink">Action log</h2>
		{#if data.actionLog.length === 0}
			<p class="text-sm text-ink-muted">No actions yet.</p>
		{:else}
			<ul class="space-y-1 text-xs text-ink-muted">
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
