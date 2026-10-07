import { BUILTIN_FONTS } from './fonts';
import { activeLine, type TimedLine, type TimedWord } from './lyrics';

/** TikTok's native 9:16 frame. */
export const WIDTH = 1080;
export const HEIGHT = 1920;

export type LyricMode = 'karaoke' | 'reveal' | 'word';
export type Easing = 'bounce' | 'smooth' | 'linear';

export interface LyricStyle {
	mode: LyricMode;
	font: string;
	weight: number;
	size: number;
	color: string;
	highlight: string;
	stroke: boolean;
	strokeColor: string;
	shadow: boolean;
	uppercase: boolean;
	/** Vertical center of the lyrics, 0 = top, 1 = bottom. */
	position: number;
	/** Darken the background 0..1 so text pops. */
	dim: number;
	headline: string;
	headlineSize: number;
	/** Shift all lyric timings in milliseconds; positive shows words earlier. */
	offset: number;
	/** Animate words and lines in/out; off makes them cut in and out instantly. */
	animate: boolean;
	/** Ease-in duration in milliseconds. */
	animIn: number;
	/** Ease-out duration in milliseconds. */
	animOut: number;
	animEasing: Easing;
	/** How much words scale while easing, 0 (fade only) to 1 (grow from nothing). */
	animPop: number;
}

export const defaultStyle: LyricStyle = {
	mode: 'word',
	font: BUILTIN_FONTS[0].css,
	weight: BUILTIN_FONTS[0].weight,
	size: 96,
	color: '#ffffff',
	highlight: '#ffd400',
	stroke: true,
	strokeColor: '#000000',
	shadow: true,
	uppercase: false,
	position: 0.55,
	dim: 0.25,
	headline: '',
	headlineSize: 64,
	offset: 0,
	animate: true,
	animIn: 150,
	animOut: 150,
	animEasing: 'bounce',
	animPop: 0.5
};

export type Media = HTMLVideoElement | HTMLImageElement | null;

export function drawFrame(
	ctx: CanvasRenderingContext2D,
	media: Media,
	t: number,
	timeline: TimedLine[],
	style: LyricStyle
) {
	drawBackground(ctx, media);
	if (style.dim > 0) {
		ctx.fillStyle = `rgba(0,0,0,${style.dim})`;
		ctx.fillRect(0, 0, WIDTH, HEIGHT);
	}

	if (style.headline.trim()) {
		const size = style.headlineSize;
		ctx.font = `${style.weight} ${size}px ${style.font}`;
		const text = style.uppercase ? style.headline.toUpperCase() : style.headline;
		const words = text.trim().split(/\s+/);
		wrap(ctx, words, WIDTH * 0.84).forEach((row, r) => {
			const line = row.items.map((i) => words[i]).join(' ');
			drawText(
				ctx,
				line,
				(WIDTH - row.width) / 2,
				HEIGHT * 0.13 + r * size * 1.15,
				style.color,
				style,
				size
			);
		});
	}

	const lt = t + style.offset / 1000;
	const line = activeLine(timeline, lt);
	if (!line) return;

	// Fade the whole line in/out at its edges.
	const fadeIn = ramp(lt - (line.start - 0.25), inSeconds(style));
	const fadeOut = ramp(line.end - lt, outSeconds(style));
	ctx.save();
	ctx.globalAlpha = Math.min(fadeIn, fadeOut);
	if (style.mode === 'word') drawSingleWord(ctx, line, lt, style);
	else drawLine(ctx, line, lt, style);
	ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, media: Media) {
	const ready =
		media instanceof HTMLVideoElement
			? media.readyState >= 2 && media.videoWidth > 0
			: media instanceof HTMLImageElement && media.complete && media.naturalWidth > 0;
	if (!media || !ready) {
		const g = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
		g.addColorStop(0, '#2b1055');
		g.addColorStop(1, '#d53369');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, WIDTH, HEIGHT);
		return;
	}
	const mw = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
	const mh = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
	// "cover" crop: fill the 9:16 frame and center.
	const scale = Math.max(WIDTH / mw, HEIGHT / mh);
	const w = mw * scale;
	const h = mh * scale;
	ctx.fillStyle = '#000';
	ctx.fillRect(0, 0, WIDTH, HEIGHT);
	ctx.drawImage(media, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h);
}

