<script lang="ts">
	import { onMount } from 'svelte';
	import SetupTab from '$lib/components/tabs/SetupTab.svelte';
	import SyncTab from '$lib/components/tabs/SyncTab.svelte';
	import StyleTab from '$lib/components/tabs/StyleTab.svelte';
	import ExportTab from '$lib/components/tabs/ExportTab.svelte';
	import AboutDialog from '$lib/components/AboutDialog.svelte';
	import { fmtTime } from '$lib/lyrics';
	import { drawFrame, HEIGHT, WIDTH, type Media } from '$lib/render';
	import { extensionFor, recordVideo } from '$lib/exporter';
	import { Project, setProject } from '$lib/project.svelte';

	const project = setProject(new Project());

	const TABS = [
		['setup', 'import'],
		['sync', 'sync lyrics'],
		['style', 'style'],
		['export', 'export']
	] as const;
	let tab = $state<(typeof TABS)[number][0]>('setup');

	let canvas: HTMLCanvasElement | undefined = $state();
	let videoEl: HTMLVideoElement | undefined = $state();
	let imgEl: HTMLImageElement | undefined = $state();
	let showGuides = $state(false);
	let aboutDialog: AboutDialog | undefined = $state();

	onMount(() => {
		const ctx = canvas!.getContext('2d')!;
		let raf = 0;
		const loop = () => {
			const audio = project.audioEl;
			if (!project.exporting && audio) {
				project.enforceSection();
				const t = audio.currentTime;
				syncVideo(t, !audio.paused, audio.playbackRate);
				drawFrame(ctx, currentMedia(), t, project.timeline, project.style);
			}
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	});

	function currentMedia(): Media {
		if (project.mediaKind === 'video') return videoEl ?? null;
		if (project.mediaKind === 'image') return imgEl ?? null;
		return null;
	}

	const mod = (a: number, n: number) => ((a % n) + n) % n;

	/** Keep the (looping, muted) background video aligned to song time. */
	function syncVideo(t: number, playing: boolean, rate: number) {
		const v = videoEl;
		if (project.mediaKind !== 'video' || !v || !v.duration || v.seeking) return;
		const target = mod(project.videoOffset + (t - project.clipStart), v.duration);
		let diff = Math.abs(v.currentTime - target);
		diff = Math.min(diff, v.duration - diff);
		if (!playing) {
			if (!v.paused) v.pause();
			if (diff > 0.05) v.currentTime = target;
			return;
		}
		if (v.playbackRate !== rate) v.playbackRate = rate;
		if (diff > 0.35) v.currentTime = target;
		if (v.paused) v.play().catch(() => {});
	}

	function onkeydown(e: KeyboardEvent) {
		if (tab === 'sync' || e.code !== 'Space') return;
		if ((e.target as HTMLElement).matches('input:not([type=range]), textarea, select, button'))
			return;
		e.preventDefault();
		project.togglePlay();
	}

	async function startExport() {
		if (!project.audioBuffer || !canvas) return;
		project.audioEl?.pause();
		project.exportError = '';
		project.progress = 0;
		if (project.result) URL.revokeObjectURL(project.result.url);
		project.result = null;
		project.exporting = true;
		const ctx = canvas.getContext('2d')!;
		try {
			await project.loadFont();
			if (project.mediaKind === 'video' && videoEl?.duration) {
				videoEl.playbackRate = 1;
				const seeked = new Promise((r) => {
					videoEl!.addEventListener('seeked', r, { once: true });
					setTimeout(r, 1500);
				});
				videoEl.currentTime = mod(project.videoOffset, videoEl.duration);
				await seeked;
			}
			project.abort = new AbortController();
			const { blob, mimeType } = await recordVideo({
				canvas,
				audio: project.audioBuffer,
				start: project.clipStart,
				end: project.clipEnd,
				fps: project.fps,
				monitor: project.monitor,
				signal: project.abort.signal,
				onProgress: (p) => (project.progress = p),
				render: (t) => {
					syncVideo(t, true, 1);
					drawFrame(ctx, currentMedia(), t, project.timeline, project.style);
				}
			});
			project.result = {
				url: URL.createObjectURL(blob),
				name: `${project.baseName()}-tiktok.${extensionFor(mimeType)}`,
				size: blob.size
			};
		} catch (e) {
			if ((e as Error).name !== 'AbortError')
				project.exportError = (e as Error).message ?? String(e);
		} finally {
			project.exporting = false;
			project.abort = null;
			videoEl?.pause();
		}
	}
</script>

<svelte:window {onkeydown} />

<!-- Hidden media elements that feed the canvas. -->
<div hidden>
	{#if project.mediaKind === 'video'}
		<video bind:this={videoEl} src={project.mediaUrl} muted loop playsinline preload="auto"></video>
	{:else if project.mediaKind === 'image'}
		<img bind:this={imgEl} src={project.mediaUrl} alt="" />
	{/if}
</div>
<audio
	bind:this={project.audioEl}
	src={project.songUrl}
	bind:currentTime={project.currentTime}
	bind:duration={project.duration}
	bind:paused={project.paused}
	onloadedmetadata={() => project.fitClipToSong()}
	preload="auto"
></audio>

<div class="layout">
	<div class="editor">
		<h1>
			tool to make tiktoks
			<button
				class="about"
				aria-label="informazioni sul progetto / about this project"
				title="informazioni sul progetto / about this project"
				onclick={() => aboutDialog?.open()}>?</button
			>
		</h1>
		<AboutDialog bind:this={aboutDialog} />
		<p>
			{#each TABS as [id, label] (id)}
				<button class:active={tab === id} onclick={() => (tab = id)}>{label}</button>
			{/each}
		</p>
		<hr />

		{#if tab === 'setup'}
			<SetupTab onnext={() => (tab = 'sync')} />
		{:else if tab === 'sync'}
			<SyncTab onnext={() => (tab = 'style')} onchangesection={() => (tab = 'setup')} />
		{:else if tab === 'style'}
			<StyleTab onnext={() => (tab = 'export')} />
		{:else}
			<ExportTab onexport={startExport} />
		{/if}
	</div>

	<div class="preview">
		<div class="frame">
			<canvas bind:this={canvas} width={WIDTH} height={HEIGHT}></canvas>
			{#if showGuides}
				<div class="guide right"></div>
				<div class="guide bottom"></div>
			{/if}
			{#if project.exporting}<div class="rec">rec {Math.round(project.progress * 100)}%</div>{/if}
		</div>
		<p>
			<button
				onclick={() => project.togglePlay()}
				disabled={!project.songFile || project.exporting}
				title={project.paused ? 'Play' : 'Pause'}
			>
				{project.paused ? 'Play' : 'Pause'}
			</button>
			<input
				type="range"
				min="0"
				max={project.duration || 0}
				step="0.01"
				bind:value={project.currentTime}
				disabled={!project.songFile || project.exporting}
			/>
			<br />
			{fmtTime(project.currentTime)} / {fmtTime(project.duration)}
		</p>
		<label><input type="checkbox" bind:checked={showGuides} /> show tiktok ui safe zones</label>
	</div>
</div>

<style>
	.layout {
		display: flex;
		flex-wrap: wrap;
		gap: 20px;
		align-items: flex-start;
	}
	.editor {
		flex: 1;
		min-width: 320px;
	}
	.preview {
		width: 300px;
		position: sticky;
		top: 10px;
	}
	.frame {
		position: relative;
		border: 1px solid #000;
	}
	canvas {
		display: block;
		width: 100%;
		aspect-ratio: 9 / 16;
	}
	.guide {
		position: absolute;
		border: 2px dashed red;
		pointer-events: none;
	}
	.guide.right {
		right: 0;
		top: 35%;
		width: 15%;
		height: 45%;
	}
	.guide.bottom {
		left: 0;
		right: 0;
		bottom: 0;
		height: 20%;
	}
	.about {
		font-size: 12px;
		vertical-align: middle;
	}
	.rec {
		position: absolute;
		top: 5px;
		left: 5px;
		background: red;
		color: #fff;
		padding: 2px 5px;
	}
</style>
