# Final delivery

[Download the current public master](https://github.com/miroslavkiev/chrome-ai-translate/releases/download/promo-video-2026-09-06/ai-translator-select-control-4k60.mp4).

Local master: `renders/ai-translator-select-control-4k60.mp4`.

- Native picture: 3840x2160, exact 60 fps, 7,532 frames.
- Runtime: 125.533333 seconds.
- Encoding: software libx264, slow preset, CRF 15, no bitrate cap, BT.709.
- Capture: lossless PNG, software browser rendering, full motion.
- Audio: stereo AAC at 48 kHz and 256 kbps, from the lossless WAV master.
- Narrator: Kokoro Adam (`am_adam`), generated at exactly 1.15x.
- Longest measured voice pause: 0.727396 seconds.
- Setup: 24.25 seconds, 19.32% of the film.
- File size: 30,670,491 bytes.
- File SHA-256: `11420aabcafa9cda7b348f6905b30fd3069e83922492b8f882e7dea5652b8fa0`.

## Chrome Web Store revision

Only scene s14, from 95.65 to 104.5 seconds, changes. The illustrated store listing shows Add to Chrome, Add extension and an installed state. ZIP extraction and developer installation steps are removed. The listing is prepared for the planned store release without invented ratings, users, badges or a listing URL.

The other 16 visual scenes reuse their approved encoded segments after exact visual source, timing, settings, version and checksum checks. All music files and all lossless audio samples outside s14 are unchanged. The original video remains backed up in the local render cache. The public GitHub asset is replaced at the same download link.

## Checks

The changed scene and both cuts passed HyperFrames runtime, layout and contrast checks. Two existing structural lint warnings remain: repeated icon images and the full preview's 17 clips sharing one lane. Independent review inspected native encoded frames through the install action, completion state, first and last scene frames, and both cuts in the full master.

The final master passed exact dimensions, frame rate, frame count, streams and strict full decode checks. No black segments were detected. Its AAC mix measured -16.0 LUFS and -3.24 dBTP, with no mixed-audio silence above 0.158 seconds. The audio self-test, audio checker, renderer self-check and repository source check passed. Evidence is recorded in `source-QA.json`, `audio-QA.json`, `media-QA.json` and `renders/store-revision/`.

## Reproduction

The project and render wrapper stay pinned to HyperFrames 0.8.29 to preserve the approved output. GSAP 3.14.2 and Kokoro ONNX 0.6.1 reuse the installed local assets and model. The audio Python environment is `/Users/mk/Documents/Codex/OpenMontage/.venv/bin/python`.

Run `npm run render` for the complete film. Run the audio tool with `--replace-scene s14` for a measured voice edit inside the existing scene window. A fixed `duration` in `narrative.json` preserves that window during a full audio rebuild.

The source, lossless audio master and documentation are stored in Git. MP4 files and render caches are ignored by Git; the final MP4 is delivered through the existing GitHub release. No extension code changed, so no extension reload is needed.
