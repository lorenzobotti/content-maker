<script lang="ts">
	// Bundled locally so the app (and canvas text) works offline.
	// Every weight offered in BUILTIN_FONTS; files only download once a weight is used.
	import '@fontsource/tiktok-sans/300.css';
	import '@fontsource/tiktok-sans/400.css';
	import '@fontsource/tiktok-sans/500.css';
	import '@fontsource/tiktok-sans/600.css';
	import '@fontsource/tiktok-sans/700.css';
	import '@fontsource/tiktok-sans/800.css';
	import '@fontsource/tiktok-sans/900.css';
	import '@fontsource/open-sans/300.css';
	import '@fontsource/open-sans/400.css';
	import '@fontsource/open-sans/500.css';
	import '@fontsource/open-sans/600.css';
	import '@fontsource/open-sans/700.css';
	import '@fontsource/open-sans/800.css';
	import '@fontsource/bitcount-ink/100.css';
	import '@fontsource/bitcount-ink/200.css';
	import '@fontsource/bitcount-ink/300.css';
	import '@fontsource/bitcount-ink/400.css';
	import '@fontsource/bitcount-ink/500.css';
	import '@fontsource/bitcount-ink/600.css';
	import '@fontsource/bitcount-ink/700.css';
	import '@fontsource/bitcount-ink/800.css';
	import '@fontsource/bitcount-ink/900.css';
	import '@fontsource/playwrite-ca-guides/400.css';
	import '@fontsource/oswald/200.css';
	import '@fontsource/oswald/300.css';
	import '@fontsource/oswald/400.css';
	import '@fontsource/oswald/500.css';
	import '@fontsource/oswald/600.css';
	import '@fontsource/oswald/700.css';
	import '../app.css';

	let { children } = $props();
</script>

{@render children()}
