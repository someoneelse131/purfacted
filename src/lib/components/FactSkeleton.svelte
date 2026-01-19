<script lang="ts">
	export let count: number = 3;
</script>

<div class="space-y-4">
	{#each Array(count) as _}
		<div class="bg-white rounded-lg shadow-sm border p-6 animate-pulse">
			<!-- Header -->
			<div class="flex items-start justify-between mb-4">
				<div class="flex-1">
					<div class="h-5 bg-gray-200 rounded w-3/4 mb-2" />
					<div class="flex items-center gap-2">
						<div class="h-4 bg-gray-200 rounded w-20" />
						<div class="h-4 bg-gray-200 rounded-full w-16" />
					</div>
				</div>
				<div class="h-6 bg-gray-200 rounded-full w-24" />
			</div>

			<!-- Content -->
			<div class="space-y-2 mb-4">
				<div class="h-4 bg-gray-200 rounded w-full" />
				<div class="h-4 bg-gray-200 rounded w-full" />
				<div class="h-4 bg-gray-200 rounded w-2/3" />
			</div>

			<!-- Footer -->
			<div class="flex items-center justify-between pt-4 border-t">
				<div class="flex items-center gap-4">
					<div class="h-8 bg-gray-200 rounded w-24" />
					<div class="h-8 bg-gray-200 rounded w-24" />
				</div>
				<div class="flex items-center gap-2">
					<div class="h-5 w-5 bg-gray-200 rounded" />
					<div class="h-4 bg-gray-200 rounded w-8" />
				</div>
			</div>
		</div>
	{/each}
</div>
