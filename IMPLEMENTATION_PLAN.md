# Implementation plan

## Shared contract

1. Add one shared module for settings defaults, languages, supported trigger keys, message errors, Unicode limits, and validation.
2. Keep page text and credentials out of logs and persistent history.
3. Use the request and storage contracts in DESIGN.md across all entry points.

## Parallel implementation threads

### Runtime service worker

- Replace the SDK client with native Gemini REST calls.
- Add trusted storage setup and synced-key migration.
- Add model discovery and cache handling.
- Add Port-bound translation, timeout, cancellation, rate limits, concurrency limits, structured failures, and context-menu frame routing.

Owned files: background.js and request-policy.js.

### Content interaction

- Add the clean key-release state machine.
- Add selection capture for documents, editors, and frames.
- Add document-bound Port requests.
- Add the closed-shadow result card with manual retry, temporary target language, errors, accessibility, and lifecycle limits.

Owned files: content.js and trigger.js.

### Extension UI

- Build the approved settings page.
- Add API-key controls, dynamic model discovery, target language, key capture, privacy disclosure, and save states.
- Build the toolbar popup states and latest session result.

Owned files: settings.html, settings.js, popup.html, and popup.js.

## Integration and delivery

- Update manifest permissions, frames, version, and entry points.
- Simplify dependencies and upgrade the build toolchain.
- Split build, watch, and package commands.
- Add Node tests, archive validation, CI, privacy documentation, license, and accurate README instructions.

## QA cycles

1. Each implementation thread receives a reviewer that did not implement that thread.
2. Findings are fixed and the focused checks run again.
3. All reviewers perform one joint pass across runtime, security, UX, accessibility, build, package, and documentation.
4. Final validation runs syntax checks, unit tests, build, package inspection, dependency audit, and a browser-based UI check.
