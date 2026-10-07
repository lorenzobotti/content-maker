/** Container/codec candidates, best first. MP4 works on recent Chrome/Edge and Safari; Firefox falls back to WebM. */
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
	if (!mimeType) throw new Error('This browser cannot record video (MediaRecorder unsupported).');

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
			reject((e as ErrorEvent).error ?? new Error('Recording failed'));
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

export async function decodeAudio(file: Blob): Promise<AudioBuffer> {
	const ac = new AudioContext();
	try {
		return await ac.decodeAudioData(await file.arrayBuffer());
	} finally {
		ac.close();
	}
}
