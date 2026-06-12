<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>Categories - PurFacted</title></svelte:head>

<div class="mx-auto max-w-2xl">
	<h1 class="mb-6 text-2xl font-bold text-slate-900">Categories</h1>

	<ul class="mb-10 grid gap-3 sm:grid-cols-2">
		{#each data.tree as top (top.id)}
			<li class="rounded-md border border-slate-200 bg-white p-4">
				<a href="/categories/{top.slug}" class="font-medium text-slate-900 hover:underline">
					{top.name}
				</a>
				{#if top.children.length > 0}
					<ul class="mt-2 space-y-1">
						{#each top.children as child (child.id)}
							<li>
								<a href="/categories/{child.slug}" class="text-sm text-slate-600 hover:underline">
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
		<section class="rounded-md border border-slate-200 bg-white p-4">
			<h2 class="mb-3 text-lg font-semibold text-slate-900">Propose a category</h2>
			{#if form?.proposed}
				<p class="mb-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-700" role="status">
					Proposal submitted - a moderator will review it.
				</p>
			{/if}
			{#if form?.error}
				<p class="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
					{form.error}
				</p>
			{/if}
			<form method="POST" action="?/propose" class="space-y-4">
				<div>
					<label for="name" class="mb-1 block text-sm font-medium text-slate-700">Name</label>
					<input
						id="name"
						name="name"
						type="text"
						required
						minlength="2"
						maxlength="60"
						class="w-full rounded-md border-slate-300"
					/>
				</div>
				<div>
					<label for="parentId" class="mb-1 block text-sm font-medium text-slate-700">
						Parent category (optional)
					</label>
					<select id="parentId" name="parentId" class="w-full rounded-md border-slate-300">
						<option value="">None (top level)</option>
						{#each data.tree as top (top.id)}
							<option value={top.id}>{top.name}</option>
						{/each}
					</select>
				</div>
				<button
					type="submit"
					class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
				>
					Submit proposal
				</button>
			</form>
		</section>
	{/if}
</div>
