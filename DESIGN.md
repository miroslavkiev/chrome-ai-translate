# AI Translator implementation design

## Product behavior

AI Translator translates selected text on HTTP, HTTPS, and approved local-file pages with a user-owned Gemini API key. A translation starts only after one of these user actions:

- Release the configured single global key after a clean key press. The default is Control.
- Choose Translate Selected Text from the context menu.
- Choose a different language or Retry in an existing result card.

The extension supports unlimited sequential translations. It limits only active and rapid requests.

## Trigger contract

The content script requests only the target language and trigger key from the background before it enables the trigger. It cannot read Chrome storage directly. Preference changes notify all frames to read a fresh validated value; older replies are ignored. Off disables the key trigger but keeps the context menu.

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

Rolling timestamps are stored in trusted extension-only session storage so service-worker restarts do not reset the rate limit. There is no hidden queue and no automatic retry. A validated request has one terminal response even if startup, credential reads or reservation storage stall. A completed translation is delivered after final consent and key checks, before status and latest-result bookkeeping. A late reservation is released once and cannot start a provider request after timeout.

## Gemini integration

For new setup in version 1.3.0, the suggested model is Gemini 3.5 Flash-Lite. Settings recommends the Flash-Lite family and dates this specific recommendation to September 2026. Users can choose another compatible model. Use recommended model selects it only when the checked list includes it, and the user still saves the choice. Translation does not change models automatically. The existing generation parameters and prompt are unchanged.

shared.js contains Google's documented general Gemini language list, reviewed on 2026-09-05: 110 choices including separate Simplified and Traditional Chinese. Settings, result cards and request validation reuse this single list. The Models API has no language field. Language support is not a translation-quality guarantee or a claim about every non-Gemini model.

The service worker is the only backend; there is no server. It uses native fetch for the Gemini REST API. It sends the API key in the x-goog-api-key header and never logs credentials, source text, translations, or provider response bodies.

Provider JSON bodies are limited to 2 MiB before parsing, including chunked replies without a trustworthy size header. Aborted body reads keep their cancellation or timeout reason. Model discovery uses models.list. It limits pagination to 100 pages and 5,000 raw entries, retaining only normalized fields between pages. It keeps text models that support generateContent, report an output limit, and support the system-instruction request contract. Known embedding, image, TTS, speech, live, audio, robotics, and computer-use identifiers are excluded. Unknown future identifiers remain visible because the Models API does not report output modality. The cached model record includes Google's thinking capability flag. It stores the last successful catalog locally and exposes a manual Refresh action. A transient failed refresh keeps the last successful list and shows that it is cached. An invalid or changed API key does not use stale cached data. Translation never switches to another model without the user's choice.

Translation uses a system instruction that contains the validated target language and a separate user-text part. Requests have one 25-second AbortController deadline. The output-token limit is the lower of 8,192 and the selected model's reported limit. Thinking is disabled where supported, set to MINIMAL for compatible Gemini 3 Flash variants, and set to LOW for other Gemini 3 models. Gemini 3 uses Google's default temperature. Older Gemini models use the backward-compatible thinking budget. The existing Gemma exception omits thinking controls. Returned text is accepted only after a STOP finish reason and is limited to 40,000 Unicode code points. Parts marked thought:true are excluded. Output-limit and provider-block finishes have distinct safe errors; truncated text is never shown as a complete translation.

