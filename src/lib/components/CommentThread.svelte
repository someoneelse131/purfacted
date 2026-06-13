<script lang="ts">
	import CommentThread from './CommentThread.svelte';
	import ReportForm from './ReportForm.svelte';

	interface CommentNode {
		id: string;
		author: string | null;
		body: string | null;
		createdAt: Date | string;
		editedAt: Date | string | null;
		deleted: boolean;
		score: number;
		myVote: number;
		depth: number;
		editableUntil: Date | string | null;
		children: CommentNode[];
	}

	let {
		comments,
		canInteract,
		maxDepth,
		maxLength,
		reportDetailMax
	}: {
		comments: CommentNode[];
		canInteract: boolean;
		maxDepth: number;
		maxLength: number;
		reportDetailMax: number;
	} = $props();

	function editable(node: CommentNode): boolean {
		return node.editableUntil !== null && new Date(node.editableUntil) > new Date();
	}
</script>

<ul class="space-y-3">
	{#each comments as node (node.id)}
		<li
			class={node.depth > 1 ? 'border-l-2 border-line pl-4' : ''}
			data-testid="comment"
			data-depth={node.depth}
		>
			{#if node.deleted}
				<p class="text-sm text-ink-faint italic">[deleted]</p>
			{:else}
				<p class="text-xs text-ink-faint">
					<span class="font-medium text-ink-muted">{node.author}</span>
					· score <span class="tabular-nums">{node.score}</span>
					{#if node.editedAt}· edited{/if}
				</p>
				<p class="mt-1 text-sm whitespace-pre-line text-ink">{node.body}</p>

				{#if canInteract}
					<div class="mt-1 flex items-center gap-2 text-xs">
						<form method="POST" action="?/voteComment" class="inline">
							<input type="hidden" name="commentId" value={node.id} />
							<input type="hidden" name="value" value="1" />
							<button
								type="submit"
								aria-label="upvote comment"
								aria-pressed={node.myVote === 1}
								class="flex h-8 w-8 items-center justify-center rounded-lg {node.myVote === 1
									? 'bg-primary-soft text-primary'
									: 'text-ink-faint hover:bg-primary-soft hover:text-primary'}"
							>
								<svg
									class="size-4"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.5"
									aria-hidden="true"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="m4.5 15.75 7.5-7.5 7.5 7.5"
									/>
								</svg>
							</button>
						</form>
						<form method="POST" action="?/voteComment" class="inline">
							<input type="hidden" name="commentId" value={node.id} />
							<input type="hidden" name="value" value="-1" />
							<button
								type="submit"
								aria-label="downvote comment"
								aria-pressed={node.myVote === -1}
								class="flex h-8 w-8 items-center justify-center rounded-lg {node.myVote === -1
									? 'bg-primary-soft text-primary'
									: 'text-ink-faint hover:bg-primary-soft hover:text-primary'}"
							>
								<svg
									class="size-4"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.5"
									aria-hidden="true"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="m19.5 8.25-7.5 7.5-7.5-7.5"
									/>
								</svg>
							</button>
						</form>

						{#if node.depth < maxDepth}
							<details class="inline">
								<summary class="cursor-pointer text-ink-faint hover:text-primary">Reply</summary>
								<form method="POST" action="?/comment" class="mt-2 flex gap-2">
									<input type="hidden" name="parentId" value={node.id} />
									<input
										name="body"
										type="text"
										required
										maxlength={maxLength}
										placeholder="Your reply..."
										class="input grow text-sm"
									/>
									<button type="submit" class="btn btn-sm btn-primary">Reply</button>
								</form>
							</details>
						{/if}

						{#if editable(node)}
							<details class="inline">
								<summary class="cursor-pointer text-ink-faint hover:text-primary">Edit</summary>
								<form method="POST" action="?/editComment" class="mt-2 flex gap-2">
									<input type="hidden" name="commentId" value={node.id} />
									<input
										name="body"
										type="text"
										required
										maxlength={maxLength}
										value={node.body}
										class="input grow text-sm"
									/>
									<button type="submit" class="btn btn-sm btn-primary">Save</button>
								</form>
							</details>
							<form method="POST" action="?/deleteComment" class="inline">
								<input type="hidden" name="commentId" value={node.id} />
								<button
									type="submit"
									class="text-ink-faint hover:text-status-refuted-strong hover:underline"
								>
									Delete
								</button>
							</form>
						{/if}

						<ReportForm
							action="?/report"
							targetType="COMMENT"
							targetId={node.id}
							label="Report"
							detailMax={reportDetailMax}
						/>
					</div>
				{/if}
			{/if}

			{#if node.children.length > 0}
				<div class="mt-3">
					<CommentThread
						comments={node.children}
						{canInteract}
						{maxDepth}
						{maxLength}
						{reportDetailMax}
					/>
				</div>
			{/if}
		</li>
	{/each}
</ul>