function drawLine(ctx: CanvasRenderingContext2D, line: TimedLine, t: number, style: LyricStyle) {
	const size = style.size;
	ctx.font = `${style.weight} ${size}px ${style.font}`;
	const texts = line.words.map((w) => (style.uppercase ? w.text.toUpperCase() : w.text));
	const rows = wrap(ctx, texts, WIDTH * 0.86);
	const lh = size * 1.2;
	const top = blockTop(rows.length * lh, style.position) + lh / 2;
	const space = ctx.measureText(' ').width;

	rows.forEach((row, r) => {
		let x = (WIDTH - row.width) / 2;
		const y = top + r * lh;
		for (const i of row.items) {
			const word = line.words[i];
			const text = texts[i];
			const w = ctx.measureText(text).width;
			drawLyricWord(ctx, word, text, x, y, w, t, style);
			x += w + space;
		}
	});
}

function drawLyricWord(
	ctx: CanvasRenderingContext2D,
	word: TimedWord,
	text: string,
	x: number,
	y: number,
	w: number,
	t: number,
	style: LyricStyle
) {
	const size = style.size;
	const sung = t >= word.end;
	const active = t >= word.start && !sung;

	if (style.mode === 'reveal') {
		if (t < word.start) return;
		const a = enter(t, word.start, style);
		ctx.save();
		ctx.globalAlpha *= a.alpha;
		scaleAround(ctx, x + w / 2, y, a.scale);
		drawText(ctx, text, x, y, active ? style.highlight : style.color, style, size);
		ctx.restore();
		return;
	}

	// karaoke: base color, then a left-to-right highlight wipe across the active word.
	// The active word bumps up over the ease-in time and settles back over the same again.
	let pop = 1;
	if (active && style.animate && style.animIn > 0) {
		const p = ramp(t - word.start, (2 * style.animIn) / 1000);
		pop = 1 + 0.16 * style.animPop * Math.max(0, ease(1 - Math.abs(2 * p - 1), style.animEasing));
	}
	ctx.save();
	scaleAround(ctx, x + w / 2, y, pop);
	drawText(ctx, text, x, y, sung ? style.highlight : style.color, style, size);
	if (active) {
		const dur = Math.max(0.05, Math.min(word.end - word.start, 1));
		const p = clamp01((t - word.start) / dur);
		ctx.beginPath();
		ctx.rect(x - size, y - size, size + w * p, size * 2);
		ctx.clip();
		drawText(ctx, text, x, y, style.highlight, style, size, false);
	}
	ctx.restore();
}

function drawSingleWord(
	ctx: CanvasRenderingContext2D,
	line: TimedLine,
	t: number,
	style: LyricStyle
) {
	// The outgoing word keeps easing out while the next one eases in.
	const out = outSeconds(style);
	for (const word of line.words) {
		if (t < word.start || t >= word.end + out) continue;
		const a = enter(t, word.start, style);
		const b = leave(t, word.end, style);
		drawBigWord(ctx, word.text, style, a.alpha * b.alpha, a.scale * b.scale);
	}
}

