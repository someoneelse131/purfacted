<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import FactStatusBadge from '$lib/components/FactStatusBadge.svelte';
	import SourceCard from '$lib/components/SourceCard.svelte';
	import CommentThread from '$lib/components/CommentThread.svelte';

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

	const underReview = $derived(data.fact.status === 'UNDER_REVIEW');
	const decided = $derived(['VERIFIED', 'DISPUTED', 'REFUTED'].includes(data.fact.status));
	const canInteract = $derived(Boolean(data.user) && underReview);
	const canAddEvidence = $derived(Boolean(data.user) && (underReview || data.fact.revivable));
</script>

<svelte:head>
	<title>{data.fact.title} - PurFacted</title>
	<meta name="description" content={data.fact.body.slice(0, 160)} />
	<meta property="og:title" content={data.fact.title} />
	<meta
		property="og:description"
		content="Status: {data.fact.status}. {data.fact.body.slice(0, 140)}"
	/>
	<meta property="og:type" content="article" />
	<meta property="og:site_name" content="PurFacted" />
</svelte:head>

<div class="mx-auto max-w-4xl">
	<div class="mb-2 flex items-center gap-3">
		<FactStatusBadge status={data.fact.status} />
		{#if data.openVeto}
			<span
				class="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800"
				title="Veto by {data.openVeto.submitter}: {data.openVeto.reason}"
			>
				Veto - back under review
			</span>
		{/if}
		<a href="/categories/{data.fact.category.slug}" class="text-xs text-slate-500 hover:underline">
			{data.fact.category.name}
		</a>
	</div>
	<h1 class="mb-2 text-2xl font-bold text-slate-900">{data.fact.title}</h1>
	<p class="mb-1 text-sm whitespace-pre-line text-slate-700">{data.fact.body}</p>
	<p class="mb-8 text-xs text-slate-500">
		Submitted by <a href="/users/{data.fact.author.username}" class="hover:underline"
			>{data.fact.author.username}</a
		>
		· review until {new Date(data.fact.reviewDeadline).toLocaleDateString('en-GB')}
	</p>

	{#if form?.error}
		<p class="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
			{form.error}
		</p>
	{/if}

	<div class="mb-10 grid gap-6 md:grid-cols-2">
		<section>
			<h2 class="mb-3 text-lg font-semibold text-green-700">PRO evidence ({data.pro.length})</h2>
			<div class="space-y-3" data-testid="pro-column">
				{#each data.pro as source (source.id)}
					<SourceCard {source} canVote={canInteract && !data.fact.isOwn} />
				{:else}
					<p class="text-sm text-slate-500">No supporting sources yet.</p>
				{/each}
			</div>
		</section>
		<section>
			<h2 class="mb-3 text-lg font-semibold text-red-700">
				CONTRA evidence ({data.contra.length})
			</h2>
			<div class="space-y-3" data-testid="contra-column">
				{#each data.contra as source (source.id)}
					<SourceCard {source} canVote={canInteract && !data.fact.isOwn} />
				{:else}
					<p class="text-sm text-slate-500">No contradicting sources yet.</p>
				{/each}
			</div>
		</section>
	</div>

	{#if canAddEvidence}
		<section class="rounded-md border border-slate-200 bg-white p-4">
			<h2 class="mb-3 text-lg font-semibold text-slate-900">
				{data.fact.revivable ? 'Revive with new evidence' : 'Add evidence'}
			</h2>
			{#if data.fact.revivable}
				<p class="mb-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
					This review expired without quorum. Adding a source re-opens it once.
				</p>
			{/if}
			{#if form?.action === 'addSource' && form?.saved}
				<p class="mb-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-700" role="status">
					Source added.
				</p>
			{/if}
			<form method="POST" action="?/addSource" class="space-y-4">
				<div class="flex gap-4">
					<label class="flex items-center gap-2 text-sm">
						<input type="radio" name="side" value="PRO" checked class="border-slate-300" />
						Supports the claim (PRO)
					</label>
					<label class="flex items-center gap-2 text-sm">
						<input type="radio" name="side" value="CONTRA" class="border-slate-300" />
						Contradicts it (CONTRA)
					</label>
				</div>
				<div>
					<label for="url" class="mb-1 block text-sm font-medium text-slate-700">URL</label>
					<input
						id="url"
						name="url"
						type="url"
						required
						class="w-full rounded-md border-slate-300"
					/>
				</div>
				<div>
					<label for="title" class="mb-1 block text-sm font-medium text-slate-700">Title</label>
					<input
						id="title"
						name="title"
						type="text"
						required
						minlength="3"
						maxlength="200"
						class="w-full rounded-md border-slate-300"
					/>
				</div>
				<div>
					<label for="type" class="mb-1 block text-sm font-medium text-slate-700">Type</label>
					<select id="type" name="type" class="w-full rounded-md border-slate-300">
						{#each sourceTypes as t (t.value)}
							<option value={t.value}>{t.label}</option>
						{/each}
					</select>
				</div>
				<button
					type="submit"
					class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
				>
					Add source
				</button>
			</form>
		</section>
	{:else if underReview && !data.user}
		<p class="text-sm text-slate-500">
			<a href="/login" class="underline">Log in</a> to add evidence and vote on sources.
		</p>
	{/if}

	{#if decided && data.user}
		<section class="mt-10 rounded-md border border-purple-200 bg-white p-4">
			<h2 class="mb-1 text-lg font-semibold text-slate-900">Veto this verdict</h2>
			<p class="mb-4 text-sm text-slate-600">
				Disagree with the outcome? A veto needs at least one source that is not on the fact yet and
				sends it back to review. A failed veto costs reputation.
			</p>
			{#if form?.action === 'veto' && form?.saved}
				<p class="mb-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-700" role="status">
					Veto submitted - the fact is back under review.
				</p>
			{/if}
			<details>
				<summary class="cursor-pointer text-sm font-medium text-purple-700">Submit a veto</summary>
				<form method="POST" action="?/veto" class="mt-4 space-y-4">
					<div>
						<label for="reason" class="mb-1 block text-sm font-medium text-slate-700">
							Why is the verdict wrong?
						</label>
						<textarea
							id="reason"
							name="reason"
							rows="2"
							required
							minlength="10"
							class="w-full rounded-md border-slate-300"
						></textarea>
					</div>
					<div class="flex gap-4">
						<label class="flex items-center gap-2 text-sm">
							<input type="radio" name="vetoSide" value="CONTRA" checked class="border-slate-300" />
							New CONTRA source
						</label>
						<label class="flex items-center gap-2 text-sm">
							<input type="radio" name="vetoSide" value="PRO" class="border-slate-300" />
							New PRO source
						</label>
					</div>
					<div>
						<label for="vetoSourceUrl" class="mb-1 block text-sm font-medium text-slate-700">
							New source URL
						</label>
						<input
							id="vetoSourceUrl"
							name="vetoSourceUrl"
							type="url"
							required
							class="w-full rounded-md border-slate-300"
						/>
					</div>
					<div>
						<label for="vetoSourceTitle" class="mb-1 block text-sm font-medium text-slate-700">
							New source title
						</label>
						<input
							id="vetoSourceTitle"
							name="vetoSourceTitle"
							type="text"
							required
							minlength="3"
							maxlength="200"
							class="w-full rounded-md border-slate-300"
						/>
					</div>
					<input type="hidden" name="vetoSourceType" value="" />
					<button
						type="submit"
						class="rounded-md bg-purple-700 px-4 py-2 text-sm font-medium text-white hover:bg-purple-600"
					>
						Submit veto
					</button>
				</form>
			</details>
		</section>
	{/if}

	<section class="mt-10">
		<h2 class="mb-3 text-lg font-semibold text-slate-900">Discussion ({data.comments.length})</h2>

		{#if data.user}
			<form method="POST" action="?/comment" class="mb-6 flex gap-2">
				<input
					name="body"
					type="text"
					required
					maxlength="2000"
					placeholder="Add to the discussion..."
					aria-label="Comment"
					class="grow rounded-md border-slate-300 text-sm"
				/>
				<button
					type="submit"
					class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
				>
					Comment
				</button>
			</form>
		{/if}

		{#if data.comments.length === 0}
			<p class="text-sm text-slate-500">No comments yet.</p>
		{:else}
			<CommentThread comments={data.comments} canInteract={Boolean(data.user)} maxDepth={4} />
		{/if}
	</section>
</div>
