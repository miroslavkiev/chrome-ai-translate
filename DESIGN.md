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

It cancels on repeat, composition, AltGraph, another key, pointer down, wheel, context menu, beforeinput, selection change, blur, hidden document, page hide, freeze, or a hold longer than 1.5 seconds. It does not call preventDefault or stopPropagation on web pages.

The supported non-printable key list is explicit. The settings page explains that every single-key choice can conflict with a site, browser, operating system, or accessibility tool.

Selections can come from normal content, contenteditable elements, text inputs, textareas, and frames. Password fields are never read. Unsupported selection controls fail before an API call.

## Request contract

Each content script opens one runtime Port per request. The Port binds the response and cancellation to the source document. Closing a loading card or unloading the page disconnects the Port and aborts the request.

The request contains only:

- action: translate
- requestId: a random UUID
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

The service worker uses native fetch for the Gemini REST API. It sends the API key in the x-goog-api-key header and never logs credentials, source text, translations, or provider response bodies.

Model discovery uses models.list. It follows pagination and keeps text models that support generateContent, report an output limit, and support the system-instruction request contract. Known embedding, image, TTS, speech, live, audio, robotics, and computer-use identifiers are excluded. Unknown future identifiers remain visible because the Models API does not report output modality. The cached model record includes Google's thinking capability flag. It stores the last successful catalog locally and exposes a manual Refresh action. A transient failed refresh keeps the last successful list and shows that it is cached. An invalid or changed API key does not use stale cached data. Translation never switches to another model without the user's choice.

Translation uses a system instruction that contains the validated target language and a separate user-text part. Requests have one 25-second AbortController deadline. The output-token limit is the lower of 8,192 and the selected model's reported limit. Thinking is disabled where supported, set to MINIMAL for compatible Gemini 3 Flash variants, and set to LOW for other Gemini 3 models. Gemini 3 uses Google's default temperature. Older Gemini models use the backward-compatible thinking budget. No thinking parameter is sent when the model reports thinking but does not accept a control. Returned text is accepted only after a STOP finish reason and is limited to 40,000 Unicode code points.

## Storage

- chrome.storage.local: Gemini API key and cached model catalog.
- chrome.storage.sync: target language, selected model, and configured trigger key.
- chrome.storage.session: rolling rate timestamps, active count, and the latest result or failure.

Local and session storage use TRUSTED_CONTEXTS. On upgrade, an old synced API key is copied to local storage, verified, and removed from sync storage. Clearing or replacing the key invalidates the cached model catalog.

The latest session entry never contains source text. There is no translation history.

## Result card

The result card uses a closed shadow root, static styles, and textContent. It is fixed to a clamped viewport position near the captured selection. Nearby cards use free positions when space permits. It does not steal focus.

Each card has loading, success, and error states. Failure always shows a clear message, Retry, and Close. Retry is manual and counts as a new paid request. Choosing another language starts one new request for that card immediately and does not change the saved default language. Clicking outside the card, pressing Escape, or choosing Close dismisses it.

A frame keeps at most five completed cards. It removes the oldest completed card first. Loading cards are not evicted. Long and right-to-left text remain readable. Status updates are accessible, and reduced motion, dark mode, and high contrast are supported.

## Settings and popup

The settings page uses native HTML, CSS, and JavaScript with system fonts, grouped cards, restrained color, responsive layout, keyboard support, visible focus, dark mode, high contrast, and reduced motion.

Pasting a valid API key saves it and loads models automatically. A manually typed key saves when the field loses focus, and an empty field removes the key. The page supports masked reveal, live compatible-model selection, manual model refresh, default target language, key recording, Off, privacy disclosure, and explicit preference Save feedback.

The toolbar popup shows Setup required, Ready, Translating, or Error, the configured key, the active request count, the latest session result or failure, and a Settings button.

HTTP, HTTPS, and local `file://` documents are supported. Chrome requires the user to enable Allow access to file URLs on the extension details page before content scripts can run on local files.

## Errors

Public errors use stable codes: no_selection, unsupported_selection, selection_too_large, missing_api_key, invalid_api_key, invalid_model, busy, duplicate_request, rate_limited, timeout, offline, network_error, quota_exceeded, service_error, invalid_response, unsupported_page, frame_unavailable, and cancelled.

Each connected request reaches one terminal state. User messages do not expose raw provider or internal errors.

## Delivery

Build, watch, and package are separate commands. Build cleans the output, compiles once, and exits. Package fails on errors and places manifest.json at the ZIP root. CI installs from the lock file, runs checks and tests, builds, packages, and verifies the archive on Linux, macOS, and Windows.

The manifest declares only HTTP, HTTPS, and local-file persistent access, all-frame behavior, required permissions, the minimum Chrome version, and the new release version. README, privacy notes, and license match the shipped behavior.

## Accepted residual limits

- The global key requires persistent content-script access to HTTP, HTTPS, and approved local-file pages.
- A hostile page can remove or hide an overlay and can encourage the user to press the configured key.
- A compromised content script can send a request because the service worker cannot verify event.isTrusted.
- Local extension storage is not encrypted against local profile compromise.
- Restricted browser pages and the built-in PDF viewer are unsupported.
- Single keys can conflict with other software. Off and the context menu remain available.
- A result card inside a very small frame is constrained by that frame's viewport. The toolbar popup provides the latest session result as a fallback.
