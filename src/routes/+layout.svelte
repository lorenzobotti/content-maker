<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	// Bundled locally so the app (and canvas text) works offline.
	import '@fontsource/anton';
	import '@fontsource/bebas-neue';
	import '@fontsource/montserrat/800.css';
	import '@fontsource/permanent-marker';
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>tool to make tiktoks</title>
</svelte:head>

{@render children()}
