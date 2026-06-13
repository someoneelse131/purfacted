<script lang="ts">
	let {
		action,
		targetType,
		targetId,
		label = 'Report',
		detailMax = 1000
	}: {
		action: string;
		targetType: string;
		targetId: string;
		label?: string;
		detailMax?: number;
	} = $props();
</script>

<details class="inline-block text-sm">
	<summary class="cursor-pointer text-slate-400 hover:text-red-600">{label}</summary>
	<form method="POST" {action} class="mt-2 flex flex-wrap items-end gap-2">
		<input type="hidden" name="targetType" value={targetType} />
		<input type="hidden" name="targetId" value={targetId} />
		<div>
			<label for="reason-{targetId}" class="mb-1 block text-xs font-medium text-slate-600">
				Reason
			</label>
			<select
				id="reason-{targetId}"
				name="reason"
				required
				class="rounded-md border-slate-300 text-sm"
			>
				<option value="spam">Spam</option>
				<option value="misinformation">Misinformation</option>
				<option value="harassment">Harassment</option>
				<option value="other">Other</option>
			</select>
		</div>
		<div class="grow">
			<label for="detail-{targetId}" class="mb-1 block text-xs font-medium text-slate-600">
				Details (optional)
			</label>
			<input
				id="detail-{targetId}"
				name="detail"
				type="text"
				maxlength={detailMax}
				class="w-full rounded-md border-slate-300 text-sm"
			/>
		</div>
		<button
			type="submit"
			class="rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-500"
		>
			Send report
		</button>
	</form>
</details>