function drawBigWord(
	ctx: CanvasRenderingContext2D,
	raw: string,
	style: LyricStyle,
	alpha: number,
	scale: number
) {
	const text = style.uppercase ? raw.toUpperCase() : raw;
	let size = style.size * 1.8;
	ctx.font = `${style.weight} ${size}px ${style.font}`;
	const maxW = WIDTH * 0.88;
	const measured = ctx.measureText(text).width;
	if (measured > maxW) {
		size *= maxW / measured;
		ctx.font = `${style.weight} ${size}px ${style.font}`;
	}
	const w = ctx.measureText(text).width;
	const x = (WIDTH - w) / 2;
	const y = blockTop(size, style.position) + size / 2;
	ctx.save();
	ctx.globalAlpha *= alpha;
	scaleAround(ctx, WIDTH / 2, y, scale);
	drawText(ctx, text, x, y, style.color, style, size);
	ctx.restore();
}

function drawText(
	ctx: CanvasRenderingContext2D,
	text: string,
	x: number,
	y: number,
	fill: string,
	style: LyricStyle,
	size: number,
	outline = true
) {
	ctx.textBaseline = 'middle';
	ctx.textAlign = 'left';
	if (outline && style.shadow) {
		ctx.shadowColor = 'rgba(0,0,0,0.55)';
		ctx.shadowBlur = size * 0.25;
		ctx.shadowOffsetY = size * 0.05;
	}
	if (outline && style.stroke) {
		ctx.lineJoin = 'round';
		ctx.lineWidth = size * 0.14;
		ctx.strokeStyle = style.strokeColor;
		ctx.strokeText(text, x, y);
		ctx.shadowColor = 'transparent';
	}
	ctx.fillStyle = fill;
	ctx.fillText(text, x, y);
	ctx.shadowColor = 'transparent';
}

/** Greedy word wrap; returns rows of word indices with their total widths. */
function wrap(ctx: CanvasRenderingContext2D, words: string[], maxWidth: number) {
	const space = ctx.measureText(' ').width;
	const rows: { items: number[]; width: number }[] = [];
	let cur = { items: [] as number[], width: 0 };
	words.forEach((word, i) => {
		const w = ctx.measureText(word).width;
		const next = cur.items.length ? cur.width + space + w : w;
		if (cur.items.length && next > maxWidth) {
			rows.push(cur);
			cur = { items: [i], width: w };
		} else {
			cur.items.push(i);
			cur.width = next;
		}
	});
	if (cur.items.length) rows.push(cur);
	return rows;
}

/** Keep the text block inside the frame (and clear of TikTok's bottom UI). */
function blockTop(blockHeight: number, position: number) {
	const top = HEIGHT * position - blockHeight / 2;
	return Math.max(HEIGHT * 0.08, Math.min(top, HEIGHT * 0.8 - blockHeight));
}

function scaleAround(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
	ctx.translate(cx, cy);
	ctx.scale(s, s);
	ctx.translate(-cx, -cy);
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** 0→1 over `duration` seconds after x reaches 0; a zero duration is an instant cut. */
function ramp(x: number, duration: number) {
	return duration > 0 ? clamp01(x / duration) : x >= 0 ? 1 : 0;
}

const inSeconds = (style: LyricStyle) => (style.animate ? style.animIn / 1000 : 0);
const outSeconds = (style: LyricStyle) => (style.animate ? style.animOut / 1000 : 0);

function ease(p: number, easing: Easing) {
	if (easing === 'linear') return p;
	if (easing === 'smooth') return 1 - Math.pow(1 - p, 3);
	const c = 1.70158; // easeOutBack: overshoots slightly, then settles.
	return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
}

/** Opacity and scale of a word easing in from time `start`. */
function enter(t: number, start: number, style: LyricStyle) {
	const p = ramp(t - start, inSeconds(style));
	return { alpha: p, scale: 1 - style.animPop + style.animPop * ease(p, style.animEasing) };
}

/** Opacity and scale of a word easing out after time `end` (the mirror of enter). */
function leave(t: number, end: number, style: LyricStyle) {
	const p = 1 - ramp(t - end, outSeconds(style));
	return { alpha: p, scale: 1 - style.animPop + style.animPop * ease(p, style.animEasing) };
}
