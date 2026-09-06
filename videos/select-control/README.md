# Select. Control. Understand.

A 2 minute 6 second promo for AI Translator for Chrome. The film shows the copy-paste problem, translation beside selected text, useful language choices and flexible controls. The last 19.32% covers installation and setup.

The [latest public video](https://github.com/miroslavkiev/chrome-ai-translate/releases/download/promo-video-2026-09-06/ai-translator-select-control-4k60.mp4) is also saved as `renders/ai-translator-select-control-4k60.mp4`: native 3840x2160, 60 fps, software H.264 at CRF 15. Each frame is captured as a lossless PNG before encoding. Adam narration is generated locally with Kokoro at 1.15x. The original music bed is also generated locally. No paid media or cloud rendering is used.

## Rebuild

The source uses HyperFrames 0.8.29, local GSAP 3.14.2, Node.js and FFmpeg. The existing extension repository provides Playwright for browser checks. No app code changes are needed.

```sh
node build.mjs
npm run check -- --samples 34 --at-transitions --max-transition-samples 160
python3 tools/render_hq.py --self-check
npm run render
```

`render_hq.py --only s04 s08` renders selected scenes. Rendering resumes from verified scenes with matching source hashes. The script removes only its generated PNG frames after a successful encoded segment check. Logs and receipts stay in `renders/hq-scenes/`.

The committed audio master is ready to use. To regenerate the voice and music, run `tools/build_audio.py` with a Python environment containing `kokoro-onnx`, `numpy` and `soundfile`. The installed runtime used for this delivery is recorded in `DELIVERY.md`. Cached model and voice files are reused. For a single narration edit, `--replace-scene s14` preserves all other audio samples and the existing scene boundaries; a fixed `duration` in `narrative.json` also preserves that window during a full rebuild. Run the same script with `--check` to repeat the audio checks.

## Edit

- `narrative.json` contains the voice script.
- `timings.json` records measured scene and speech times.
- `scenes/opening.mjs` and `scenes/closing.mjs` contain the visual story and motion.
- `scenes/helpers.mjs` and `shared.css` reuse the same controls and style across scenes.
- `build.mjs` writes the editable full composition and standalone scene projects.
- `frame.md` and `BRIEF.md` record the design and requested output.

Translations are examples authored for the film. They are not a measured model benchmark. The source app remains unchanged. The extension is free; Google API charges may apply. The install scene illustrates the planned Chrome Web Store release, using Add to Chrome and Add extension. No listing URL, ratings or user counts are invented. The other 16 scenes are unchanged from the approved film.

## Source references

Current local `README.md`, `ui.css`, `content.js`, `trigger.js`, `settings.html`, `popup.html`, `manifest.json` and the approved `store/source/icon-master.png` were checked before production. The original icon is reused without modification.

The visual direction uses the pacing and product focus of [Apple's September 2025 event](https://www.apple.com/apple-events/), with this extension's own colors and controls. The store illustration follows [Google's extension install guide](https://support.google.com/chrome_webstore/answer/2664769?hl=en). Setup refers to [Google's Gemini API key guide](https://ai.google.dev/gemini-api/docs/api-key). No Apple or Google video assets are included.
