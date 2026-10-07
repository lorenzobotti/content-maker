<script lang="ts">
	import { tick } from 'svelte';
	import { fmtTime, type Line, type Word } from '$lib/lyrics';
	import { getProject } from '$lib/project.svelte';
	import { getPeaks } from '$lib/waveform';

	const project = getProject();

	const PEAKS_PER_SEC = 100;
	/** Words stay at least this far apart (ms) so their order never flips. */
	const MIN_GAP = 10;
	/** Longest a word block is drawn (ms) when nothing follows it soon. */
	const MAX_BLOCK = 3000;
	const RULER = 22;
	const LANE = 34;
	const LANE_GAP = 8;
	const HEIGHT = RULER + 2 * LANE + LANE_GAP + 14;
	const MIN_ZOOM = 40;
	const MAX_ZOOM = 600;

	/** Zoom, in pixels per second. */
	let pps = $state(160);
	let follow = $state(true);
	/** Touch-friendly stand-in for shift-drag: dragging a word also moves every word after it. */
	let moveRest = $state(false);
	let scroller: HTMLDivElement | undefined = $state();
	let canvas: HTMLCanvasElement | undefined = $state();
	let viewWidth = $state(0);
	let scrollLeft = $state(0);
	let selected = $state<{ li: number; wi: number } | null>(null);
	let history = $state.raw<Line[][]>([]);

	const duration = $derived(project.audioBuffer?.duration || project.duration || 0);
	// Show the chosen section with a little context either side.
	const viewStart = $derived(project.hasSection() ? Math.max(0, project.clipStart - 1) : 0);
	const viewEnd = $derived(
		project.hasSection() ? Math.min(duration, project.clipEnd + 1) : duration
	);
	const contentWidth = $derived(Math.max(0, (viewEnd - viewStart) * pps));
	const peaks = $derived(
		project.audioBuffer
			? getPeaks(project.audioBuffer, Math.ceil(project.audioBuffer.duration * PEAKS_PER_SEC))
			: null
	);

	const toX = (t: number) => (t - viewStart) * pps;
	const laneTop = (li: number) => RULER + 4 + (li % 2) * (LANE + LANE_GAP);

	interface Timed {
		li: number;
		wi: number;
		/** ms */
		start: number;
	}

	function timedWords(): Timed[] {
		const out: Timed[] = [];
		project.lines.forEach((l, li) =>
			l.words.forEach((w, wi) => w.start != null && out.push({ li, wi, start: w.start }))
		);
		return out;
	}

	/** Synced words in view, each drawn until the next word (or its line end). In seconds. */
	const blocks = $derived.by(() => {
		const timed = timedWords();
		return timed
			.map((b, i) => {
				const next = timed[i + 1];
				const lineEnd = project.lines[b.li].end;
				let end = next ? next.start : b.start + MAX_BLOCK;
				if ((!next || next.li !== b.li) && lineEnd != null && lineEnd > b.start)
					end = Math.min(end, lineEnd);
				end = Math.min(end, b.start + MAX_BLOCK);
				const text = project.lines[b.li].words[b.wi].text;
				return { li: b.li, wi: b.wi, text, start: b.start / 1000, end: end / 1000 };
			})
			.filter((b) => b.end >= viewStart && b.start <= viewEnd);
	});

	const lineEnds = $derived(
		project.lines.flatMap((l, li) =>
			l.end != null && l.end / 1000 >= viewStart && l.end / 1000 <= viewEnd
				? [{ li, t: l.end / 1000 }]
				: []
		)
	);

	const selectedWord = $derived(
		selected ? project.lines[selected.li]?.words[selected.wi] : undefined
	);

	// --- waveform + ruler --------------------------------------------------------
	$effect(() => {
		if (!canvas || !viewWidth) return;
		const dpr = devicePixelRatio || 1;
		const w = Math.round(viewWidth * dpr);
		if (canvas.width !== w) canvas.width = w;
		if (canvas.height !== HEIGHT * dpr) canvas.height = HEIGHT * dpr;
		const ctx = canvas.getContext('2d')!;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, viewWidth, HEIGHT);

		const css = getComputedStyle(canvas);
		const muted = css.getPropertyValue('--muted').trim() || '#9a9aab';
		const text = css.getPropertyValue('--text').trim() || '#fff';
		const t0 = viewStart + scrollLeft / pps;

		if (peaks) {
			ctx.fillStyle = muted;
			ctx.globalAlpha = 0.35;
			const mid = RULER + (HEIGHT - RULER) / 2;
			const maxH = HEIGHT - RULER - 6;
			for (let px = 0; px < viewWidth; px += 2) {
				const v = peaks[Math.floor((t0 + px / pps) * PEAKS_PER_SEC)] ?? 0;
				const h = Math.max(1, v * maxH);
				ctx.fillRect(px, mid - h / 2, 1.5, h);
			}
			ctx.globalAlpha = 1;
		}

		// Dim the context outside the chosen section.
		if (project.hasSection()) {
			ctx.fillStyle = 'rgba(0,0,0,0.4)';
			const a = (project.clipStart - t0) * pps;
			const b = (project.clipEnd - t0) * pps;
			if (a > 0) ctx.fillRect(0, 0, a, HEIGHT);
			if (b < viewWidth) ctx.fillRect(Math.max(0, b), 0, viewWidth - b, HEIGHT);
		}

		const major = pps >= 120 ? 1 : pps >= 60 ? 2 : 5;
		const minor = major === 1 ? 0.25 : major / 2;
		ctx.font = '11px system-ui, sans-serif';
		ctx.textBaseline = 'top';
		ctx.fillStyle = muted;
		ctx.fillRect(0, RULER - 1, viewWidth, 1);
		for (let k = Math.floor(t0 / minor); (k * minor - t0) * pps < viewWidth; k++) {
			const t = k * minor;
			const px = Math.round((t - t0) * pps);
			const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
			ctx.fillStyle = isMajor ? text : muted;
			ctx.fillRect(px, RULER - (isMajor ? 9 : 5), 1, isMajor ? 8 : 4);
			if (isMajor)
				ctx.fillText(
					`${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`,
					px + 3,
					3
				);
		}
	});

	// Keep the playhead in view while playing.
	$effect(() => {
		const px = toX(project.currentTime);
		if (!follow || project.paused || !scroller || drag) return;
		if (px < scroller.scrollLeft || px > scroller.scrollLeft + viewWidth * 0.85)
			scroller.scrollLeft = Math.max(0, px - viewWidth * 0.2);
	});

	async function setZoom(next: number) {
		next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
		if (!scroller) return void (pps = next);
		// Keep the time at the centre of the view where it is.
		const center = viewStart + (scroller.scrollLeft + viewWidth / 2) / pps;
		pps = next;
		await tick();
		scroller.scrollLeft = (center - viewStart) * pps - viewWidth / 2;
	}

	function seek(t: number) {
		if (project.audioEl) project.audioEl.currentTime = Math.max(0, Math.min(t, duration));
	}

	// --- editing -------------------------------------------------------------------
	function pushHistory(before: Line[]) {
		history = [...history.slice(-99), before];
	}

	function undo() {
		const last = history.at(-1);
		if (!last) return;
		history = history.slice(0, -1);
		project.lines = last;
	}

	/** How far (ms) a single word may move before bumping into its neighbours or its line end. */
	function limits(timed: Timed[], i: number) {
		const me = timed[i];
		const prev = timed[i - 1];
		const next = timed[i + 1];
		let max = next ? next.start - MIN_GAP : duration * 1000;
		const lineEnd = project.lines[me.li].end;
		if ((!next || next.li !== me.li) && lineEnd != null && lineEnd > me.start)
			max = Math.min(max, lineEnd - MIN_GAP);
		return { min: (prev ? prev.start + MIN_GAP : 0) - me.start, max: max - me.start };
	}

	interface Drag {
		x0: number;
		moved: boolean;
		words: { w: Word; orig: number }[];
		ends: { line: Line; orig: number }[];
		min: number;
		max: number;
		before: Line[];
		/** Where to move the playhead if this turns out to be a click. */
		clickTime: number;
	}
	let drag: Drag | null = null;

	function startWordDrag(e: PointerEvent, li: number, wi: number) {
		if (e.button !== 0) return;
		e.stopPropagation();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		selected = { li, wi };
		const timed = timedWords();
		const i = timed.findIndex((t) => t.li === li && t.wi === wi);
		const me = timed[i];
		let { min, max } = limits(timed, i);
		const rest = e.shiftKey || moveRest;
		const moving = rest ? timed.slice(i) : [me];
		const ends = rest
			? project.lines.filter((l, idx) => idx >= li && l.end != null && l.end > me.start)
			: [];
		// Shift-drag moves everything after too, so only the previous word limits it.
		if (rest) max = duration * 1000 - timed[timed.length - 1].start;
		drag = {
			x0: e.clientX,
			moved: false,
			words: moving.map((t) => ({ w: project.lines[t.li].words[t.wi], orig: t.start })),
			ends: ends.map((line) => ({ line, orig: line.end! })),
			min,
			max,
			before: $state.snapshot(project.lines),
			clickTime: me.start / 1000
		};
	}

	function startEndDrag(e: PointerEvent, li: number) {
		if (e.button !== 0) return;
		e.stopPropagation();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		selected = null;
		const line = project.lines[li];
		const timed = timedWords();
		const lastInLine = timed.filter((t) => t.li === li).at(-1);
		const nextLine = timed.find((t) => t.li > li);
		drag = {
			x0: e.clientX,
			moved: false,
			words: [],
			ends: [{ line, orig: line.end! }],
			min: (lastInLine ? lastInLine.start + MIN_GAP : 0) - line.end!,
			max: (nextLine ? nextLine.start : duration * 1000) - line.end!,
			before: $state.snapshot(project.lines),
			clickTime: line.end! / 1000
		};
	}

	function onDragMove(e: PointerEvent) {
		if (!drag) return;
		if (Math.abs(e.clientX - drag.x0) > 3) drag.moved = true;
		if (!drag.moved) return;
		const raw = ((e.clientX - drag.x0) / pps) * 1000;
		const delta = Math.round(Math.max(drag.min, Math.min(drag.max, raw)));
		for (const { w, orig } of drag.words) w.start = orig + delta;
		for (const { line, orig } of drag.ends) line.end = orig + delta;
	}

	function onDragEnd() {
		if (!drag) return;
		if (drag.moved) pushHistory(drag.before);
		else seek(drag.clickTime);
		drag = null;
	}

	// A click rather than pointerdown, so swiping to scroll the timeline on touch doesn't seek.
	function seekBackground(e: MouseEvent) {
		if (e.target !== e.currentTarget) return;
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		selected = null;
		seek(viewStart + (e.clientX - r.left) / pps);
	}

	function nudge(ms: number) {
		if (!selected) return;
		const timed = timedWords();
		const i = timed.findIndex((t) => t.li === selected!.li && t.wi === selected!.wi);
		if (i < 0) return;
		const { min, max } = limits(timed, i);
		const delta = Math.max(min, Math.min(max, ms));
		if (!delta) return;
		pushHistory($state.snapshot(project.lines));
		const w = project.lines[timed[i].li].words[timed[i].wi];
		w.start = timed[i].start + delta;
		seek(w.start / 1000);
	}

	function clearSelected() {
		if (!selectedWord) return;
		pushHistory($state.snapshot(project.lines));
		selectedWord.start = null;
		selected = null;
	}

	function onkeydown(e: KeyboardEvent) {
		if ((e.target as HTMLElement).matches('input, textarea, select, [contenteditable]')) return;
		if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ') {
			e.preventDefault();
			undo();
			return;
		}
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		switch (e.code) {
			case 'Space':
				e.preventDefault();
				project.togglePlay();
				break;
			case 'ArrowLeft':
			case 'ArrowRight':
				if (!selected) return;
				e.preventDefault();
				nudge((e.code === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 100 : 10));
				break;
			case 'Backspace':
			case 'Delete':
				if (!selected) return;
				e.preventDefault();
				clearSelected();
				break;
		}
	}
