# Comprehensive review and implementation report

Date: 2026-08-23

## Executive result

The application was reviewed and rebuilt as Chrome extension version 1.1.0. The work covered security, privacy, paid-request control, runtime correctness, edge cases, performance, accessibility, user experience, dependency health, build behavior, packaging, and documentation.

The implementation keeps the approved product behavior:

- A translation starts from the configured global key, the context menu, Retry, or choosing another language in a result card.
- The default global key is Control. The user can choose another supported single key or Off.
- Several translations can run on the same page. Limits apply only to concurrent and rapid requests.
- A result card can translate the same source text to another language without changing the saved default.
- Failed paid requests are not retried automatically. The card shows a safe failure message and a manual Retry button.
- Settings and the popup use a responsive Apple-style visual system with native controls and system fonts.
- The model selector uses the live Gemini Models API and keeps a validated cache for temporary service failures.

No known P0 or P1 finding remains after the review cycles. All confirmed P2 and P3 findings were fixed except the documented small-frame display limit described under Residual limits.

Post-release testing found one additional P1 startup failure in Chrome. The service worker referenced a context-menu event that Chrome does not provide. Execution stopped before the model-list message handler was registered, so settings could not load models even with a valid key. The implementation now uses Chrome's native document URL filter and has a startup regression test for this exact condition.

## Baseline and scope

- Repository: `https://github.com/miroslavkiev/chrome-ai-translate.git`
- Branch: `main`
- Reviewed baseline: `b5603d4c87de978307f450ce718ed5cda094296f`
- Local `HEAD` and the fetched `origin/main` reference matched before implementation.
- Review scope: source, manifest, settings, popup, content interaction, background runtime, Gemini integration, storage, dependencies, tests, CI, package layout, privacy text, and release documentation.

## Review method

The work used independent implementation and QA threads for:

1. Runtime and Gemini request handling.
2. Content interaction and result cards.
3. Settings, popup, accessibility, and delivery.

Each thread received an independent review. Confirmed findings were fixed and re-reviewed. The final joint pass checked integration across runtime, security, UX, accessibility, packaging, and documentation.

## Resolved security and privacy findings

### Paid-request activation

The former page-event flow allowed a web page to synthesize events that could start Gemini requests. The new trigger state machine accepts only trusted, clean key events. It snapshots the selected text on keydown and sends it only after the matching keyup confirms that the selection and document are unchanged.

The trigger cancels on repeat, composition, AltGraph, another key, pointer input, wheel, context menu, text input, selection change, blur, hidden state, page hide, document freeze, or a hold longer than 1.5 seconds.

### Request trust boundary

The background validates:

- Extension sender identity.
- Tab, frame, and HTTP, HTTPS, or local-file origin.
- Random UUID request identity.
- Non-empty source text.
- A 10,000 Unicode code-point input limit.
- Supported target language.
- The saved model against the key-bound model catalog.
- Model-specific output-token limits.

Source text, credentials, translations, and provider bodies are not logged. Provider error bodies are not exposed to pages.

### Credential storage

The Gemini API key moved from synced storage to trusted local extension storage. An upgrade migration copies and verifies an old synced key before it removes the synced copy. Replacing or clearing the key aborts active model discovery and invalidates the key-bound catalog.

The settings page uses the same API-key validator as the runtime. A structurally valid but rejected key does not make the popup report the extension as ready. Pasting a valid key now saves it immediately and starts model discovery. A manually typed key saves when the user leaves the field. Deleting the value and leaving the field removes it. The former Replace and Clear controls were removed.

### Page and frame routing

The extension no longer uses dynamic code injection. Result cards are created by the content script with a closed shadow root, static CSS, and `textContent`.

Context-menu delivery targets the selected frame. The receiving document must still have matching selected text. Chrome's native `documentUrlPatterns` limits the action to HTTP, HTTPS, and approved local-file documents without relying on unsupported runtime events.

### Prompt and response handling

The translation instruction is separate from the user text. The instruction tells the model to treat the selection as text, not as commands. Only a candidate with `finishReason: STOP` is accepted. Truncated, blocked, empty, oversized, or malformed responses become safe `invalid_response` failures.

## Resolved correctness and edge cases