Provider compatibility note, 2026-09-05: the default model, prompt, alias handling, and Gemma exception retain the earlier implementation. Model aliases can change, and current Google guidance may differ from the older request observations. These rules are not a claim of current live model compatibility. Revalidate against the [thinking guide](https://ai.google.dev/gemini-api/docs/generate-content/thinking) and [Gemma guide](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api), then run the human-reviewed sample in RELEASE_CHECKS.md before changing them. No real provider calls were made for this hardening release.

## Storage

- Extension IndexedDB: the API key encrypted with AES-256-GCM, its nonextractable CryptoKey, IV and credential revision, or a non-secret deletion record.
- chrome.storage.local: data agreement, credential revision notification, key-check status, and cached model catalog.
- chrome.storage.sync: target language, selected model, and configured trigger key.
- chrome.storage.session: rolling rate timestamps, active count, the latest result or failure, and a data-sharing denial marker.

Withdrawal closes access immediately and starts a trusted session denial before credential waits. It independently removes the local agreement, or writes an invalid revocation record if removal fails. Local agreement writes and session marker writes each keep their own order, so a stalled key or session operation cannot prevent local withdrawal. A session denial survives a worker restart while local persistence is retried. Reacceptance opens access only after a new local agreement is saved and the denial is cleared. A pending persistence failure remains visible in Settings. Successful withdrawal returns a narrow acknowledgement without waiting for credential state; Settings preserves saved credentials and refreshes full state separately. If all storage writes fail, persistence through a full browser restart cannot be guaranteed.

Startup restricts local, sync and session storage to trusted extension contexts before migration. Legacy local and synced keys are encrypted into the IndexedDB record. The saved record is decrypted and verified before either plaintext copy is removed. Failed migration preserves the legacy value and blocks provider access. A current encrypted record or deletion record wins over a late legacy sync value. Clearing or replacing the key invalidates the cached model catalog.

After key migration, startup fills only missing language/model preferences. A profile with an existing key or preferences keeps the old effective defaults (Ukrainian and Gemma). A profile with neither starts with targetLanguage:null and the recommended model. Startup rechecks missing fields before writing. Explicit null marks an unfinished language choice even after a key is saved or the worker restarts. No separate first-run flag is used. Invalid or unselected saved languages and malformed model IDs block translation before model discovery or provider access and offer Settings. Invalid model IDs never become the default model.

Chrome 140 is the minimum version. Earlier Chrome versions expose storage.session.setAccessLevel but cannot restrict the local and sync areas used by legacy keys. Chrome 120's real CI run failed during this startup guard, before any provider request. The [Chrome 140 implementation change](https://chromium.googlesource.com/chromium/src.git/+/a8f1f337c692360aaec9470a0a91f965011d37a3%5E%21/) added local/sync support. Raising the declared minimum keeps the protection intact and avoids claiming unsupported browsers work.

The catalog is fresh for 24 hours. Settings list loading refreshes expired data; translation explicitly allows an older catalog to preserve availability. A transient list-read failure may return the current saved catalog with cached-data metadata. There is no background refresh timer. A known authentication failure invalidates that key's catalog and records rejection until successful validation or key replacement. A rejected model is excluded through the catalog's unavailableModels IDs. A successful live catalog refresh or newer successful translation can clear that model's rejection. Key identity and validation order guard all delayed writes, so an old request cannot invalidate newer key or catalog state. Storage errors fail rolling-rate reservation safely. The active-count display writes run separately from the request gate and use the current count when their turn starts. Status writes have a narrow in-memory fallback and never expose credentials.

The latest session entry never contains source text. Success has status, requestId, translatedText, targetLanguage, and completedAt. Failure has status, requestId, completedAt, and a safe error. The popup reads this one schema. There is no translation history. Service-worker reconstruction preserves session rate starts and the latest entry, and resets the active count for requests that no longer exist. Browser session end clears these values.

## Result card

The result card uses a closed shadow root, static styles, and textContent. It is fixed to a clamped viewport position near the captured selection. A manual native popover places it in the top layer; its host is inside the source modal or fullscreen container when needed for input and focus. Nearby cards use free positions when space permits. It does not steal focus. UI controls inherit Chrome's interface language and direction; successful text gets its validated target language and automatic text direction.

Each card has loading, success, and error states. Key, model and non-retryable provider permission errors offer Settings. Temporary errors offer Retry; output limits and blocks give selection guidance. A known retry delay disables Retry and language requests until it expires. Retry is manual and counts as a new paid request. Choosing another language starts one new request for that card immediately and does not change the saved default language. Successful text has Copy, with selectable output and an honest failure message when clipboard access is unavailable.

U01 and U02 were excluded from this release. Outside clicks still close all cards and cancel unfinished work. Retry and language changes still clear prior output immediately; a failed replacement leaves it cleared. Cancellation can overwrite the latest session success. No pinning, retained output, history, or single-card redesign was added.

A frame keeps at most five completed cards. It removes the oldest completed card first. Loading cards are not evicted. Long and right-to-left text remain readable. Status updates are accessible, and reduced motion, dark mode, and high contrast are supported.

## Settings and popup

Version 1.3.0 uses a checklist above the existing Settings form. It appears when the key is missing or the language is unselected, remains visible through key autosave, and closes after Finish setup saves the choices. A fresh language select suggests the first supported Chrome preferred language, with interface-language and English fallbacks. The suggestion stays unsaved until Finish setup. Invalid saved values still need an explicit correction. Preferences remain editable without a key. The no-key popup explains the steps and offers Start setup; a saved key with no chosen language uses the normal popup with Finish setup. Rejected existing keys use normal repair guidance. Local Help and About pages reuse ui.css and guide.css. About alone has the optional external Ukraine support link; donation is never required.

The first successful key save opens a native dialog headed **Refresh open pages**. Existing credential revisions, including deletion tombstones, prevent repeats for key replacement. The same reminder is the first FAQ answer.

The settings page uses native HTML, CSS, and JavaScript with system fonts, grouped cards, restrained color, responsive layout, keyboard support, visible focus, dark mode, high contrast, and reduced motion. ui.css shares the popup/settings colors and controls; the injected card keeps its isolated stylesheet. shared.js owns language, key labels, source validation, error guidance, UUID generation, and Copy behavior. No UI framework or production dependency is needed.

Pasting a valid API key saves it and loads models automatically. A manually typed key saves when the field loses focus, and an empty draft keeps the saved key. Only Remove saved key deletes it. The page supports masked reveal, live compatible-model selection, manual model refresh, default target language, key recording, Off, privacy disclosure, and explicit preference Save feedback.

Settings awaits background migration and reads saved state before it enables writing. Initialization changes are replayed. It tracks a baseline and dirty fields, merges untouched external values, rechecks storage before saving, and writes only changed fields. Known conflicts preserve the edit and require Reload saved settings to discard it. Key-save failures preserve the typed key for retry. Direct Chrome storage is last-writer-wins: simultaneous writes to the same field in the tiny interval between read and write cannot be made atomic by this UI. No broad state store is added for this local tool. null and legacy string Off both mean a disabled trigger.

The toolbar popup shows Add API key, Check setup, Key rejected, Ready, Translating, or Error, the configured key, active request count, latest session result or failure, language, completion time, Copy, and Settings. Ready means the saved model passed known setup checks; it is not a live quota or availability guarantee.

HTTP, HTTPS, and local `file://` documents are supported. Chrome requires the user to enable Allow access to file URLs on the extension details page before content scripts can run on local files.

## Errors

Public errors use stable codes: no_selection, unsupported_selection, selection_too_large, missing_api_key, invalid_api_key, invalid_model, busy, duplicate_request, rate_limited, timeout, offline, network_error, quota_exceeded, service_error, invalid_response, output_too_large, content_blocked, unsupported_page, frame_unavailable, and cancelled.

Each connected request reaches one terminal state. User messages do not expose raw provider or internal errors.

## Delivery

Build, watch, and package are separate commands. Build cleans the output, compiles once, and exits. Package fails on errors and places manifest.json, INSTALL.md, PRIVACY.md, and LICENSE at the ZIP root alongside runtime assets and shared CSS. Verification checks source freshness, exact file bytes, checksum, and manifest/package version equality. CI installs from the lock file, runs checks and tests, builds, packages, and verifies the archive on Linux, macOS, and Windows. Playwright is a development-only dependency for real extension smoke checks with fake replies; Node tests cover state, failure, and concurrency paths. See RELEASE_CHECKS.md.

The manifest declares only HTTP, HTTPS, and local-file persistent access, all-frame behavior, required permissions, the minimum Chrome version, and the new release version. README, privacy notes, and license match the shipped behavior.

The source-root manifest points to dist/content.js and dist/background.js. Both install layouts use built content and background scripts. This keeps JSON message imports out of native service-worker loading, which failed on worker restart during testing. Settings and popup source entries use page modules. Webpack removes dist/ from background and content paths in the packaged manifest. Package verification parses both entries as classic scripts, and browser checks exercise both install folders. Existing source-root installs keep their path and saved settings; rebuilding is required after source changes.

## Accepted residual limits

- The global key requires persistent content-script access to HTTP, HTTPS, and approved local-file pages.
- A hostile page can remove or hide an overlay and can encourage the user to press the configured key.
- A compromised content script can send a request because the service worker cannot verify event.isTrusted.
- The encrypted key opens automatically in the same Chrome profile. Its encryption key is stored in that profile, so this is not an OS keychain or protection against full profile compromise.
- Restricted browser pages and the built-in PDF viewer are unsupported.
- Single keys can conflict with other software. Off and the context menu remain available.
- A result card inside a very small frame is constrained by that frame's viewport. The toolbar popup provides the latest session result as a fallback.

## Interface localization

Chrome native i18n selects one of 55 packaged catalogs. i18n.js centralizes message lookup, locale formatting, display names, direction and trusted inline text slots. Rich messages can reorder numbered slots but cannot create HTML or change link destinations. English is the fallback. Provider model IDs, prompts, language codes and validation remain stable. Catalog checks enforce complete keys, matching placeholders/tags and manifest limits; browser checks use native Chrome locales. See I18N.md for maintenance.
