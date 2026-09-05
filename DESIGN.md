# AI Translator implementation design

## Product behavior

AI Translator translates selected text on HTTP, HTTPS, and approved local-file pages with a user-owned Gemini API key. A translation starts only after one of these user actions:

- Release the configured single global key after a clean key press. The default is Control.
- Choose Translate Selected Text from the context menu.
- Choose a different language or Retry in an existing result card.

The extension supports unlimited sequential translations. It limits only active and rapid requests.

## Trigger contract

The content script loads the configured key before it enables the trigger. Off disables the key trigger but keeps the context menu.

On the first trusted keydown for the configured key, the content script records the selection, its DOM identity, its direction or offsets, its anchor, and the time. It triggers on the matching trusted keyup only if the selection and document are unchanged.

It cancels on repeat, composition, AltGraph, another key, pointer down, wheel, context menu, beforeinput, selection change, blur, hidden document, page hide, freeze, or a hold longer than 1.5 seconds. Translation-key handling leaves the page event intact. While a card is open, an unmodified Escape closes the focused or newest card and consumes that event so it does not also close the page's modal. The first clean Tab after opening a card can enter its output or Close control without a permanent focus trap.

The supported non-printable key list is explicit. The settings page explains that every single-key choice can conflict with a site, browser, operating system, or accessibility tool.

Selections can come from normal content, contenteditable elements, text inputs, textareas, and frames. Focus is followed through open shadow roots. Closed roots remain inaccessible. Password fields are never read. Unsupported selection controls fail before an API call. An unchanged overlong selection shows an error after a deliberate trigger or context-menu action and makes no provider call.

## Request contract

Each content script opens one runtime Port per request. The Port binds the response and cancellation to the source document. Closing a loading card or unloading the page disconnects the Port and aborts the request.

The request contains only:

- action: translate
- requestId: a random UUID, using Web Crypto random bytes when HTTP has no randomUUID
- text: the selected text
- targetLanguage: an optional temporary language override

The background validates the sender, page scheme, request ID, text type, non-empty text, 10,000 Unicode code-point limit, target language, selected model, and cached Gemini model catalog. It never trusts a model supplied by a content script.

Every paid request passes through one gate:

- At most 3 active requests per tab.
- At most 6 active requests for the extension.
- At most 30 starts in a rolling 60-second window.
- Duplicate active requests for the same document, text, and language are rejected.

Rolling timestamps are stored in trusted extension-only session storage so service-worker restarts do not reset the rate limit. There is no hidden queue and no automatic retry.

## Gemini integration

The service worker is the only backend; there is no server. It uses native fetch for the Gemini REST API. It sends the API key in the x-goog-api-key header and never logs credentials, source text, translations, or provider response bodies.

Model discovery uses models.list. It follows pagination and keeps text models that support generateContent, report an output limit, and support the system-instruction request contract. Known embedding, image, TTS, speech, live, audio, robotics, and computer-use identifiers are excluded. Unknown future identifiers remain visible because the Models API does not report output modality. The cached model record includes Google's thinking capability flag. It stores the last successful catalog locally and exposes a manual Refresh action. A transient failed refresh keeps the last successful list and shows that it is cached. An invalid or changed API key does not use stale cached data. Translation never switches to another model without the user's choice.

Translation uses a system instruction that contains the validated target language and a separate user-text part. Requests have one 25-second AbortController deadline. The output-token limit is the lower of 8,192 and the selected model's reported limit. Thinking is disabled where supported, set to MINIMAL for compatible Gemini 3 Flash variants, and set to LOW for other Gemini 3 models. Gemini 3 uses Google's default temperature. Older Gemini models use the backward-compatible thinking budget. The existing Gemma exception omits thinking controls. Returned text is accepted only after a STOP finish reason and is limited to 40,000 Unicode code points. Parts marked thought:true are excluded. Output-limit and provider-block finishes have distinct safe errors; truncated text is never shown as a complete translation.

