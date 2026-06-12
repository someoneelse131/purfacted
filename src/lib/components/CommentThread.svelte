<script lang="ts">
	import CommentThread from './CommentThread.svelte';

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
		maxDepth
	}: { comments: CommentNode[]; canInteract: boolean; maxDepth: number } = $props();

	function editable(node: CommentNode): boolean {
		return node.editableUntil !== null && new Date(node.editableUntil) > new Date();
	}
</script>

<ul class="space-y-3">
	{#each comments as node (node.id)}
		<li
			class={node.depth > 1 ? 'border-l-2 border-slate-200 pl-4' : ''}
			data-testid="comment"
			data-depth={node.depth}
		>
			{#if node.deleted}
				<p class="text-sm text-slate-400 italic">[deleted]</p>
			{:else}
				<p class="text-xs text-slate-500">
					<span class="font-medium text-slate-700">{node.author}</span>
					· score {node.score}
					{#if node.editedAt}· edited{/if}
				</p>
				<p class="mt-1 text-sm whitespace-pre-line text-slate-800">{node.body}</p>

				{#if canInteract}
					<div class="mt-1 flex items-center gap-2 text-xs">
						<form method="POST" action="?/voteComment" class="inline">
							<input type="hidden" name="commentId" value={node.id} />
							<input type="hidden" name="value" value="1" />
							<button
								type="submit"
								aria-label="upvote comment"
								class="rounded px-1.5 py-0.5 {node.myVote === 1
									? 'bg-green-100 text-green-700'
									: 'text-slate-500 hover:bg-slate-100'}"
							>
								▲
							</button>
						</form>
						<form method="POST" action="?/voteComment" class="inline">
							<input type="hidden" name="commentId" value={node.id} />
							<input type="hidden" name="value" value="-1" />
							<button
								type="submit"
								aria-label="downvote comment"
								class="rounded px-1.5 py-0.5 {node.myVote === -1
									? 'bg-red-100 text-red-700'
									: 'text-slate-500 hover:bg-slate-100'}"
							>
								▼
							</button>
						</form>

						{#if node.depth < maxDepth}
							<details class="inline">
								<summary class="cursor-pointer text-slate-500 hover:text-slate-900">Reply</summary>
								<form method="POST" action="?/comment" class="mt-2 flex gap-2">
									<input type="hidden" name="parentId" value={node.id} />
									<input
										name="body"
										type="text"
										required
										maxlength="2000"
										placeholder="Your reply..."
										class="grow rounded-md border-slate-300 text-sm"
									/>
									<button
										type="submit"
										class="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
									>
										Reply
									</button>
								</form>
							</details>
						{/if}

						{#if editable(node)}
							<details class="inline">
								<summary class="cursor-pointer text-slate-500 hover:text-slate-900">Edit</summary>
								<form method="POST" action="?/editComment" class="mt-2 flex gap-2">
									<input type="hidden" name="commentId" value={node.id} />
									<input
										name="body"
										type="text"
										required
										maxlength="2000"
										value={node.body}
										class="grow rounded-md border-slate-300 text-sm"
									/>
									<button
										type="submit"
										class="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
									>
										Save
									</button>
								</form>
							</details>
							<form method="POST" action="?/deleteComment" class="inline">
								<input type="hidden" name="commentId" value={node.id} />
								<button type="submit" class="text-slate-400 hover:text-red-600">Delete</button>
							</form>
						{/if}
					</div>
				{/if}
			{/if}

			{#if node.children.length > 0}
				<div class="mt-3">
					<CommentThread comments={node.children} {canInteract} {maxDepth} />
				</div>
			{/if}
		</li>
	{/each}
</ul>