- Stored Off remains Off after a page reload. A missing preference alone restores Control.
- Empty, password, and unsupported selections do not arm the trigger.
- Text inputs, textareas, normal document selections, contenteditable regions, and supported frames are handled.
- Context-menu text is rejected if a frame navigation makes it stale.
- Request identity is bound to one Port and one terminal result.
- Closing a loading card or unloading the document cancels its request.
- API-key changes are checked again before the paid Gemini request.
- Timeout takes precedence over late storage, gate, provider, or release outcomes.
- Gate rejection never changes active counters.
- A valid paid result is not discarded only because optional latest-result storage fails.
- Generic HTTP 403 responses are not mislabeled as invalid API keys.
- Failed results show clear local text, Close, and manual Retry.
- Several nearby cards use free viewport positions when space permits.
- A frame keeps no more than five completed cards. Loading cards are not evicted.

## Performance and quota controls

One serialized gate controls all paid starts:

- Maximum 3 active requests per tab.
- Maximum 6 active requests for the extension.
- Maximum 30 starts in a rolling 60-second window.
- Duplicate active requests for the same document, text, and language are rejected.
- No hidden queue.
- No automatic retry.

Cold model discovery is shared per API key. Parallel first requests wait on one catalog fetch instead of starting duplicate paginated requests. A caller can cancel its wait. The shared fetch stops when its last waiter leaves.

One 25-second deadline covers runtime preparation, catalog work, the request gate, the paid call, and result finalization. Gemini receives the lower of 8,192 output tokens and the selected model's reported output limit.

## Gemini model discovery

