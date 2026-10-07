<script lang="ts">
	import { fmtTime } from '$lib/lyrics';
	import SectionPicker from '$lib/components/SectionPicker.svelte';
	import { getProject, pickFile } from '$lib/project.svelte';

	let { onnext }: { onnext: () => void } = $props();

	const project = getProject();
	let dragging = $state(false);

	function ondrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		for (const f of e.dataTransfer?.files ?? []) project.routeFile(f);
	}
</script>

<div
	class="drop"
	class:dragging
	role="region"
	aria-label="drop files here"
	ondragover={(e) => (e.preventDefault(), (dragging = true))}
	ondragleave={() => (dragging = false)}
	{ondrop}
>
	drop a video, song, lyrics or font file here, or pick them below.
</div>

<p>
	<label>
		<b>background video</b>
		(or image)<br />
		<input
			type="file"
			accept="video/*,image/*"
			onchange={(e) => pickFile(e, (f) => project.setMedia(f))}
		/>
	</label>
	<br /><small>{project.mediaFile?.name ?? 'none (a gradient will be used)'}</small>
</p>

<p>
	<label>
		<b>song</b><br />
		<input type="file" accept="audio/*" onchange={(e) => pickFile(e, (f) => project.setSong(f))} />
	</label>
	<br /><small>
		{project.songFile?.name ?? 'no song yet'}
		{#if project.decoding}(decoding…){:else if project.audioBuffer}({fmtTime(
				project.audioBuffer.duration
			)}){/if}
	</small>
</p>

<p><b>song section</b> <small>(the part you'll sync and export)</small></p>
<SectionPicker />

<p>
	<b>lyrics</b>
	(<label class="link"
		>load .txt / .lrc<input
			type="file"
			accept=".txt,.lrc,text/plain"
			hidden
			onchange={(e) => pickFile(e, (f) => project.setLyricsFile(f))}
		/></label
	>)
</p>
<textarea
	rows="14"
	placeholder="paste or type the lyrics. one line per lyric line.
blank lines are ignored."
	value={project.lyricsText}
	oninput={(e) => project.setLyricsText(e.currentTarget.value)}></textarea>
<p class="hint">
	{project.lines.length} lines · {project.wordCount} words · {project.syncedCount} synced. editing a line
	keeps the timings of words you didn't change.
</p>
<p>
	<button disabled={!project.songFile || !project.wordCount} onclick={onnext}>
		next: sync lyrics →
	</button>
</p>

<style>
	.drop {
		border: 2px dashed #999;
		padding: 15px;
		text-align: center;
	}
	.drop.dragging {
		background: yellow;
	}
	textarea {
		width: 100%;
	}
</style>
