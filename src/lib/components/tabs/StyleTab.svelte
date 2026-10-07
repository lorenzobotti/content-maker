<script lang="ts">
	import { BUILTIN_FONTS } from '$lib/fonts';
	import { getProject, pickFile } from '$lib/project.svelte';
	import { defaultStyle, type Easing, type LyricMode } from '$lib/render';

	let { onnext }: { onnext: () => void } = $props();

	const project = getProject();
	const style = $derived(project.style);
	const selectedCustom = $derived(project.customFonts.find((f) => f.css === style.font));

	const MODES: [LyricMode, string][] = [
		['karaoke', 'karaoke line'],
		['reveal', 'word pop-in'],
		['word', 'one word at a time']
	];
	const EASINGS: [Easing, string][] = [
		['bounce', 'bouncy'],
		['smooth', 'smooth'],
		['linear', 'linear']
	];
</script>

<p>
	<b>animation:</b>
	{#each MODES as [id, label] (id)}
		<button class:active={style.mode === id} onclick={() => (style.mode = id)}>{label}</button>
	{/each}
</p>

<p>
	<label><input type="checkbox" bind:checked={style.animate} /> ease words in and out</label>
	{#if style.animate}
		<br />
		<label
			>ease in: {style.animIn}ms
			<input type="range" min="0" max="600" step="10" bind:value={style.animIn} /></label
		><br />
		<label
			>ease out: {style.animOut}ms
			<input type="range" min="0" max="600" step="10" bind:value={style.animOut} /></label
		><br />
		easing:
		{#each EASINGS as [id, label] (id)}
			<button class:active={style.animEasing === id} onclick={() => (style.animEasing = id)}
				>{label}</button
			>
		{/each}<br />
		<label
			>pop strength: {Math.round(style.animPop * 100)}%
			<input type="range" min="0" max="1" step="0.05" bind:value={style.animPop} /></label
		>
	{/if}
</p>

<p>
	<b>font:</b>
	<select
		aria-label="font"
		value={style.font}
		onchange={(e) =>
			project.selectFont(project.fonts.find((f) => f.css === e.currentTarget.value)!)}
	>
		<optgroup label="built-in">
			{#each BUILTIN_FONTS as f (f.css)}
				<option value={f.css}>{f.label}</option>
			{/each}
		</optgroup>
		{#if project.customFonts.length}
			<optgroup label="imported">
				{#each project.customFonts as f (f.css)}
					<option value={f.css}>{f.label}</option>
				{/each}
			</optgroup>
		{/if}
		{#if !project.fonts.some((f) => f.css === style.font)}
			<option value={style.font} disabled>missing font. please re-import it</option>
		{/if}
	</select>
	<label class="link"
		>import font…<input
			type="file"
			accept=".ttf,.otf,.woff,.woff2"
			hidden
			onchange={(e) => pickFile(e, (f) => project.importFont(f))}
		/></label
	>
	{#if selectedCustom}
		<button onclick={() => project.removeFont(selectedCustom)}>remove</button>
	{/if}
	{#if project.fontErrorFile}
		<br /><span class="error"
			>"{project.fontErrorFile}" isn't a font file the browser can read.</span
		>
	{/if}
	<br />
	<label
		>size: {style.size}px
		<input type="range" min="48" max="160" bind:value={style.size} /></label
	>
</p>

<p>
	<label>text colour: <input type="color" bind:value={style.color} /></label>
	<label>highlight colour: <input type="color" bind:value={style.highlight} /></label>
	<br />
	<label
		>vertical position:
		<input type="range" min="0.15" max="0.8" step="0.01" bind:value={style.position} /></label
	><br />
	<label
		>darken background: {Math.round(style.dim * 100)}%
		<input type="range" min="0" max="0.8" step="0.05" bind:value={style.dim} /></label
	><br />
	<label><input type="checkbox" bind:checked={style.uppercase} /> uppercase</label>
	<label><input type="checkbox" bind:checked={style.shadow} /> shadow</label>
	<label><input type="checkbox" bind:checked={style.stroke} /> outline</label>
	{#if style.stroke}<input
			type="color"
			bind:value={style.strokeColor}
			title="outline colour"
		/>{/if}
</p>

<p>
	<label
		>headline <small>(optional, e.g. "new single out friday")</small><br />
		<input
			type="text"
			size="40"
			bind:value={style.headline}
			placeholder="artist – song title"
		/></label
	>
	{#if style.headline}
		<br />
		<label
			>headline size: {style.headlineSize}px
			<input type="range" min="32" max="120" bind:value={style.headlineSize} /></label
		>
	{/if}
</p>

<p>
	<label
		>lyric timing nudge: {style.offset}ms
		<input type="range" min="-500" max="500" step="10" bind:value={style.offset} /></label
	>
	<br /><small
		>if words appear late, move right. late taps are common, so +50–100ms often helps.</small
	>
	{#if project.mediaKind === 'video'}
		<br />
		<label
			>background video starts at (s):
			<input type="number" min="0" step="0.1" bind:value={project.videoOffset} /></label
		>
	{/if}
</p>

<p>
	<button onclick={() => (project.style = { ...defaultStyle })}>reset style</button>
	<button onclick={onnext}>next: export →</button>
</p>
