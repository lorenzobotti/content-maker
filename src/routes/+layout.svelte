<script lang="ts">
	// Bundled locally so the app (and canvas text) works offline.
	import '@fontsource/tiktok-sans/800.css';
	import '@fontsource/open-sans/800.css';
	import '@fontsource/bitcount-ink/400.css';
	import '@fontsource/playwrite-ca-guides/400.css';
	import '@fontsource/oswald/700.css';
	import '../app.css';

	let { children } = $props();
</script>

{@render children()}
