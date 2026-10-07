<script lang="ts">
	import { extensionFor, pickMimeType } from '$lib/exporter';
	import { fmtTime } from '$lib/lyrics';
	import SectionPicker from '$lib/components/SectionPicker.svelte';
	import { getProject } from '$lib/project.svelte';

	let { onexport }: { onexport: () => void } = $props();

	const project = getProject();
	const mimeType = pickMimeType();

	const problem = $derived(
		!mimeType
			? 'your browser cannot record video. use a recent chrome, edge or safari.'
			: !project.songFile
				? 'upload a song first.'
				: project.decoding || !project.audioBuffer
					? 'decoding song…'
					: project.clipLength < 1
						? 'the section must be at least 1 second long.'
						: ''
	);
</script>

<p><b>song section</b></p>
<SectionPicker disabled={project.exporting} />

<p>
	video length: {fmtTime(project.clipLength)}. 15–60 seconds works best on tiktok. output is
	1080×1920 {mimeType ? extensionFor(mimeType).toUpperCase() : ''}.
</p>
<p>
	<label
		>frame rate:
		<select bind:value={project.fps} disabled={project.exporting}>
			<option value={30}>30 fps</option>
			<option value={60}>60 fps</option>
		</select></label
	>
	<br />
	<label
		><input type="checkbox" bind:checked={project.monitor} disabled={project.exporting} />
		play audio while exporting</label
	>
</p>

<p class="hint">
	export records in real time ({fmtTime(project.clipLength)}). keep this tab visible until it
	finishes. browsers pause background tabs.
</p>
{#if problem}
	<p class="warn">{problem}</p>
{:else if !project.syncedCount}
	<p class="warn">no lyrics are synced yet: the video will have no lyrics.</p>
{/if}
{#if project.exportError}
	<p class="error">export failed: {project.exportError}</p>
{/if}

<p>
	{#if project.exporting}
		<progress value={project.progress} max="1"></progress>
		{Math.round(project.progress * 100)}%
		<button onclick={() => project.abort?.abort()}>cancel</button>
	{:else}
		<button disabled={!!problem} onclick={onexport}>export tiktok video</button>
	{/if}
</p>

{#if project.result}
	<!-- svelte-ignore a11y_media_has_caption -->
	<video src={project.result.url} controls playsinline width="160"></video>
	<p>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- local blob URL -->
		<a href={project.result.url} download={project.result.name}>download {project.result.name}</a>
		({(project.result.size / 1024 / 1024).toFixed(1)} mb)
	</p>
{/if}
