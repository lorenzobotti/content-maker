<script lang="ts">
	import { fmtTime } from '$lib/lyrics';
	import { getProject, MIN_SECTION } from '$lib/project.svelte';
	import { getPeaks } from '$lib/waveform';

	let { disabled = false }: { disabled?: boolean } = $props();

	const project = getProject();
	const BUCKETS = 800;
	const WAVE_HEIGHT = 76;
	/** How close (px) a press must be to a handle to drag it. */
	const HANDLE_PX = 10;

	let width = $state(0);
	let wrap: HTMLDivElement | undefined = $state();
	let canvas: HTMLCanvasElement | undefined = $state();
	let cursor = $state('crosshair');

	const duration = $derived(project.audioBuffer?.duration || project.duration || 0);

	const peaks = $derived(project.audioBuffer ? getPeaks(project.audioBuffer, BUCKETS) : null);

	const toX = (t: number) => (duration ? (t / duration) * width : 0);

	$effect(() => {
		if (!canvas || !width) return;
		const dpr = devicePixelRatio || 1;
		if (canvas.width !== Math.round(width * dpr)) canvas.width = Math.round(width * dpr);
		if (canvas.height !== WAVE_HEIGHT * dpr) canvas.height = WAVE_HEIGHT * dpr;
		const ctx = canvas.getContext('2d')!;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, width, WAVE_HEIGHT);

		const css = getComputedStyle(canvas);
		const accent = css.getPropertyValue('--accent').trim() || '#ffd400';
		const muted = css.getPropertyValue('--muted').trim() || '#9a9aab';
		const text = css.getPropertyValue('--text').trim() || '#fff';

		const x0 = toX(project.clipStart);
		const x1 = toX(project.clipEnd);
		ctx.fillStyle = accent;
		ctx.globalAlpha = 0.12;
		ctx.fillRect(x0, 0, x1 - x0, WAVE_HEIGHT);

		if (peaks) {
			const bars = Math.floor(width / 3);
			for (let i = 0; i < bars; i++) {
				const x = i * 3;
				const peak = peaks[Math.floor((i / bars) * BUCKETS)];
				const h = Math.max(2, peak * (WAVE_HEIGHT - 10));
				const inside = x >= x0 && x <= x1;
				ctx.globalAlpha = inside ? 1 : 0.4;
				ctx.fillStyle = inside ? accent : muted;
				ctx.fillRect(x, (WAVE_HEIGHT - h) / 2, 2, h);
			}
		}

		// Section handles.
		ctx.globalAlpha = 1;
		ctx.fillStyle = accent;
		for (const x of [x0, x1]) {
			ctx.fillRect(x - 1, 0, 2, WAVE_HEIGHT);
			ctx.fillRect(x - 4, WAVE_HEIGHT / 2 - 10, 8, 20);
		}

		// Playhead.
		ctx.fillStyle = text;
		ctx.fillRect(toX(project.currentTime) - 1, 0, 2, WAVE_HEIGHT);
	});

	let drag: { mode: 'start' | 'end' | 'new'; anchor: number; x: number; moved: boolean } | null =
		null;

	function timeAt(e: PointerEvent) {
		const r = wrap!.getBoundingClientRect();
		return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * duration;
	}

	function handleAt(e: PointerEvent): 'start' | 'end' | null {
		const x = e.clientX - wrap!.getBoundingClientRect().left;
		// Fingers are less precise than a mouse.
		const reach = e.pointerType === 'mouse' ? HANDLE_PX : HANDLE_PX * 2.5;
		if (Math.abs(x - toX(project.clipStart)) <= reach) return 'start';
		if (Math.abs(x - toX(project.clipEnd)) <= reach) return 'end';
		return null;
	}

	function onpointerdown(e: PointerEvent) {
		if (disabled || !duration) return;
		wrap!.setPointerCapture(e.pointerId);
		drag = { mode: handleAt(e) ?? 'new', anchor: timeAt(e), x: e.clientX, moved: false };
	}

	function onpointermove(e: PointerEvent) {
		if (!drag) {
			cursor = disabled ? 'default' : handleAt(e) ? 'ew-resize' : 'crosshair';
			return;
		}
		if (Math.abs(e.clientX - drag.x) > 3) drag.moved = true;
		if (!drag.moved) return;
		const t = timeAt(e);
		// Assign directly while dragging; setSection() tidies up on release.
		if (drag.mode === 'start') project.clipStart = Math.min(t, project.clipEnd - MIN_SECTION);
		else if (drag.mode === 'end') project.clipEnd = Math.max(t, project.clipStart + MIN_SECTION);
		else {
			project.clipStart = Math.min(drag.anchor, t);
			project.clipEnd = Math.max(drag.anchor, t);
		}
	}

	function onpointerup(e: PointerEvent) {
		if (!drag) return;
		// A click without dragging moves the playhead instead.
		if (!drag.moved && project.audioEl) project.audioEl.currentTime = timeAt(e);
		else project.setSection(project.clipStart, project.clipEnd);
		drag = null;
	}

	function setLength(seconds: number) {
		project.setSection(project.clipStart, project.clipStart + seconds);
	}

	function playSection() {
		if (!project.audioEl) return;
		project.audioEl.currentTime = project.clipStart;
		project.play();
	}
</script>

{#if !project.audioBuffer}
	<p class="hint">{project.decoding ? 'reading the song…' : 'upload a song to pick a section.'}</p>
{:else}
	<div
		class="wave"
		class:disabled
		bind:this={wrap}
		bind:clientWidth={width}
		style:cursor
		role="group"
		aria-label="song waveform: drag to select a section, click to move the playhead"
		{onpointerdown}
		{onpointermove}
		{onpointerup}
		onpointercancel={() => (drag = null)}
	>
		<canvas bind:this={canvas} style:height="{WAVE_HEIGHT}px"></canvas>
	</div>
	<p>
		start: <b>{fmtTime(project.clipStart)}</b>
		<button {disabled} onclick={() => project.setSection(project.currentTime, project.clipEnd)}
			>set to playhead</button
		>
		&nbsp; end: <b>{fmtTime(project.clipEnd)}</b>
		<button {disabled} onclick={() => project.setSection(project.clipStart, project.currentTime)}
			>set to playhead</button
		>
		&nbsp; length: {fmtTime(project.clipLength)}
		<br />
		<button {disabled} onclick={playSection}>▶ play section</button>
		<button
			{disabled}
			onclick={() => project.togglePlay(true)}
			title="play the whole song from the playhead, ignoring the section"
			>{project.paused ? '▶ listen from playhead' : '❚❚ pause'}</button
		>
		|
		{#each [15, 30, 60] as n (n)}
			<button {disabled} onclick={() => setLength(n)}>{n}s</button>
		{/each}
		<button {disabled} onclick={() => project.setSection(0, duration)}>whole song</button>
		<br /><small
			>drag on the waveform to select, drag the handles to adjust, click to move the playhead.</small
		>
	</p>
{/if}

<style>
	.wave {
		border: 1px solid #999;
		background: var(--panel-2);
		touch-action: none;
		user-select: none;
	}
	.wave.disabled {
		opacity: 0.5;
	}
	canvas {
		display: block;
		width: 100%;
	}
</style>
