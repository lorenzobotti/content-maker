<script lang="ts">
	import { onMount } from 'svelte';
	import SyncPanel from '$lib/components/SyncPanel.svelte';
	import TimelineEditor from '$lib/components/TimelineEditor.svelte';
	import { fmtTime } from '$lib/lyrics';
	import { getProject } from '$lib/project.svelte';

	let { onnext, onchangesection }: { onnext: () => void; onchangesection: () => void } = $props();

	const project = getProject();
	let mode = $state<'tap' | 'timeline'>('tap');

	// Start syncing from the beginning of the chosen section.
	onMount(() => {
		const a = project.audioEl;
		if (a && a.paused && !project.inSection(a.currentTime)) a.currentTime = project.clipStart;
	});
</script>

{#if !project.songFile}
	<p>upload a song in setup first.</p>
{:else}
	<p>
		syncing section: <b>{fmtTime(project.clipStart)} – {fmtTime(project.clipEnd)}</b>
		({fmtTime(project.clipLength)})
		<button onclick={onchangesection}>change section</button>
	</p>
	<p class="hint">
		playback stops at the end of the section and jumps back to its start. if your lyrics cover the
		whole song, tap the first word sung in this section to start syncing there.
	</p>
	<p>
		<button class:active={mode === 'tap'} onclick={() => (mode = 'tap')}>tap to sync</button>
		<button class:active={mode === 'timeline'} onclick={() => (mode = 'timeline')}
			>timeline: fix timings</button
		>
	</p>
	{#if mode === 'tap'}
		<SyncPanel
			bind:lines={project.lines}
			audio={project.audioEl}
			currentTime={project.currentTime}
			paused={project.paused}
			play={() => project.play()}
			seek={(time) => project.seekInSection(time)}
		/>
	{:else}
		<TimelineEditor />
	{/if}
	<p>
		<button onclick={() => project.downloadLrc()} disabled={!project.syncedCount}
			>download .lrc</button
		>
		<button onclick={onnext}>next: style →</button>
	</p>
{/if}