</script>

<svelte:window {onkeydown} />

<p>
	<label
		>zoom:
		<input
			type="range"
			min={MIN_ZOOM}
			max={MAX_ZOOM}
			step="10"
			value={pps}
			oninput={(e) => setZoom(+e.currentTarget.value)}
		/></label
	>
	<label><input type="checkbox" bind:checked={follow} /> follow playhead</label>
	<label><input type="checkbox" bind:checked={moveRest} /> move following words too</label>
	<button onclick={() => project.togglePlay()}>{project.paused ? 'play' : 'pause'}</button>
	<button onclick={undo} disabled={!history.length}>undo</button>
</p>

<div class="track">
	<canvas bind:this={canvas} style:height="{HEIGHT}px"></canvas>
	<div
		class="scroller"
		bind:this={scroller}
		bind:clientWidth={viewWidth}
		onscroll={() => (scrollLeft = scroller!.scrollLeft)}
	>
		<div
			class="content"
			role="presentation"
			style:width="{contentWidth}px"
			style:height="{HEIGHT}px"
			onclick={seekBackground}
		>
			{#each blocks as b (`${b.li}:${b.wi}`)}
				<button
					type="button"
					class="word"
					class:alt={b.li % 2 === 1}
					class:selected={selected?.li === b.li && selected?.wi === b.wi}
					style:left="{toX(b.start)}px"
					style:width="{Math.max(6, (b.end - b.start) * pps - 1)}px"
					style:top="{laneTop(b.li)}px"
					style:height="{LANE}px"
					title="{b.text} · {fmtTime(b.start)}"
					onpointerdown={(e) => startWordDrag(e, b.li, b.wi)}
					onpointermove={onDragMove}
					onpointerup={onDragEnd}
					onpointercancel={onDragEnd}>{b.text}</button
				>
			{/each}
			{#each lineEnds as m (m.li)}
				<button
					type="button"
					class="line-end"
					aria-label="line end at {fmtTime(m.t)}"
					title="line disappears at {fmtTime(m.t)}. drag to change"
					style:left="{toX(m.t)}px"
					style:top="{laneTop(m.li)}px"
					style:height="{LANE}px"
					onpointerdown={(e) => startEndDrag(e, m.li)}
					onpointermove={onDragMove}
					onpointerup={onDragEnd}
					onpointercancel={onDragEnd}
				></button>
			{/each}
			<div class="playhead" style:left="{toX(project.currentTime)}px"></div>
		</div>
	</div>
</div>

{#if !blocks.length}
	<p class="hint">no synced words in this section yet. tap along in “tap to sync” first.</p>
{:else if selectedWord?.start != null}
	<p>
		“{selectedWord.text}” at {fmtTime(selectedWord.start / 1000)}
		<button onclick={() => nudge(-10)}>−10ms</button>
		<button onclick={() => nudge(10)}>+10ms</button>
		<button onclick={clearSelected}>clear timing</button>
	</p>
{/if}

<p class="hint">
	drag a word to move it; <kbd>shift</kbd>-drag (or tick “move following words too”) moves it and
	everything after it. drag the red markers to change when a line disappears. click a word to jump
	to it, <kbd>space</kbd> plays. with a word selected, <kbd>←</kbd>/<kbd>→</kbd> nudge 10ms (<kbd
		>shift</kbd
	>
	100ms) and
	<kbd>delete</kbd>
	clears it. <kbd>⌘/ctrl</kbd>+<kbd>z</kbd> undoes.
</p>

<style>
	.track {
		position: relative;
		border: 1px solid #999;
		background: var(--panel-2);
	}
	canvas {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		pointer-events: none;
	}
	.scroller {
		position: relative;
		overflow-x: auto;
		overflow-y: hidden;
	}
	.content {
		position: relative;
	}
	.word {
		position: absolute;
		padding: 0 3px;
		border: 1px solid #000;
		background: var(--accent);
		font-size: 12px;
		text-align: left;
		white-space: nowrap;
		overflow: hidden;
		cursor: grab;
		touch-action: none;
		user-select: none;
	}
	.word.alt {
		background: #9cf;
	}
	.word.selected {
		outline: 2px solid #000;
		z-index: 2;
	}
	.line-end {
		position: absolute;
		width: 6px;
		padding: 0;
		margin-left: -3px;
		border: none;
		background: red;
		cursor: ew-resize;
		touch-action: none;
		z-index: 1;
	}
	.playhead {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		margin-left: -1px;
		background: #000;
		pointer-events: none;
		z-index: 3;
	}
</style>
