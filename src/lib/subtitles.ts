import { buildTimeline, fmtLrc, toMs, type Line, type TimedLine } from './lyrics';

export interface SubtitleOptions {
	/** Max characters per row before wrapping (words are never split); 0 for no limit. */
	maxWidth: number;
	/** Seconds a completed line stays on screen (cut short if the next line starts sooner). */
	holdSeconds: number;
	/** Seconds added to every timestamp, e.g. 3600 for a 01:00:00 start. Can be negative. */
	offsetSeconds: number;
	/** Wrap each cue's text in <b>…</b> (SRT only: LRC has no formatting). */
	bold: boolean;
}

export const defaultSubtitleOptions: SubtitleOptions = {
	maxWidth: 32,
	holdSeconds: 2,
	offsetSeconds: 0,
	bold: false
};

/** Fill in defaults for anything missing or invalid (e.g. a cleared number input). */
export function cleanSubtitleOptions(o: Partial<SubtitleOptions>): SubtitleOptions {
	const num = (v: unknown, fallback: number) =>
		typeof v === 'number' && isFinite(v) ? v : fallback;
	return {
		maxWidth: Math.max(0, Math.floor(num(o.maxWidth, 0))),
		holdSeconds: Math.max(0, num(o.holdSeconds, defaultSubtitleOptions.holdSeconds)),
		offsetSeconds: num(o.offsetSeconds, 0),
		bold: !!o.bold
	};
}

const SRT_TIME = /(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/;

export function isSrt(text: string): boolean {
	return SRT_TIME.test(text);
}

/** Group words into rows of at most `maxWidth` characters (a longer word gets a row of its own). */
function splitRows<T extends { text: string }>(words: T[], maxWidth: number): T[][] {
	const rows: T[][] = [];
	let len = 0;
	for (const w of words) {
		const row = rows[rows.length - 1];
		if (row && (!maxWidth || len + 1 + w.text.length <= maxWidth)) {
			row.push(w);
			len += 1 + w.text.length;
		} else {
			rows.push([w]);
			len = w.text.length;
		}
	}
	return rows;
}

/** When each line's last word leaves the screen: `hold` after it, or when the next line starts. */
function lineEnds(timeline: TimedLine[], hold: number): number[] {
	return timeline.map((line, i) => {
		const last = line.words[line.words.length - 1].start;
		return Math.min(timeline[i + 1]?.start ?? Infinity, last + hold);
	});
}

function fmtSrt(sec: number): string {
	let ms = Math.max(0, Math.round(sec * 1000));
	const h = Math.floor(ms / 3_600_000);
	ms %= 3_600_000;
	const m = Math.floor(ms / 60_000);
	ms %= 60_000;
	const s = Math.floor(ms / 1000);
	ms %= 1000;
	const p = (n: number, w = 2) => String(n).padStart(w, '0');
	return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`;
}

/**
 * SRT where each cue adds one word to the current line: "a", "a volte", "a volte il", …
 * Words that weren't synced individually get the same estimated timings as the video.
 */
export function toSrt(lines: Line[], options: SubtitleOptions): string {
	const { maxWidth, holdSeconds, offsetSeconds, bold } = options;
	const timeline = buildTimeline(lines);
	const ends = lineEnds(timeline, holdSeconds);
	const cues: string[] = [];
	timeline.forEach((line, i) => {
		line.words.forEach((word, j) => {
			const end = j + 1 < line.words.length ? line.words[j + 1].start : ends[i];
			let text = splitRows(line.words.slice(0, j + 1), maxWidth)
				.map((row) => row.map((w) => w.text).join(' '))
				.join('\n');
			if (bold) text = `<b>${text}</b>`;
			cues.push(
				`${cues.length + 1}\n` +
					`${fmtSrt(word.start + offsetSeconds)} --> ${fmtSrt(end + offsetSeconds)}\n` +
					`${text}\n`
			);
		});
	});
	return cues.join('\n');
}

/**
 * Enhanced LRC with every word timed. Rows longer than `maxWidth` become separate LRC lines,
 * and a line gets an end tag when it leaves the screen before the next one starts.
 */
export function toLrcWithOptions(lines: Line[], options: SubtitleOptions): string {
	const { maxWidth, holdSeconds, offsetSeconds } = options;
	const timeline = buildTimeline(lines);
	const ends = lineEnds(timeline, holdSeconds);
	const t = (sec: number) => fmtLrc(toMs(Math.max(0, sec + offsetSeconds)));
	const out: string[] = [];
	timeline.forEach((line, i) => {
		const rows = splitRows(line.words, maxWidth);
		const gap = !timeline[i + 1] || ends[i] < timeline[i + 1].start;
		rows.forEach((row, r) => {
			const body = row.map((w) => `<${t(w.start)}>${w.text}`).join(' ');
			const end = gap && r === rows.length - 1 ? ` <${t(ends[i])}>` : '';
			out.push(`[${t(row[0].start)}]${body}${end}`);
		});
	});
	return out.join('\n') + '\n';
}

function srtMs(m: RegExpMatchArray, i: number): number {
	const [h, min, s, ms] = m.slice(i, i + 4).map(Number);
	return ((h * 60 + min) * 60 + s) * 1000 + ms;
}

/**
 * Parse SRT into lines. Cumulative cues (each repeating the previous one plus new words, as
 * `toSrt` writes them) are merged back into one line with a timing per added word.
 */
export function parseSrt(text: string): Line[] {
	const lines: Line[] = [];
	let prev: string[] = [];
	for (const block of text.replace(/^\uFEFF/, '').split(/\r?\n\s*\r?\n/)) {
		const rows = block.split(/\r?\n/);
		const ti = rows.findIndex((r) => SRT_TIME.test(r));
		if (ti < 0) continue;
		const m = rows[ti].match(SRT_TIME)!;
		const start = srtMs(m, 1);
		const end = srtMs(m, 5);
		const words = rows
			.slice(ti + 1)
			.join(' ')
			.replace(/<[^>]*>|\{[^}]*\}/g, '')
			.split(/\s+/)
			.filter(Boolean);
		if (!words.length) continue;
		const line = lines[lines.length - 1];
		const grows = line && words.length > prev.length && prev.every((w, i) => words[i] === w);
		const added = (grows ? words.slice(prev.length) : words).map((t, i) => ({
			text: t,
			start: i === 0 ? start : null
		}));
		if (grows) {
			line.words.push(...added);
			line.end = end;
		} else {
			lines.push({ words: added, end });
		}
		prev = words;
	}
	return lines;
}
