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
	<summary class="cursor-pointer text-ink-faint hover:text-status-refuted-strong">{label}</summary>
	<form method="POST" {action} class="mt-2 flex flex-wrap items-end gap-2">
		<input type="hidden" name="targetType" value={targetType} />
		<input type="hidden" name="targetId" value={targetId} />
		<div>
			<label for="reason-{targetId}" class="field-label text-xs">Reason</label>
			<select id="reason-{targetId}" name="reason" required class="input w-auto text-sm">
				<option value="spam">Spam</option>
				<option value="misinformation">Misinformation</option>
				<option value="harassment">Harassment</option>
				<option value="other">Other</option>
			</select>
		</div>
		<div class="grow">
			<label for="detail-{targetId}" class="field-label text-xs">Details (optional)</label>
			<input
				id="detail-{targetId}"
				name="detail"
				type="text"
				maxlength={detailMax}
				class="input text-sm"
			/>
		</div>
		<button type="submit" class="btn btn-sm btn-danger">Send report</button>
	</form>
</details>
