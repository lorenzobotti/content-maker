<script lang="ts">
	import { extensionFor, pickMimeType } from '$lib/exporter';
	import { fmtTime } from '$lib/lyrics';
	import SectionPicker from '$lib/components/SectionPicker.svelte';
	import { getProject, pickFile } from '$lib/project.svelte';

	let { onexport }: { onexport: () => void } = $props();

	const project = getProject();
	const mimeType = pickMimeType();

	const problem = $derived(
		!mimeType
			? 'your browser cannot record video. use a recent chrome, edge or safari.'
			: project.mediaStatus === 'failed'
				? "this browser can't play the background. convert it or pick another file."
				: !project.audioFile
					? 'add a video or a song first.'
					: project.decodeError ||
						(project.decoding || !project.audioBuffer
							? `decoding ${project.audioLabel}…`
							: project.clipLength < 1
								? 'the section must be at least 1 second long.'
								: '')
	);
</script>

<p><b>{project.audioLabel} section</b></p>
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
		>file name:
		<input
			type="text"
			placeholder="{project.baseName()}-tiktok"
			bind:value={project.videoName}
			disabled={project.exporting}
		/></label
	>
	<small>(optional)</small>
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

<hr />
<p><b>subtitle files</b></p>
<p>
	<label
		>max characters per row:
		<input type="number" min="0" step="1" bind:value={project.subtitles.maxWidth} /></label
	>
	<small>(0 = no limit)</small>
	<br />
	<label
		>hold finished line:
		<input type="number" min="0" step="0.1" bind:value={project.subtitles.holdSeconds} /> s</label
	>
	<br />
	<label
		>offset:
		<input type="number" step="0.001" bind:value={project.subtitles.offsetSeconds} /> s</label
	>
	<small>(e.g. 3600 to start at 01:00:00)</small>
	<br />
	<label><input type="checkbox" bind:checked={project.subtitles.bold} /> bold (srt only)</label>
	<br />
	<label
		>file name:
		<input type="text" placeholder={project.baseName()} bind:value={project.subtitleName} /></label
	>
	<small>(optional)</small>
</p>
<p class="hint">
	each srt subtitle adds one word to the line. in .lrc, rows longer than the limit become separate
	lines.
</p>
<p>
	<button onclick={() => project.downloadSubtitles('srt')} disabled={!project.syncedCount}
		>download .srt</button
	>
	<button onclick={() => project.downloadSubtitles('lrc')} disabled={!project.syncedCount}
		>download .lrc</button
	>
</p>
<p>
	<b>convert a file</b>
	(<label class="link"
		>pick .lrc or .srt<input
			type="file"
			accept=".lrc,.srt,text/plain"
			hidden
			onchange={(e) => pickFile(e, (f) => project.convertSubtitleFile(f))}
		/></label
	>)
	<br /><small>.lrc becomes .srt and .srt becomes .lrc, using the settings above.</small>
</p>
{#if project.convertError}
	<p class="error">{project.convertError}</p>
{/if}

<style>
	input[type='number'] {
		width: 6em;
	}
</style>
