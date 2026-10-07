export interface Word {
	text: string;
	/** Milliseconds into the song when this word is sung, or null if not synced yet. */
	start: number | null;
}

export interface Line {
	words: Word[];
	/** Optional explicit end of the line in milliseconds (marks a pause after it). */
	end: number | null;
}

/** Render-time timeline entries; these are in seconds to match media playback time. */
export interface TimedWord {
	text: string;
	start: number;
	end: number;
}

export interface TimedLine {
	words: TimedWord[];
	start: number;
	end: number;
}

/** Longest a line stays on screen after its last word when nothing ends it explicitly. */
const LINE_HOLD = 4;
/** Longest a single word counts as "being sung". */
const MAX_WORD = 2.5;
/** Average pace used when guessing timings for words that weren't synced individually. */
const MAX_SPREAD = 0.6;

/** Seconds (e.g. media currentTime) to the whole milliseconds stored on words and lines. */
export const toMs = (seconds: number) => Math.round(seconds * 1000);

const LRC_LINE = /^\s*\[(\d+):(\d+(?:\.\d+)?)\](.*)$/;
const LRC_WORD_TAG = /^<(\d+):(\d+(?:\.\d+)?)>$/;
const LRC_WORD_SPLIT = /(<\d+:\d+(?:\.\d+)?>)/;

/** Split plain text into lines/words, keeping timings of words that didn't change. */
export function parseLyrics(text: string, previous: Line[] = []): Line[] {
	const prevWords = previous.flatMap((l) => l.words);
	let i = 0;
	return text
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean)
		.map((raw, li) => {
			const words = raw.split(/\s+/).map((t) => {
				const p = prevWords[i++];
				return { text: t, start: p && p.text === t ? p.start : null };
			});
			const prevLine = previous[li];
			const sameLine =
				prevLine && prevLine.words.map((w) => w.text).join(' ') === raw.split(/\s+/).join(' ');
			return { words, end: sameLine ? prevLine.end : null };
		});
}

export function linesToText(lines: Line[]): string {
	return lines.map((l) => l.words.map((w) => w.text).join(' ')).join('\n');
}

export function isLrc(text: string): boolean {
	return text.split(/\r?\n/).some((l) => LRC_LINE.test(l));
}

/** Parse LRC, including "enhanced" word-level <mm:ss.xx> tags. */
export function parseLrc(text: string): Line[] {
	const lines: Line[] = [];
	for (const raw of text.split(/\r?\n/)) {
		const m = raw.match(LRC_LINE);
		if (!m) continue;
		const lineTime = lrcToMs(m[1], m[2]);
		const body = m[3];
		const parts = body.split(LRC_WORD_SPLIT).filter(Boolean);
		if (parts.every((p) => LRC_WORD_TAG.test(p) || !p.trim())) {
			// An empty timestamped line marks the end of the previous one.
			if (lines.length) lines[lines.length - 1].end = lineTime;
			continue;
		}
		const words: Word[] = [];
		let pending: number | null = lineTime;
		for (const part of parts) {
			const tag = part.match(LRC_WORD_TAG);
			if (tag) {
				pending = lrcToMs(tag[1], tag[2]);
				continue;
			}
			for (const t of part.split(/\s+/).filter(Boolean)) {
				words.push({ text: t, start: pending });
				pending = null;
			}
		}
		if (words.length) lines.push({ words, end: pending });
	}
	// Line-level LRC: the final line has nothing after it to bound its untimed words, so give it
	// an end that leaves room for them at a natural pace.
	const tail = lines[lines.length - 1];
	const tailStart = tail?.words[0].start;
	if (tail && tail.end == null && tailStart != null && tail.words.some((w) => w.start == null))
		tail.end = tailStart + Math.round(MAX_SPREAD * 1000 * tail.words.length);
	return lines;
}

/** Export as enhanced LRC (line + word timestamps). */
export function toLrc(lines: Line[]): string {
	const out: string[] = [];
	for (const line of lines) {
		const first = line.words.find((w) => w.start != null)?.start;
		if (first == null) continue;
		const body = line.words
			.map((w) => (w.start != null ? `<${fmtLrc(w.start)}>${w.text}` : w.text))
			.join(' ');
		out.push(`[${fmtLrc(first)}]${body}${line.end != null ? ` <${fmtLrc(line.end)}>` : ''}`);
	}
	return out.join('\n') + '\n';
}