The settings page calls the official [Gemini Models API](https://ai.google.dev/api/models). It follows pagination and lists compatible text-generation models. The filter requires:

- `generateContent` support.
- A valid model identifier.
- A positive reported output-token limit.
- A model family that supports the system-instruction request contract.

Gemini text models are accepted while known embedding, image, TTS, speech, live, audio, robotics, and computer-use variants are excluded. Gemma models earlier than Gemma 4 are excluded because they do not meet this request contract. The Models API does not expose an output-modality field, so unknown future Gemini text identifiers remain visible instead of being rejected by guesswork. The default is `gemma-4-26b-a4b-it`.

The catalog stores the API's `thinking` capability flag. Request configuration then uses the lowest control that is safe for the known model family:

- Gemini 3.7 Flash uses `LOW` because `MINIMAL` is rejected.
- Known Gemini 3 Flash and Flash-Lite models that support `MINIMAL` use it.
- Other Gemini 3 and later text models use `LOW` as the compatible low-cost setting.
- Gemini 2.5 Flash and Flash-Lite use a thinking budget of 0.
- Gemini 2.5 Pro uses its minimum budget because thinking cannot be disabled.
- Gemma receives no thinking control because the live API rejects that parameter even when model metadata reports thinking support.

Gemini 3 requests omit the temperature parameter and keep Google's optimized default. Older Gemini and Gemma requests keep temperature 0. No request sends both thinking-level and thinking-budget syntax.

A successful catalog is cached for 24 hours and bound to the current API key. A transient refresh failure can use the last validated list. Invalid, removed, or changed keys do not use stale key data. The extension never silently switches the saved model.

## UX and accessibility improvements

### Settings

- Responsive grouped cards and restrained Apple-style visual treatment.
- Native input, select, and button controls.
- Masked API-key field with Show and Hide.
- Paste-to-save, save-on-blur for manual entry, and delete-to-remove behavior.
- Live compatible-model list with manual Refresh models.
- Default target language.
- Single-key recording and Off.
- Visible Behavior and Privacy sections.
- Clear saved, unsaved, loading, cached, and failure states.
- Controls remain disabled during initialization and saving, so late asynchronous work cannot overwrite user edits.
- Light and dark themes, reduced motion, forced colors, and visible focus.
- Text and non-text contrast tokens meet their applicable targets.

### Result card

- Loading, success, and error states.
- Normal-weight system font for translated text.
- Temporary target-language selector that starts a new request immediately.
- Click outside, Escape, and Close dismissal.
- Manual Retry with clear paid-request behavior.
- Safe focus movement to Close when an activated action is hidden during loading.
- No focus theft when a new card appears.
- Keyboard Escape closes the card.
- Polite success announcements and assertive failure announcements.
- Right-to-left and long text support.

### Popup

- Setup required, Ready, Translating, and Error states.
- Separate key-present and Gemini-validated setup state.
- Configured global key and active request count.
- Latest session result or safe failure.
- One Settings action.

Browser snapshot tests gave the settings page and popup 100 accessibility and 100 best-practices scores. Mocked browser interaction also confirmed save locking, the Off control, model rendering, temporary language requests, safe focus, sanitized errors, Retry, and card collision handling.

## Build, dependency, and release improvements

- Removed the Gemini JavaScript SDK from the runtime bundle. Native `fetch` now uses the documented REST API.
- Removed unused Babel, path polyfill, and custom archive-hook complexity.
- Upgraded the remaining build dependencies.
- Dependency audit result: 0 known vulnerabilities.
- `npm run build` is a one-shot production build.
- `npm run watch` is the only watch command.
- `npm run package` builds, creates the ZIP, writes SHA-256, and verifies the package.
- Package errors fail the command.
- ZIP entries are at the archive root, so the extracted folder can be loaded directly.
- ZIP timestamps and file order are fixed for deterministic output.
- Verification checks CRC, exact entry names, ZIP checksum, ZIP-to-dist byte equality, and source-to-build freshness.
- CI runs checks, tests, packaging, and audit on Linux, macOS, and Windows.
- Third-party CI actions are pinned to full commit hashes.
- README, privacy notice, license, manifest version, and release instructions match the implementation.

## Validation evidence

- Static repository checks: passed for 26 source and documentation files.
- Native Node tests: 13 passed, 0 failed.
- JavaScript syntax checks: passed.
- Production webpack build: passed.
- Package layout and CRC verification: passed.
- Final ZIP SHA-256: `eb8dc8dee9e78a8d861592a478cdbf936a288a3187e331ffdabc668888e34080`.
- ZIP entries matched current `dist` bytes: passed.
- Standalone stale-source rejection: confirmed before the final rebuild.
- Deterministic package regeneration: passed.
- Dependency audit: 0 vulnerabilities.
- Git whitespace validation: passed.
- Browser rendering: desktop and mobile settings passed visual inspection.
- Browser rendering: popup passed visual inspection.
- Isolated Chrome startup: enabled with no manifest or runtime errors.
- Isolated Chrome API-key flow: paste saved, delete removed, and second paste restored the key.
- Live model discovery: 18 compatible models loaded, including Gemini 3.7 Flash, with no known media or computer-use variants.
- Live default-model request: HTTP 200 with a `STOP` finish reason at a practical output limit.
- Exact supplied local-file page: content script, trusted key trigger, and first translation passed.
- Result-card language change: started a second request for French without a Translate button.
- Result-card outside click: card closed and its page element was removed.
- Lighthouse snapshots: accessibility 100 and best practices 100 for settings and popup.
- Mocked in-page result flow: success, temporary language, focus, error, Retry, and multiple-card placement passed.

## Residual limits and validation boundaries

- The global key requires persistent content-script access to HTTP, HTTPS, and approved local-file pages and frames.
- Chrome requires the user to enable Allow access to file URLs for local-file pages.
- Every single-key choice can conflict with a website, browser, operating system, or accessibility tool. Off and the context menu remain available.
- A hostile page can remove or hide an overlay. The service worker still validates every request.
- Local extension storage is not encrypted against compromise of the local Chrome profile.
- Chrome pages, browser settings, the built-in PDF viewer, and other restricted pages are unsupported.
- A result card inside a very small frame is constrained by that frame viewport. The toolbar popup keeps the latest session result as a fallback.
- The user-authorized key already stored in Chrome was used for Models API and minimal generation checks. It was not printed, copied into the repository, or written outside Chrome's local extension storage and an isolated temporary browser profile.
- Live generation checks covered current Gemini 3, compatibility aliases, retired Gemini 2.5 identifiers, and Gemma's rejected thinking-control case. These checks used short prompts and small output limits.
- The unpacked extension was tested in an isolated Chrome for Testing profile. The user's normal Chrome profile was inspected only to obtain the authorized stored key and current extension metadata.
- A real screen reader and other live assistive technologies were not used. Browser accessibility trees and Lighthouse were used instead.

## Main implementation files

- `DESIGN.md`: approved behavior and architecture.
- `shared.js`: shared settings, limits, validation, and public errors.
- `trigger.js`: trusted clean key-release state machine.
- `request-policy.js`: sender, request, gate, catalog, response, and provider-error policy.
- `background.js`: storage, model discovery, request coordination, Gemini calls, and session state.
- `content.js`: selection capture, request Port, result cards, and frame interaction.
- `settings.html` and `settings.js`: settings experience.
- `popup.html` and `popup.js`: toolbar state.
- `scripts/`: checks, deterministic packaging, and package verification.
- `test/`: native Node regression checks.
- `.github/workflows/ci.yml`: cross-platform release validation.
