# Lyric Video Maker

A local, in-browser tool for making TikTok-ready (1080×1920) lyric videos. Nothing is uploaded: files stay in the browser (IndexedDB) and the video is rendered on your machine.

```sh
npm install
npm run dev        # http://localhost:5173
npm run build && npm run preview   # static build in ./build
```

## Workflow

1. **Setup** – add a background video (or image), the song, and the lyrics (paste them, or load a `.txt` / `.lrc`).
2. **Sync** – play the song and tap <kbd>Space</kbd> on each word. <kbd>Enter</kbd> ends a line early (for instrumental breaks), <kbd>Backspace</kbd> undoes, and clicking a word re-syncs from there. Slow playback (0.5×/0.75×) makes tapping easier. You can download the result as enhanced `.lrc`.
3. **Style** – pick an animation (karaoke wipe, word pop-in, one word at a time), font, colours, position, and an optional headline.
4. **Export** – choose the clip range and record. Output is MP4 (H.264/AAC) on Chrome, Edge and Safari, and WebM on Firefox.

## How it works

- `src/lib/lyrics.ts` handles lyric parsing, LRC import/export, and turning taps into a timeline.
- `src/lib/render.ts` is a canvas renderer shared by the live preview and the export.
- `src/lib/exporter.ts` records the canvas with `canvas.captureStream()` and the song with Web Audio, using `MediaRecorder`. Export runs in real time, so keep the tab visible.
