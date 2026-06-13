<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import SourceCard from '$lib/components/SourceCard.svelte';
	import CommentThread from '$lib/components/CommentThread.svelte';
	import ReportForm from '$lib/components/ReportForm.svelte';
	import { CONTESTED_MARKER } from '$lib/status';

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
	<div class="mb-3 flex flex-wrap items-center gap-3">
		<StatusBadge status={data.fact.status} size="md" />
		{#if data.openVeto}
			<span
				class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase {CONTESTED_MARKER.outlineClass}"
				title="Veto by {data.openVeto.submitter}: {data.openVeto.reason}"
			>
				<svg
					class="size-4"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					aria-hidden="true"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d={CONTESTED_MARKER.icon} />
				</svg>
				Veto - back under review
			</span>
		{/if}
		<a
			href="/categories/{data.fact.category.slug}"
			class="text-xs text-ink-faint hover:text-primary hover:underline"
		>
			{data.fact.category.name}
		</a>
	</div>
	<h1 class="mb-3 font-serif text-3xl leading-tight font-semibold text-ink">{data.fact.title}</h1>
	<p class="mb-1 text-sm whitespace-pre-line text-ink-muted">{data.fact.body}</p>
	<p class="mb-8 text-xs text-ink-faint">
		Submitted by <a
			href="/users/{data.fact.author.username}"
			class="hover:text-primary hover:underline">{data.fact.author.username}</a
		>
		· review until {new Date(data.fact.reviewDeadline).toLocaleDateString('en-GB')}
	</p>

	{#if data.user}
		<div class="mb-6">
			{#if form?.action === 'report' && form?.saved}
				<p class="alert-success mb-2" role="status">Report sent - a moderator will take a look.</p>
			{/if}
			<ReportForm
				action="?/report"
				targetType="FACT"
				targetId={data.fact.id}
				label="Report this fact"
				detailMax={data.limits.reportDetailMax}
			/>
		</div>
	{/if}

	{#if form?.error}
		<p class="alert-error mb-4" role="alert">
			{form.error}
		</p>
	{/if}

	<div class="mb-10 grid gap-6 md:grid-cols-2">
		<section class="border-t-2 border-status-verified-strong pt-3">
			<h2 class="mb-3 text-lg font-semibold text-status-verified-strong">
				PRO evidence ({data.pro.length})
			</h2>
			<div class="space-y-3" data-testid="pro-column">
				{#each data.pro as source (source.id)}
					<SourceCard {source} canVote={canInteract && !data.fact.isOwn} />
				{:else}
					<p class="text-sm text-ink-muted">No supporting sources yet.</p>
				{/each}
			</div>
		</section>
		<section class="border-t-2 border-status-refuted-strong pt-3">
			<h2 class="mb-3 text-lg font-semibold text-status-refuted-strong">
				CONTRA evidence ({data.contra.length})
			</h2>
			<div class="space-y-3" data-testid="contra-column">
				{#each data.contra as source (source.id)}
					<SourceCard {source} canVote={canInteract && !data.fact.isOwn} />
				{:else}
					<p class="text-sm text-ink-muted">No contradicting sources yet.</p>
				{/each}
			</div>
		</section>
	</div>

	{#if canAddEvidence}
		<section class="card p-4">
			<h2 class="mb-3 text-lg font-semibold text-ink">
				{data.fact.revivable ? 'Revive with new evidence' : 'Add evidence'}
			</h2>
			{#if data.fact.revivable}
				<p class="alert-warning mb-4">
					This review expired without quorum. Adding a source re-opens it once.
				</p>
			{/if}
			{#if form?.action === 'addSource' && form?.saved}
				<p class="alert-success mb-4" role="status">Source added.</p>
			{/if}
			<form method="POST" action="?/addSource" class="space-y-4">
				<div class="flex gap-4">
					<label class="flex items-center gap-2 text-sm">
						<input
							type="radio"
							name="side"
							value="PRO"
							checked
							class="border-line text-primary focus:ring-0"
						/>
						Supports the claim (PRO)
					</label>
					<label class="flex items-center gap-2 text-sm">
						<input
							type="radio"
							name="side"
							value="CONTRA"
							class="border-line text-primary focus:ring-0"
						/>
						Contradicts it (CONTRA)
					</label>
				</div>
				<div>
					<label for="url" class="field-label">URL</label>
					<input id="url" name="url" type="url" required class="input" />
				</div>
				<div>
					<label for="title" class="field-label">Title</label>
					<input
						id="title"
						name="title"
						type="text"
						required
						minlength="3"
						maxlength="200"
						class="input"
					/>
				</div>
				<div>
					<label for="type" class="field-label">Type</label>
					<select id="type" name="type" class="input">
						{#each sourceTypes as t (t.value)}
							<option value={t.value}>{t.label}</option>
						{/each}
					</select>
				</div>
				<button type="submit" class="btn btn-primary">Add source</button>
			</form>
		</section>
	{:else if underReview && !data.user}
		<p class="text-sm text-ink-muted">
			<a href="/login" class="text-primary underline">Log in</a> to add evidence and vote on sources.
		</p>
	{/if}

	{#if decided && data.user}
		<section class="card mt-10 p-4">
			<h2 class="mb-1 text-lg font-semibold text-ink">Veto this verdict</h2>
			<p class="mb-4 text-sm text-ink-muted">
				Disagree with the outcome? A veto needs at least one source that is not on the fact yet and
				sends it back to review. A failed veto costs reputation.
			</p>
			{#if form?.action === 'veto' && form?.saved}
				<p class="alert-success mb-4" role="status">
					Veto submitted - the fact is back under review.
				</p>
			{/if}
			<details>
				<summary class="cursor-pointer text-sm font-medium text-primary">Submit a veto</summary>
				<form method="POST" action="?/veto" class="mt-4 space-y-4">
					<div>
						<label for="reason" class="field-label">Why is the verdict wrong?</label>
						<textarea id="reason" name="reason" rows="2" required minlength="10" class="input"
						></textarea>
					</div>
					<div class="flex gap-4">
						<label class="flex items-center gap-2 text-sm">
							<input
								type="radio"
								name="vetoSide"
								value="CONTRA"
								checked
								class="border-line text-primary focus:ring-0"
							/>
							New CONTRA source
						</label>
						<label class="flex items-center gap-2 text-sm">
							<input
								type="radio"
								name="vetoSide"
								value="PRO"
								class="border-line text-primary focus:ring-0"
							/>
							New PRO source
						</label>
					</div>
					<div>
						<label for="vetoSourceUrl" class="field-label">New source URL</label>
						<input id="vetoSourceUrl" name="vetoSourceUrl" type="url" required class="input" />
					</div>
					<div>
						<label for="vetoSourceTitle" class="field-label">New source title</label>
						<input
							id="vetoSourceTitle"
							name="vetoSourceTitle"
							type="text"
							required
							minlength="3"
							maxlength="200"
							class="input"
						/>
					</div>
					<input type="hidden" name="vetoSourceType" value="" />
					<button type="submit" class="btn btn-primary">Submit veto</button>
				</form>
			</details>
		</section>
	{/if}

	<section class="mt-10">
		<h2 class="mb-3 text-lg font-semibold text-ink">Discussion ({data.commentCount})</h2>

		{#if data.user}
			<form method="POST" action="?/comment" class="mb-6 flex gap-2">
				<input
					name="body"
					type="text"
					required
					maxlength={data.limits.commentMaxLength}
					placeholder="Add to the discussion..."
					aria-label="Comment"
					class="input grow text-sm"
				/>
				<button type="submit" class="btn btn-primary">Comment</button>
			</form>
		{/if}

		{#if data.comments.length === 0}
			<p class="text-sm text-ink-muted">No comments yet.</p>
		{:else}
			<CommentThread
				comments={data.comments}
				canInteract={Boolean(data.user)}
				maxDepth={data.limits.commentMaxDepth}
				maxLength={data.limits.commentMaxLength}
				reportDetailMax={data.limits.reportDetailMax}
			/>
		{/if}
	</section>
</div>
