<script lang="ts">
	export let padding: 'none' | 'sm' | 'md' | 'lg' = 'md';
	export let hover: boolean = false;

	const paddings = {
		none: '',
		sm: 'p-4',
		md: 'p-4 sm:p-6',
		lg: 'p-6 sm:p-8'
	};
</script>

<div
	class="bg-white rounded-lg shadow-sm border {paddings[padding]} {hover
		? 'hover:shadow-md transition-shadow cursor-pointer'
		: ''}"
>
	<slot />
</div>