Provider compatibility note, 2026-09-05: the default model, prompt, alias handling, and Gemma exception retain the earlier implementation. Model aliases can change, and current Google guidance may differ from the older request observations. These rules are not a claim of current live model compatibility. Revalidate against the [thinking guide](https://ai.google.dev/gemini-api/docs/generate-content/thinking) and [Gemma guide](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api), then run the human-reviewed sample in RELEASE_CHECKS.md before changing them. No real provider calls were made for this hardening release.

## Storage

- chrome.storage.local: Gemini API key, key-check status, and cached model catalog.
- chrome.storage.sync: target language, selected model, and configured trigger key.
- chrome.storage.session: rolling rate timestamps, active count, and the latest result or failure.

Local and session storage use TRUSTED_CONTEXTS. On upgrade, an old synced API key is copied to local storage, verified, and removed from sync storage. Clearing or replacing the key invalidates the cached model catalog.

Chrome 140 is the minimum version. Earlier Chrome versions expose storage.session.setAccessLevel but cannot restrict the local area used for API keys. Chrome 120's real CI run failed during this startup guard, before any provider request. The [Chrome 140 implementation change](https://chromium.googlesource.com/chromium/src.git/+/a8f1f337c692360aaec9470a0a91f965011d37a3%5E%21/) added local/sync support. Raising the declared minimum keeps the protection intact and avoids claiming unsupported browsers work.

The catalog is fresh for 24 hours. Settings list loading refreshes expired data; translation explicitly allows an older catalog to preserve availability. A transient list-read failure may return the current saved catalog with cached-data metadata. There is no background refresh timer. A known authentication failure invalidates that key's catalog and records rejection until successful validation or key replacement. A rejected model is excluded through the catalog's unavailableModels IDs. A successful live catalog refresh or newer successful translation can clear that model's rejection. Key identity and validation order guard all delayed writes, so an old request cannot invalidate newer key or catalog state. Storage errors fail request reservation safely; status writes have a narrow in-memory fallback and never expose credentials.

The latest session entry never contains source text. Success has status, requestId, translatedText, targetLanguage, and completedAt. Failure has status, requestId, completedAt, and a safe error. The popup reads this one schema. There is no translation history. Service-worker reconstruction preserves session rate starts and the latest entry, and resets the active count for requests that no longer exist. Browser session end clears these values.

## Result card

The result card uses a closed shadow root, static styles, and textContent. It is fixed to a clamped viewport position near the captured selection. A manual native popover places it in the top layer; its host is inside the source modal or fullscreen container when needed for input and focus. Nearby cards use free positions when space permits. It does not steal focus. English UI controls have lang=en; successful text gets its validated target language.

Each card has loading, success, and error states. Key and model errors offer Settings. Temporary errors offer Retry; output limits and blocks give selection guidance. A known retry delay disables Retry and language requests until it expires. Retry is manual and counts as a new paid request. Choosing another language starts one new request for that card immediately and does not change the saved default language. Successful text has Copy, with selectable output and an honest failure message when clipboard access is unavailable.

U01 and U02 were excluded from this release. Outside clicks still close all cards and cancel unfinished work. Retry and language changes still clear prior output immediately; a failed replacement leaves it cleared. Cancellation can overwrite the latest session success. No pinning, retained output, history, or single-card redesign was added.

A frame keeps at most five completed cards. It removes the oldest completed card first. Loading cards are not evicted. Long and right-to-left text remain readable. Status updates are accessible, and reduced motion, dark mode, and high contrast are supported.

## Settings and popup

The settings page uses native HTML, CSS, and JavaScript with system fonts, grouped cards, restrained color, responsive layout, keyboard support, visible focus, dark mode, high contrast, and reduced motion. ui.css shares the popup/settings colors and controls; the injected card keeps its isolated stylesheet. shared.js owns language, key labels, source validation, error guidance, UUID generation, and Copy behavior. No UI framework or production dependency is needed.

Pasting a valid API key saves it and loads models automatically. A manually typed key saves when the field loses focus, and an empty field removes the key. The page supports masked reveal, live compatible-model selection, manual model refresh, default target language, key recording, Off, privacy disclosure, and explicit preference Save feedback.

Settings awaits background migration and reads saved state before it enables writing. Initialization changes are replayed. It tracks a baseline and dirty fields, merges untouched external values, rechecks storage before saving, and writes only changed fields. Known conflicts preserve the edit and require Reload saved settings to discard it. Key-save failures preserve the typed key for retry. Direct Chrome storage is last-writer-wins: simultaneous writes to the same field in the tiny interval between read and write cannot be made atomic by this UI. No broad state store is added for this local tool. null and legacy string Off both mean a disabled trigger.

The toolbar popup shows Add API key, Check setup, Key rejected, Ready, Translating, or Error, the configured key, active request count, latest session result or failure, language, completion time, Copy, and Settings. Ready means the saved model passed known setup checks; it is not a live quota or availability guarantee.

HTTP, HTTPS, and local `file://` documents are supported. Chrome requires the user to enable Allow access to file URLs on the extension details page before content scripts can run on local files.

## Errors

Public errors use stable codes: no_selection, unsupported_selection, selection_too_large, missing_api_key, invalid_api_key, invalid_model, busy, duplicate_request, rate_limited, timeout, offline, network_error, quota_exceeded, service_error, invalid_response, output_too_large, content_blocked, unsupported_page, frame_unavailable, and cancelled.

Each connected request reaches one terminal state. User messages do not expose raw provider or internal errors.

## Delivery

Build, watch, and package are separate commands. Build cleans the output, compiles once, and exits. Package fails on errors and places manifest.json, INSTALL.md, PRIVACY.md, and LICENSE at the ZIP root alongside runtime assets and shared CSS. Verification checks source freshness, exact file bytes, checksum, and manifest/package version equality. CI installs from the lock file, runs checks and tests, builds, packages, and verifies the archive on Linux, macOS, and Windows. Playwright is a development-only dependency for real extension smoke checks with fake replies; Node tests cover state, failure, and concurrency paths. See RELEASE_CHECKS.md.

The manifest declares only HTTP, HTTPS, and local-file persistent access, all-frame behavior, required permissions, the minimum Chrome version, and the new release version. README, privacy notes, and license match the shipped behavior.

The source-root manifest points its classic content script at dist/content.js. Background, Settings, and popup source entries already use modules. Webpack removes the dist/ prefix from content-script paths in the packaged manifest, where the bundle is at the archive root. Both install layouts use the same content bundle. Package verification parses both entries as classic scripts, and browser checks exercise both install folders. Existing source-root installs keep their path and saved settings; rebuilding is required after source changes.

## Accepted residual limits

- The global key requires persistent content-script access to HTTP, HTTPS, and approved local-file pages.
- A hostile page can remove or hide an overlay and can encourage the user to press the configured key.
- A compromised content script can send a request because the service worker cannot verify event.isTrusted.
- Local extension storage is not encrypted against local profile compromise.
- Restricted browser pages and the built-in PDF viewer are unsupported.
- Single keys can conflict with other software. Off and the context menu remain available.
- A result card inside a very small frame is constrained by that frame's viewport. The toolbar popup provides the latest session result as a fallback.