/**
 * Resolve the tapped timings into a renderable timeline: fills gaps between synced words,
 * computes word/line end times, and drops everything after the last synced word.
 */
export function buildTimeline(lines: Line[]): TimedLine[] {
	const flat = lines.flatMap((l, li) =>
		l.words.map((w) => ({ text: w.text, start: w.start == null ? null : w.start / 1000, li }))
	);
	const lineEnds = lines.map((l) => (l.end == null ? null : l.end / 1000));
	let last = -1;
	flat.forEach((w, i) => w.start != null && (last = i));
	if (last < 0) return [];
	// Words after the last synced one aren't shown (so the preview never runs ahead of live
	// tapping), unless their line has an explicit end to spread them over.
	if (lineEnds[flat[last].li] != null)
		while (last + 1 < flat.length && flat[last + 1].li === flat[last].li) last++;
	const words = flat.slice(0, last + 1);

	// Fill missing timings by spreading them between known ones, within the line when it has an end.
	let prev = -1;
	for (let i = 0; i <= words.length; i++) {
		const s = i < words.length ? words[i].start : Infinity;
		if (s == null) continue;
		if (prev < 0) {
			for (let k = 0; k < i; k++) words[k].start = Math.max(0, s - 0.25 * (i - k));
		} else if (i - prev > 1) {
			const a = words[prev].start!;
			const n = i - prev;
			const lineEnd = lineEnds[words[prev].li];
			const sameLine = words.slice(prev + 1, i).every((w) => w.li === words[prev].li);
			let b = s;
			if (sameLine && lineEnd != null && lineEnd > a) b = Math.min(b, lineEnd);
			b = Math.min(b, a + MAX_SPREAD * n);
			for (let k = prev + 1; k < i; k++) words[k].start = a + ((b - a) * (k - prev)) / n;
		}
		prev = i;
	}
	for (let i = 1; i < words.length; i++)
		words[i].start = Math.max(words[i].start!, words[i - 1].start!);

	const timed: TimedLine[] = [];
	const lineIndex: number[] = [];
	words.forEach((w, i) => {
		const start = w.start!;
		const next = words[i + 1];
		const lineEnd = lineEnds[w.li];
		let end = next ? next.start! : start + 1.5;
		if ((!next || next.li !== w.li) && lineEnd != null && lineEnd > start) end = lineEnd;
		const tw = { text: w.text, start, end: Math.min(end, start + MAX_WORD) };
		if (lineIndex[lineIndex.length - 1] === w.li) timed[timed.length - 1].words.push(tw);
		else {
			timed.push({ words: [tw], start, end: 0 });
			lineIndex.push(w.li);
		}
	});

	timed.forEach((line, i) => {
		const lastWord = line.words[line.words.length - 1];
		const explicit = lineEnds[lineIndex[i]];
		const next = timed[i + 1];
		line.end =
			explicit != null && explicit > lastWord.start
				? explicit
				: Math.min(next ? next.start : Infinity, lastWord.start + LINE_HOLD);
	});
	return timed;
}

/** Line on screen at time t (switches slightly before its first word). */
export function activeLine(timeline: TimedLine[], t: number, lead = 0.25): TimedLine | null {
	let found: TimedLine | null = null;
	for (const line of timeline) {
		if (line.start - lead <= t) found = line;
		else break;
	}
	return found && t < found.end ? found : null;
}

export function fmtTime(t: number): string {
	if (!isFinite(t) || t < 0) t = 0;
	const m = Math.floor(t / 60);
	const s = t - m * 60;
	return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

function fmtLrc(ms: number): string {
	const t = ms / 1000;
	const m = Math.floor(t / 60);
	return `${String(m).padStart(2, '0')}:${(t - m * 60).toFixed(2).padStart(5, '0')}`;
}

function lrcToMs(m: string, s: string): number {
	return toMs(parseInt(m, 10) * 60 + parseFloat(s));
}

/** Convert a project saved before timings were stored in milliseconds. */
export function linesFromSeconds(lines: Line[]): Line[] {
	return lines.map((l) => ({
		end: l.end == null ? null : toMs(l.end),
		words: l.words.map((w) => ({ text: w.text, start: w.start == null ? null : toMs(w.start) }))
	}));
}
