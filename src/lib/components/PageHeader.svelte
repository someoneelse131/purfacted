<script lang="ts">
	export let title: string;
	export let description: string = '';
</script>

<div class="mb-6 sm:mb-8">
	<h1 class="text-2xl sm:text-3xl font-bold text-gray-900">{title}</h1>
	{#if description}
		<p class="mt-2 text-sm sm:text-base text-gray-600">{description}</p>
	{/if}
	<slot />
</div>
