<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>Moderation - PurFacted</title></svelte:head>

<div class="mx-auto max-w-2xl">
	<h1 class="mb-6 text-2xl font-bold text-slate-900">Moderation</h1>

	{#if form?.error}
		<p class="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
			{form.error}
		</p>
	{/if}

	<section>
		<h2 class="mb-3 text-lg font-semibold text-slate-900">
			Category proposals ({data.proposals.length})
		</h2>
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
	</section>
</div>
