<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
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
			Reports ({data.reports.length})
		</a>
		<a
			href="/moderation?tab=categories"
			class="border-b-2 px-3 py-2 {data.tab === 'categories'
				? 'border-slate-900 font-medium text-slate-900'
				: 'border-transparent text-slate-500 hover:text-slate-900'}"
		>
			Category proposals ({data.proposals.length})
		</a>
	</div>

	{#if data.tab === 'reports'}
		{#if data.reports.length === 0}
			<p class="text-sm text-slate-500">No open reports.</p>
		{:else}
			<ul class="space-y-3">
				{#each data.reports as report (report.id)}
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
		{/if}
	{:else if data.proposals.length === 0}
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
