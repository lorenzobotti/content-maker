/** Container/codec candidates, best first. MP4 works on recent Chrome/Edge and Safari; Firefox falls back to WebM (or encodeMp4, if chosen). */
const MIME_TYPES = [
	'video/mp4;codecs=avc1.640028,mp4a.40.2',
	'video/mp4;codecs=avc1,mp4a.40.2',
	'video/mp4',
	'video/webm;codecs=vp9,opus',
	'video/webm;codecs=vp8,opus',
	'video/webm'
];

export function pickMimeType(): string | null {
	if (typeof MediaRecorder === 'undefined') return null;
	return MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

export function extensionFor(mimeType: string) {
	return mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
}

export interface RecordOptions {
	canvas: HTMLCanvasElement;
	audio: AudioBuffer;
	/** Song time range to export, in seconds. */
	start: number;
	end: number;
	fps: number;
	/** Draw the frame for song time `t` onto the canvas. */
	render: (t: number) => void;
	onProgress?: (fraction: number) => void;
	/** Also play the audio through the speakers while recording. */
	monitor?: boolean;
	signal?: AbortSignal;
}

/**
 * Records the canvas + song in real time with MediaRecorder. The Web Audio clock is the
 * master clock, so lyrics stay locked to the audio in the output file.
 */
export async function recordVideo(opts: RecordOptions): Promise<{ blob: Blob; mimeType: string }> {
	const mimeType = pickMimeType();
	if (!mimeType) throw new Error('this browser cannot record video (mediarecorder unsupported).');

	const ac = new AudioContext();
	await ac.resume();
	const dest = ac.createMediaStreamDestination();
	const source = ac.createBufferSource();
	source.buffer = opts.audio;
	source.connect(dest);
	const monitorGain = ac.createGain();
	monitorGain.gain.value = opts.monitor ? 1 : 0;
	source.connect(monitorGain).connect(ac.destination);

	const videoTrack = opts.canvas.captureStream(opts.fps).getVideoTracks()[0];
	const stream = new MediaStream([videoTrack, ...dest.stream.getAudioTracks()]);
	const recorder = new MediaRecorder(stream, {
		mimeType,
		videoBitsPerSecond: 12_000_000,
		audioBitsPerSecond: 192_000
	});
	const chunks: Blob[] = [];
	recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

	const duration = opts.end - opts.start;
	opts.render(opts.start);

	return new Promise((resolve, reject) => {
		let raf = 0;
		let aborted = false;
		const cleanup = () => {
			cancelAnimationFrame(raf);
			try {
				source.stop();
			} catch {
				/* already stopped */
			}
			stream.getTracks().forEach((t) => t.stop());
			ac.close();
		};
		recorder.onstop = () => {
			cleanup();
			if (aborted) reject(new DOMException('Export cancelled', 'AbortError'));
			else resolve({ blob: new Blob(chunks, { type: mimeType.split(';')[0] }), mimeType });
		};
		recorder.onerror = (e) => {
			cleanup();
			reject((e as ErrorEvent).error ?? new Error('recording failed'));
		};
		opts.signal?.addEventListener('abort', () => {
			aborted = true;
			if (recorder.state !== 'inactive') recorder.stop();
		});

		recorder.start(250);
		const t0 = ac.currentTime + 0.1;
		source.start(t0, opts.start, duration);

		const tick = () => {
			const elapsed = Math.max(0, ac.currentTime - t0);
			opts.render(opts.start + Math.min(elapsed, duration));
			opts.onProgress?.(Math.min(1, elapsed / duration));
			if (elapsed >= duration) {
				// Give the encoder a moment to flush the last frames/audio.
				setTimeout(() => recorder.state !== 'inactive' && recorder.stop(), 150);
				return;
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
	});
}

const VIDEO_BITRATE = 12_000_000;
const AUDIO_BITRATE = 192_000;

/** Whether encodeMp4 can work here. Loads mediabunny, so only call it when MediaRecorder has no MP4. */
export async function canEncodeMp4(): Promise<boolean> {
	if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') return false;
	const { canEncodeVideo, Quality } = await import('mediabunny');
	return canEncodeVideo('avc', {
		width: 1080,
		height: 1920,
		quality: new Quality({ bitrate: VIDEO_BITRATE })
	});
}

/** Destructures only what's used: keeping the whole module object would defeat tree-shaking. */
async function importMp4Encoder() {
	const {
		AudioBufferSource,
		BufferTarget,
		canEncodeAudio,
		CanvasSource,
		Mp4OutputFormat,
		Output,
		Quality
	} = await import('mediabunny');
	// Firefox's WebCodecs has no AAC encoder, and Opus in MP4 is poorly supported by players and apps.
	if (!(await canEncodeAudio('aac'))) {
		const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
		registerAacEncoder();
	}
	return { AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality };
}

let mp4Encoder: ReturnType<typeof importMp4Encoder> | undefined;

/** Loads the (heavy) MP4 code once. A failed load, e.g. while offline, is retried on the next call. */
function loadMp4Encoder() {
	mp4Encoder ??= importMp4Encoder().catch((e) => {
		mp4Encoder = undefined;
		throw e;
	});
	return mp4Encoder;
}

/** Fetches the MP4 code in the background once the app is idle, only for browsers that will need it. */
export function preloadMp4Encoder() {
	const mimeType = pickMimeType();
	if (!mimeType || extensionFor(mimeType) === 'mp4' || typeof VideoEncoder === 'undefined') return;
	requestIdleCallback(() => loadMp4Encoder().catch(() => {}));
}

/**
 * Encodes H.264/AAC MP4 with WebCodecs, for browsers whose MediaRecorder can't. Still runs in real
 * time on the Web Audio clock because the background video only plays at 1x. If the encoder falls
 * behind, frames are dropped rather than delayed, so lyrics stay locked to the audio.
 */
export async function encodeMp4(opts: RecordOptions): Promise<{ blob: Blob; mimeType: string }> {
	const { AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality } =
		await loadMp4Encoder();
	const { audio, fps } = opts;
	const duration = opts.end - opts.start;

	const target = new BufferTarget();
	const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
	const videoSource = new CanvasSource(opts.canvas, {
		codec: 'avc',
		quality: new Quality({ bitrate: VIDEO_BITRATE })
	});
	const audioSource = new AudioBufferSource({
		codec: 'aac',
		quality: new Quality({ bitrate: AUDIO_BITRATE })
	});
	output.addVideoTrack(videoSource, { frameRate: fps });
	output.addAudioTrack(audioSource);

	const ac = new AudioContext();
	let raf = 0;
	try {
		await ac.resume();
		await output.start();

		// Encode the audio up front so it doesn't compete with the video encoder while recording.
		const first = Math.floor(opts.start * audio.sampleRate);
		const section = new AudioBuffer({
			length: Math.max(1, Math.min(audio.length - first, Math.round(duration * audio.sampleRate))),
			numberOfChannels: audio.numberOfChannels,
			sampleRate: audio.sampleRate
		});
		for (let c = 0; c < audio.numberOfChannels; c++)
			section.copyToChannel(audio.getChannelData(c).subarray(first, first + section.length), c);
		await audioSource.add(section);
		audioSource.close();
		opts.signal?.throwIfAborted();

		const source = ac.createBufferSource();
		source.buffer = audio;
		const monitorGain = ac.createGain();
		monitorGain.gain.value = opts.monitor ? 1 : 0;
		source.connect(monitorGain).connect(ac.destination);

		opts.render(opts.start);
		const t0 = ac.currentTime + 0.1;
		source.start(t0, opts.start, duration);

		await new Promise<void>((resolve, reject) => {
			opts.signal?.addEventListener('abort', () =>
				reject(new DOMException('Export cancelled', 'AbortError'))
			);
			let nextFrame = 0;
			let pending: Promise<void> | null = null;
			const tick = () => {
				const elapsed = Math.max(0, ac.currentTime - t0);
				opts.render(opts.start + Math.min(elapsed, duration));
				opts.onProgress?.(Math.min(1, elapsed / duration));
				if (elapsed >= duration) {
					(pending ?? Promise.resolve()).then(resolve, reject);
					return;
				}
				const frame = Math.floor(elapsed * fps);
				if (!pending && frame >= nextFrame) {
					nextFrame = frame + 1;
					pending = videoSource.add(frame / fps, 1 / fps).then(() => {
						pending = null;
					}, reject);
				}
				raf = requestAnimationFrame(tick);
			};
			raf = requestAnimationFrame(tick);
		});

		videoSource.close();
		await output.finalize();
		return { blob: new Blob([target.buffer!], { type: 'video/mp4' }), mimeType: 'video/mp4' };
	} catch (e) {
		await output.cancel().catch(() => {});
		throw e;
	} finally {
		cancelAnimationFrame(raf);
		ac.close();
	}
}

export async function decodeAudio(file: Blob): Promise<AudioBuffer> {
	const ac = new AudioContext();
	try {
		return await ac.decodeAudioData(await file.arrayBuffer());
	} finally {
		ac.close();
	}
}
