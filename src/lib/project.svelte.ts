import { getContext, setContext } from 'svelte';
import {
	buildTimeline,
	isLrc,
	linesFromSeconds,
	linesToText,
	parseLrc,
	parseLyrics,
	toLrc,
	type Line
} from './lyrics';
import { defaultStyle, type LyricStyle } from './render';
import { decodeAudio } from './exporter';
import {
	BUILTIN_FONTS,
	familyOf,
	FONT_FILE,
	registerFont,
	unregisterFont,
	type FontOption
} from './fonts';
import { loadFile, loadFiles, loadState, saveFile, saveFiles, saveState } from './storage';

/** Bump when the saved shape changes; v2 stores lyric timings and the nudge in milliseconds. */
const SAVE_VERSION = 2;
/** Shortest allowed song section, in seconds. */
export const MIN_SECTION = 1;

interface Saved {
	version: number;
	lyricsText: string;
	lines: Line[];
	style: LyricStyle;
	clipStart: number;
	clipEnd: number;
	videoOffset: number;
}

function migrate(s: Partial<Saved> | null): Partial<Saved> | null {
	if (!s || (s.version ?? 1) >= SAVE_VERSION) return s;
	return {
		...s,
		lines: s.lines && linesFromSeconds(s.lines),
		style: s.style && { ...s.style, offset: Math.round((s.style.offset ?? 0) * 1000) }
	};
}

export interface ExportResult {
	url: string;
	name: string;
	size: number;
}

/**
 * Everything the tabs share: uploaded files, lyrics + sync, style, playback position and export
 * progress. Must be created during component init (it registers effects).
 */
export class Project {
	// --- files ---
	mediaFile = $state.raw<File | null>(null);
	songFile = $state.raw<File | null>(null);
	audioBuffer = $state.raw<AudioBuffer | null>(null);
	decoding = $state(false);
	mediaUrl = $state('');
	songUrl = $state('');

	// --- lyrics, style, clip (persisted) ---
	lyricsText = $state('');
	lines = $state<Line[]>([]);
	style = $state<LyricStyle>({ ...defaultStyle });
	clipStart = $state(0);
	clipEnd = $state(0);
	videoOffset = $state(0);

	// --- fonts ---
	customFonts = $state.raw<FontOption[]>([]);
	/** Name of the last font file that failed to load, if any. */
	fontErrorFile = $state('');

	// --- playback (bound to the page's <audio>) ---
	audioEl = $state.raw<HTMLAudioElement>();
	currentTime = $state(0);
	duration = $state(0);
	paused = $state(true);

	// --- export ---
	fps = $state(30);
	monitor = $state(true);
	exporting = $state(false);
	progress = $state(0);
	exportError = $state('');
	result = $state.raw<ExportResult | null>(null);
	abort: AbortController | null = null;
	/** Whether the current playback should stop at the end of the section. */
	sectionLocked = false;

	timeline = $derived(buildTimeline(this.lines));
	mediaKind = $derived<'video' | 'image' | null>(
		this.mediaFile ? (this.mediaFile.type.startsWith('image/') ? 'image' : 'video') : null
	);
	syncedCount = $derived(
		this.lines.reduce((n, l) => n + l.words.filter((w) => w.start != null).length, 0)
	);
	wordCount = $derived(this.lines.reduce((n, l) => n + l.words.length, 0));
	fonts = $derived([...BUILTIN_FONTS, ...this.customFonts]);
	clipLength = $derived(Math.max(0, this.clipEnd - this.clipStart));

	constructor() {
		const saved = migrate(loadState<Saved>());
		if (saved) {
			this.lyricsText = saved.lyricsText ?? '';
			this.lines = saved.lines ?? [];
			this.style = { ...defaultStyle, ...saved.style };
			// Built-in fonts that have since been removed fall back to the default.
			const font = this.style.font;
			if (!font.startsWith('"User ') && !BUILTIN_FONTS.some((f) => f.css === font))
				this.selectFont(BUILTIN_FONTS[0]);
			this.clipStart = saved.clipStart ?? 0;
			this.clipEnd = saved.clipEnd ?? 0;
			this.videoOffset = saved.videoOffset ?? 0;
		}

		loadFile('media').then((f) => f && !this.mediaFile && (this.mediaFile = f));
		loadFile('song').then((f) => f && !this.songFile && (this.songFile = f));
		loadFiles('fonts').then(async (files) => {
			for (const f of files) await this.addFont(f, false).catch((e) => console.warn(e));
		});

		$effect(() => {
			if (!this.mediaFile) return void (this.mediaUrl = '');
			const url = URL.createObjectURL(this.mediaFile);
			this.mediaUrl = url;
			return () => URL.revokeObjectURL(url);
		});

		$effect(() => {
			const file = this.songFile;
			if (!file) return void (this.songUrl = '');
			const url = URL.createObjectURL(file);
			this.songUrl = url;
			let cancelled = false;
			this.decoding = true;
			this.audioBuffer = null;
			decodeAudio(file)
				.then((buf) => !cancelled && (this.audioBuffer = buf))
				.catch((e) => console.error('Could not decode audio', e))
				.finally(() => !cancelled && (this.decoding = false));
			return () => {
				cancelled = true;
				URL.revokeObjectURL(url);
			};
		});

		// Make sure the chosen font (and any accented glyphs in the lyrics) is loaded for the canvas.
		$effect(() => {
			this.loadFont().catch(() => {});
		});

		// Autosave settings + sync locally (debounced).
		$effect(() => {
			const snap: Saved = {
				version: SAVE_VERSION,
				lyricsText: this.lyricsText,
				lines: $state.snapshot(this.lines),
				style: $state.snapshot(this.style),
				clipStart: this.clipStart,
				clipEnd: this.clipEnd,
				videoOffset: this.videoOffset
			};
			const id = setTimeout(() => saveState(snap), 400);
			return () => clearTimeout(id);
		});
	}

