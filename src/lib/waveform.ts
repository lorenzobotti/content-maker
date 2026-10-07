const cache = new WeakMap<AudioBuffer, Map<number, Float32Array>>();

/** Peak amplitude per slice of the song, split into `buckets` equal slices and normalised to 0..1. */
export function getPeaks(buf: AudioBuffer, buckets: number): Float32Array {
	let byCount = cache.get(buf);
	if (!byCount) cache.set(buf, (byCount = new Map()));
	const cached = byCount.get(buckets);
	if (cached) return cached;

	const out = new Float32Array(buckets);
	const size = Math.max(1, Math.floor(buf.length / buckets));
	for (let c = 0; c < buf.numberOfChannels; c++) {
		const data = buf.getChannelData(c);
		for (let b = 0; b < buckets; b++) {
			let max = out[b];
			const end = Math.min(data.length, (b + 1) * size);
			for (let i = b * size; i < end; i++) {
				const v = Math.abs(data[i]);
				if (v > max) max = v;
			}
			out[b] = max;
		}
	}
	let top = 0;
	for (const v of out) if (v > top) top = v;
	if (top > 0) for (let b = 0; b < buckets; b++) out[b] /= top;
	byCount.set(buckets, out);
	return out;
}
