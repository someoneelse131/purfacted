<script lang="ts">
	import '../app.css';
	import Nav from '$lib/components/Nav.svelte';
	import Toast from '$lib/components/Toast.svelte';

	export let data;
</script>

<div class="min-h-screen bg-gray-50">
	<Nav user={data.user} />
	<slot />
</div>
<Toast />
