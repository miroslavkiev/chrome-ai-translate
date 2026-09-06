# Final delivery

Final master: `renders/ai-translator-select-control-4k60.mp4`.

- Native picture: 3840x2160, exact 60 fps, 7,532 frames.
- Runtime: 125.533333 seconds.
- Encoding: software libx264, slow preset, CRF 15, no bitrate cap, BT.709.
- Capture: lossless PNG, software browser rendering, full motion.
- Audio: stereo AAC at 48 kHz and 256 kbps, mixed from the lossless WAV master.
- Narrator: Kokoro Adam (`am_adam`), generated at exactly 1.15x.
- Longest measured voice pause: 0.65625 seconds. No internal pause needed shortening.
- Setup: 24.25 seconds, 19.32% of the film.
- File SHA-256: `d6b0911087810390dc29803c628e770dde49f141d8490016ce488e915c2be2f8`.

The film, voice, original music, motion and final render were made locally. No paid media tool or cloud renderer was used. Example translations are illustrative, and the extension itself remains unchanged.

## Checks

The source passed HyperFrames runtime, layout and contrast checks with zero issues. Two structural lint warnings were reviewed: repeated icon images and the full preview's 17 scene clips sharing one lane. The final renderer captures separate scene projects. The native language dropdown intentionally covers the card controls while it is open.

Independent source review checked all 17 scenes in forward and reverse order, then compared 68 full-film and isolated-scene states. The text and geometry matched. The complete render passed exact dimensions, frame rate, frame count and stream checks. The final MP4 also passed an independent full decode and black-frame scan. Its audio measured -16.01 LUFS and -3.24 dBTP, with no mixed-audio silence above 0.158 seconds. Final image review is recorded in `media-QA.json`.

`npm run check` passed at repository root. The audio checker and renderer self-check passed. Inspect `source-QA.json`, `audio-QA.json`, `media-QA.json` and the render receipts for exact evidence.

## Reproduction

HyperFrames 0.8.29 and GSAP 3.14.2 were reused. Kokoro ONNX 0.6.1 used the existing cached model and Adam voice. The local audio environment is `/Users/mk/Documents/Codex/OpenMontage/.venv/bin/python`. The renderer uses the installed `hyperframes`, `ffmpeg` and `ffprobe` commands.

The MP4 and render caches stay local. The source, audio master and documentation are saved in the repository. Opening the final MP4 provides the local preview; no extension reload is needed for a video-only change.
