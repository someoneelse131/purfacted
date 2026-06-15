<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const statusLabels: Record<string, string> = {
		PENDING: 'Pending review',
		APPROVED: 'Approved',
		REJECTED: 'Not approved'
	};
	const maxMb = $derived(Math.floor(data.limits.maxBytes / 1_000_000));
	const hasPending = $derived(data.applications.some((a) => a.status === 'PENDING'));
</script>

<svelte:head><title>Expert verification - PurFacted</title></svelte:head>

<div class="mx-auto max-w-2xl">
	<h1 class="mb-2 text-2xl font-bold text-ink">Expert verification</h1>
	<p class="mb-6 text-sm text-ink-muted">
		Verified experts vote with extra weight inside the categories they are verified for. Upload a
		credential, name your field and choose the categories you have expertise in. A moderator will
		review your application.
	</p>

	{#if form?.applied}
		<p class="alert-success mb-4" role="status">
			Application submitted. A moderator will review it shortly.
		</p>
	{/if}
	{#if form?.error}
		<p class="alert-error mb-4" role="alert">{form.error}</p>
	{/if}

	{#if data.applications.length > 0}
		<section class="mb-8">
			<h2 class="mb-3 text-lg font-semibold text-ink">Your applications</h2>
			<ul class="space-y-2">
				{#each data.applications as app (app.id)}
					<li class="card px-4 py-3" data-testid="expert-application">
						<div class="flex items-center justify-between gap-3">
							<span class="text-sm font-medium text-ink">{app.field}</span>
							<span
								class="chip text-[11px] font-medium tracking-wide uppercase"
								data-testid="application-status"
							>
								{statusLabels[app.status] ?? app.status}
							</span>
						</div>
						{#if app.note}
							<p class="mt-1 text-xs text-ink-faint">Moderator note: "{app.note}"</p>
						{/if}
						<p class="mt-1 text-xs text-ink-faint">
							{new Date(app.createdAt).toLocaleDateString('en-GB')}
						</p>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if hasPending}
		<p class="text-sm text-ink-muted">
			You have a pending application. You can apply again once it has been reviewed.
		</p>
	{:else}
		<section class="card p-4">
			<h2 class="mb-3 text-lg font-semibold text-ink">
				{data.isExpert ? 'Apply for another field' : 'Apply'}
			</h2>
			<form method="POST" action="?/apply" enctype="multipart/form-data" class="space-y-4">
				<div>
					<label for="field" class="field-label">Your field / specialty</label>
					<input
						id="field"
						name="field"
						type="text"
						required
						minlength={data.limits.fieldMin}
						maxlength={data.limits.fieldMax}
						placeholder="e.g. Climate science, Epidemiology"
						class="input text-sm"
					/>
				</div>

				<fieldset>
					<legend class="field-label">Categories you have expertise in</legend>
					<div class="grid gap-1 sm:grid-cols-2" data-testid="expert-categories">
						{#each data.tree as top (top.id)}
							<label class="flex items-center gap-2 text-sm text-ink">
								<input type="checkbox" name="categoryIds" value={top.id} />
								{top.name}
							</label>
							{#each top.children as child (child.id)}
								<label class="flex items-center gap-2 pl-4 text-sm text-ink-muted">
									<input type="checkbox" name="categoryIds" value={child.id} />
									{child.name}
								</label>
							{/each}
						{/each}
					</div>
				</fieldset>

				<div>
					<label for="credential" class="field-label"
						>Credential (PDF or image, max {maxMb} MB)</label
					>
					<input
						id="credential"
						name="credential"
						type="file"
						required
						accept={data.acceptMimes}
						class="input text-sm"
					/>
					<p class="mt-1 text-xs text-ink-faint">
						Your credential is stored privately and only visible to moderators.
					</p>
				</div>

				<button type="submit" class="btn btn-primary">Submit application</button>
			</form>
		</section>
	{/if}
</div>