	loadFont() {
		return document.fonts.load(
			`${this.style.weight} 40px ${this.style.font}`,
			this.lyricsText.slice(0, 400) || 'A'
		);
	}

	setMedia(f: File) {
		this.mediaFile = f;
		saveFile('media', f);
	}

	setSong(f: File) {
		this.songFile = f;
		saveFile('song', f);
	}

	/** Re-split edited lyrics, keeping timings of words that didn't change. */
	setLyricsText(text: string) {
		this.lyricsText = text;
		this.lines = parseLyrics(text, $state.snapshot(this.lines));
	}

	async setLyricsFile(f: File) {
		const text = await f.text();
		if (isLrc(text)) {
			this.lines = parseLrc(text);
			this.lyricsText = linesToText(this.lines);
		} else {
			this.setLyricsText(text);
		}
	}

	/** Send a dropped file wherever it belongs based on its type. */
	routeFile(f: File) {
		if (FONT_FILE.test(f.name)) this.importFont(f);
		else if (f.type.startsWith('video/') || f.type.startsWith('image/')) this.setMedia(f);
		else if (f.type.startsWith('audio/')) this.setSong(f);
		else if (/\.(txt|lrc)$/i.test(f.name) || f.type.startsWith('text/')) this.setLyricsFile(f);
	}

	async addFont(file: File, select = true) {
		const font = await registerFont(file);
		this.customFonts = [...this.customFonts.filter((f) => f.css !== font.css), font];
		if (select) {
			this.selectFont(font);
			this.saveFonts();
		}
	}

	importFont(file: File) {
		this.fontErrorFile = '';
		this.addFont(file).catch(() => (this.fontErrorFile = file.name));
	}

	removeFont(font: FontOption) {
		unregisterFont(familyOf(font));
		this.customFonts = this.customFonts.filter((f) => f !== font);
		this.saveFonts();
		if (this.style.font === font.css) this.selectFont(BUILTIN_FONTS[0]);
	}

	selectFont(font: FontOption) {
		this.style.font = font.css;
		this.style.weight = font.weight;
	}

	private saveFonts() {
		saveFiles(
			'fonts',
			this.customFonts.map((f) => f.file!)
		);
	}

	/** Default the section to the first minute once the song's length is known. */
	fitClipToSong() {
		if (!this.clipEnd || this.clipEnd > this.duration) this.clipEnd = Math.min(this.duration, 60);
		if (this.clipStart >= this.clipEnd) this.clipStart = 0;
	}

	/** Set the song section (used for syncing playback and export), keeping it valid. */
	setSection(start: number, end: number) {
		const max = this.duration || this.audioBuffer?.duration || 0;
		start = Math.max(0, Math.min(start, max));
		end = Math.max(0, Math.min(end, max));
		if (end - start < MIN_SECTION) {
			end = Math.min(max, start + MIN_SECTION);
			start = Math.max(0, end - MIN_SECTION);
		}
		this.clipStart = start;
		this.clipEnd = end;
	}

	hasSection() {
		return this.clipEnd > this.clipStart;
	}

	inSection(t: number) {
		return !this.hasSection() || (t >= this.clipStart - 0.01 && t < this.clipEnd);
	}

	/**
	 * Play from the playhead. Normal playback stays inside the section (jumping to its start if
	 * the playhead is outside it); `free` plays the whole song, e.g. to audition a section.
	 */
	play(free = false) {
		const a = this.audioEl;
		if (!a) return;
		if (!free && !this.inSection(a.currentTime)) a.currentTime = this.clipStart;
		this.sectionLocked = !free;
		a.play();
	}

	togglePlay(free = false) {
		if (this.audioEl?.paused) this.play(free);
		else this.audioEl?.pause();
	}

	/** Call every frame: stops section playback at the section end and rewinds to its start. */
	enforceSection() {
		const a = this.audioEl;
		if (!a || a.paused || !this.sectionLocked || !this.hasSection()) return;
		if (a.currentTime >= this.clipEnd) {
			a.pause();
			a.currentTime = this.clipStart;
		}
	}

	/** Seek, clamped to the section. */
	seekInSection(t: number) {
		if (!this.audioEl) return;
		this.audioEl.currentTime = this.hasSection()
			? Math.max(this.clipStart, Math.min(t, this.clipEnd))
			: Math.max(0, t);
	}

	baseName() {
		return (this.songFile?.name ?? 'lyric-video').replace(/\.[^.]+$/, '');
	}

	downloadLrc() {
		const blob = new Blob([toLrc(this.lines)], { type: 'text/plain' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `${this.baseName()}.lrc`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 1000);
	}
}

const KEY = Symbol('project');

export function setProject(project: Project) {
	return setContext(KEY, project);
}

export function getProject(): Project {
	return getContext<Project>(KEY);
}

/** File-input change handler: hand the picked file to `fn`, then reset so the same file can be re-picked. */
export function pickFile(e: Event, fn: (f: File) => void) {
	const input = e.currentTarget as HTMLInputElement;
	const f = input.files?.[0];
	if (f) fn(f);
	input.value = '';
}
