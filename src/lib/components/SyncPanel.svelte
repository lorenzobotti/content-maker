<script lang="ts">
	import { untrack } from 'svelte';
	import { fmtTime, toMs, type Line, type Word } from '$lib/lyrics';

	let {
		lines = $bindable(),
		audio,
		currentTime,
		play,
		seek
	}: {
		lines: Line[];
		audio: HTMLAudioElement | undefined;
		currentTime: number;
		/** Start playback (kept inside the chosen song section). */
		play: () => void;
		/** Seek, clamped to the chosen song section. */
		seek: (t: number) => void;
	} = $props();

	const flat = $derived(lines.flatMap((l, li) => l.words.map((w, wi) => ({ w, li, wi }))));
	const offsets = $derived.by(() => {
		let n = 0;
		return lines.map((l) => ((n += l.words.length), n - l.words.length));
	});
	const total = $derived(flat.length);
	const synced = $derived(flat.filter((f) => f.w.start != null).length);

	// Start at the first word that still needs a timing.
	let cursor = $state(
		untrack(() => {
			const i = flat.findIndex((f) => f.w.start == null);
			return i < 0 ? flat.length : i;
		})
	);
	let rate = $state(untrack(() => audio?.playbackRate ?? 1));
	let list: HTMLElement | undefined = $state();

	/** Word being heard right now (for reviewing a finished sync). */
	const playing = $derived.by(() => {
		let idx = -1;
		const now = toMs(currentTime);
		flat.forEach((f, i) => f.w.start != null && f.w.start <= now && (idx = i));
		return idx;
	});

	$effect(() => {
		const target = cursor < total ? cursor : playing;
		list
			?.querySelector(`[data-i="${target}"]`)
			?.scrollIntoView({ block: 'center', behavior: 'smooth' });
	});

	function word(i: number): Word {
		return lines[flat[i].li].words[flat[i].wi];
	}

	function tap() {
		if (!audio) return;
		if (audio.paused) {
			play();
			return;
		}
		if (cursor >= total) return;
		const t = toMs(audio.currentTime);
		word(cursor).start = t;
		// Anything later that is now out of order gets re-synced.
		for (let j = cursor + 1; j < total; j++) {
			const w = word(j);
			if (w.start != null && w.start <= t) w.start = null;
		}
		const li = flat[cursor].li;
		if (li > 0 && flat[cursor].wi === 0) {
			const prev = lines[li - 1];
			if (prev.end != null && prev.end > t) prev.end = null;
		}
		cursor++;
	}

	/** Mark a pause: the current line disappears now instead of waiting for the next one. */
	function endLine() {
		if (!audio || cursor === 0) return;
		const li = flat[cursor - 1].li;
		lines[li].end = toMs(audio.currentTime);
	}

	function undo() {
		if (cursor === 0) return;
		cursor--;
		const w = word(cursor);
		const t = w.start;
		w.start = null;
		lines[flat[cursor].li].end = null;
		if (t != null) seek(t / 1000 - 2);
	}

	function jumpTo(i: number) {
		cursor = i;
		const t = word(i).start ?? (i > 0 ? word(i - 1).start : null) ?? 0;
		seek(t / 1000 - 2);
	}

	function clearAll() {
		if (!confirm('Clear every word timing?')) return;
		for (const l of lines) {
			l.end = null;
			for (const w of l.words) w.start = null;
		}
		cursor = 0;
		seek(0);
	}

	function setRate(r: number) {
		rate = r;
		if (audio) audio.playbackRate = r;
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		const el = e.target as HTMLElement;
		if (el.matches('input:not([type=range]), textarea, select, [contenteditable]')) return;
		switch (e.code) {
			case 'Space':
			case 'KeyJ':
			case 'KeyF':
				e.preventDefault();
				if (!e.repeat) tap();
				break;
			case 'Enter':
				e.preventDefault();
				endLine();
				break;
			case 'Backspace':
				e.preventDefault();
				undo();
				break;
			case 'KeyK':
				e.preventDefault();
				if (audio?.paused) play();
				else audio?.pause();
				break;
			case 'ArrowLeft':
			case 'ArrowRight':
				e.preventDefault();
				if (audio) seek(audio.currentTime + (e.code === 'ArrowLeft' ? -3 : 3));
				break;
		}
	}
</script>

<svelte:window {onkeydown} />

<p>
	play the song and tap <kbd>space</kbd> (or <kbd>j</kbd>/<kbd>f</kbd>) the moment each highlighted
	word is sung.
</p>
<ul>
	<li><kbd>space</kbd> while paused → start playback</li>
	<li><kbd>enter</kbd> → end the current line (for instrumental gaps)</li>
	<li><kbd>backspace</kbd> → undo last tap and rewind 2s</li>
	<li>
		<kbd>k</kbd> play/pause · <kbd>←</kbd>/<kbd>→</kbd> seek 3s · click a word to re-sync from there
	</li>
</ul>

<p>
	{synced}/{total} words synced | speed:
	{#each [0.5, 0.75, 1] as r (r)}
		<button class:active={rate === r} onclick={(e) => (setRate(r), e.currentTarget.blur())}
			>{r}×</button
		>
	{/each}
	|
	<button onclick={clearAll} disabled={!synced}>clear timings</button>
</p>

{#if !total}
	<p>add lyrics in the setup tab first.</p>
{:else}
	<div class="lines" bind:this={list}>
		{#each lines as line, li (li)}
			<div class="line">
				{#each line.words as w, wi (wi)}
					{@const i = offsets[li] + wi}
					<button
						data-i={i}
						class="word"
						class:timed={w.start != null}
						class:cursor={i === cursor}
						class:playing={i === playing && cursor >= total}
						title={w.start != null ? fmtTime(w.start / 1000) : 'not synced'}
						onclick={(e) => (jumpTo(i), e.currentTarget.blur())}>{w.text}</button
					>
				{/each}
				{#if line.end != null}<span class="end" title="line ends at {fmtTime(line.end / 1000)}"
						>⏎</span
					>{/if}
			</div>
		{/each}
	</div>
{/if}

<style>
	.lines {
		max-height: 50vh;
		overflow-y: auto;
		border: 1px solid #999;
		padding: 5px;
	}
	.line {
		margin: 4px 0;
	}
	.word {
		color: #888;
	}
	.word.timed {
		color: #000;
	}
	.word.cursor {
		background: yellow;
		font-weight: bold;
	}
	.word.playing {
		background: #cce0ff;
	}
	.end {
		color: red;
	}
</style>
