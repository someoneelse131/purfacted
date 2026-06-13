<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>Categories - PurFacted</title></svelte:head>

<div class="mx-auto max-w-2xl">
	<h1 class="mb-6 text-2xl font-bold text-ink">Categories</h1>

	<ul class="mb-10 grid gap-3 sm:grid-cols-2">
		{#each data.tree as top (top.id)}
			<li class="card p-4">
				<a
					href="/categories/{top.slug}"
					class="font-medium text-ink hover:text-primary hover:underline"
				>
					{top.name}
				</a>
				{#if top.children.length > 0}
					<ul class="mt-2 space-y-1">
						{#each top.children as child (child.id)}
							<li>
								<a
									href="/categories/{child.slug}"
									class="text-sm text-ink-muted hover:text-primary hover:underline"
								>
									{child.name}
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			</li>
		{/each}
	</ul>

	{#if data.user}
		<section class="card p-4">
			<h2 class="mb-3 text-lg font-semibold text-ink">Propose a category</h2>
			{#if form?.proposed}
				<p class="alert-success mb-4" role="status">
					Proposal submitted - a moderator will review it.
				</p>
			{/if}
			{#if form?.error}
				<p class="alert-error mb-4" role="alert">
					{form.error}
				</p>
			{/if}
			<form method="POST" action="?/propose" class="space-y-4">
				<div>
					<label for="name" class="field-label">Name</label>
					<input
						id="name"
						name="name"
						type="text"
						required
						minlength="2"
						maxlength="60"
						class="input"
					/>
				</div>
				<div>
					<label for="parentId" class="field-label">Parent category (optional)</label>
					<select id="parentId" name="parentId" class="input">
						<option value="">None (top level)</option>
						{#each data.tree as top (top.id)}
							<option value={top.id}>{top.name}</option>
						{/each}
					</select>
				</div>
				<button type="submit" class="btn btn-primary">Submit proposal</button>
			</form>
		</section>
	{/if}
</div>
