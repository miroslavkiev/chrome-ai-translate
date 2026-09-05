# Release checks and translation sample

## Version 1.3.3 Store preparation

This is a preparation build, not a Store-approved release. It adds the public repository as the extension homepage, links to support/privacy, uses the approved purple icon in Settings and the popup, and moves the key/data notice above the key field. Google eligibility and AI accuracy limits are stated in Help and the project guides. The explicit background network permission is limited to the Gemini endpoint; declarative web and local-file content access remains.

The Store folder contains draft listing text, six correctly sized PNG assets, permission/privacy notes, a Germany/EU review, and an unfilled legal-notice template. Screenshots use the actual UI with safe example content in a temporary browser. The template and all Store artwork/scripts stay outside the 20-file extension package. No personal address or real key was added. Chrome does not support manifest SVG icons, so the PNG toolbar artwork remains.

The 54 Node tests, source checks, build, package checks and all three browser checks passed on Chrome 151. The context-menu test now selects its own active temporary tab because narrowed permissions no longer expose arbitrary tab URLs. It still checks successful and oversized context-menu delivery. Independent code and visual reviews found no material issue in these changes. The setup screenshot was adjusted by normal page scrolling to keep the full header and API-key row visible.

Submission remains blocked on the provider audience/service terms, final key-storage and consent flow, accurate Limited Use certification and approved publisher/legal-contact details. Automatic encrypted storage without an unlock password has a separate successful fake-data restart proof; it is only a proposed option, not implemented in this build. Browser-version-update persistence was not tested. Reload of the user's installed extension remains manual because browser security blocks those controls.

## Version 1.3.2 larger icon

The approved option 5 artwork uses the full icon area in both directions, as requested. The outer margin was removed before exporting the existing 16, 32, 48, and 128 pixel PNGs. The purple colors, white symbols, and rounded-corner style remain. In every size, visible artwork reaches all four canvas edges, with transparent or partly transparent pixels at the rounded corners. All four exports were checked at their declared size and in light/dark previews.

All 54 Node tests, source checks, production build, and the exact 20-file package checks passed. No translation behavior, settings, permissions, or other runtime code changed. Reloading the installed extension still needs the user action described below because browser security policy blocks automated access to those controls.

## Version 1.3.1 icon and description

The approved purple option 5 is exported as 16, 32, 48, and 128 pixel PNGs. Both the extension-list and toolbar manifest entries use these icons. The short description explains selecting text and pressing Control. About, README, and the packaged install guide state that manual testing covered Mac only; automated checks on other platforms do not change that claim.

All 54 Node tests, source checks, production build, and the exact 20-file package checks passed locally on macOS. Package verification also checks the icon maps, PNG signatures, and declared pixel sizes. Built-folder and source-root browser checks passed on Chrome 151.0.7922.34, using temporary profiles and fake provider replies. Dependency audit found zero vulnerabilities. Independent code and UX reviews found no material issues. No real API request was made.

The installed extension still needs the user's Reload action at chrome://extensions after active translations finish. Browser security policy prevents automated access to those controls. Refresh web pages after reloading. Store submission is still pending.

## Version 1.3.0 setup and language choices

Approved option C adds a checklist to existing Settings, a no-key welcome, a local key guide and About page. The product includes no demo key. The shared catalog now offers 110 documented Gemini language choices. New users choose a language and start with a dated Gemini 3.5 Flash-Lite recommendation. Other listed models remain selectable. Missing models require an explicit replacement; no automatic fallback was added. Existing profiles keep their choices and earlier defaults.

All 54 Node tests passed on Node 25.2.1. The production build and exact package checks passed. npm audit reported zero vulnerabilities. Temporary Chrome 151.0.7922.34 passed built-folder and source-root content checks, plus the extension-page checks. New checks cover no-key welcome, visible Settings-opening failure, interrupted setup after key save, 110 language choices, explicit model replacement, guide/About links, and 320px light/dark layouts. Independent code and UX reviews found no remaining material issues after correction.

The guide's two screenshots come from the real built Settings page before any test key was entered. They show empty fields and contain no account, project or key details; PNG text and EXIF metadata are absent. To refresh them, set BROWSER_EVIDENCE_DIR when running the extension-page check and review setup-key.png and setup-language.png before copying them into the package. They are extension screenshots, not recreations of Google AI Studio.

No real Google translation or paid API request was made. Model recommendation is based on current official documentation, not a new translation-quality benchmark. Chrome's browser security policy blocked access to the installed extension manager; the user must finish active translations, reload AI Translator at chrome://extensions, and refresh their web pages. Store submission has not been made. Provider audience/service-tier terms, Store privacy requirements and reviewer access still need to be settled before publication.

## Version 1.2.1 source-folder fix

The user confirmed Chrome loaded the repository root and reported "Cannot use import statement outside a module" at content.js:1. That source file uses imports, but Chrome loads content scripts as classic scripts. Settings could still work because its script uses modules. The same failure was reproduced in a temporary profile; dist and the extracted ZIP worked.

The source manifest now loads dist/content.js. Webpack adjusts the packaged manifest to content.js. The existing install folder, extension identity, and saved settings can stay in place. Package verification checks both content entries parse as classic scripts and the packaged entry exists in the ZIP. Browser checks now include source-root loading and context-menu delivery. U01/U02 behavior, provider settings, and permissions stay unchanged.

The new source-root check exposed a test startup race on Chrome 140: Playwright exposes the worker before its module imports and Chrome bindings finish. The test now requires a successful getRuntimeState reply from a trusted popup before writing fake setup data. The wait is bounded and runtime errors still fail the check.

## Version 1.2.0 scope

The 2026-09-05 audit follow-up fixes B01-B11 and implements U03-U05. U01 and U02 were excluded by user choice. Outside clicks still close all cards, cancellation can replace the latest session result, and Retry or a language change still clears previous output. No redesign, history, extra provider, or default-model change is included.

| Audit work | Delivered check |
|---|---|
| B01: HTTP request IDs | Web Crypto fallback; ordinary non-localhost HTTP browser flow |
| B02-B04: settings reads, stale tabs, migration | Failed reads make zero writes; changed fields only; conflict/reload path; delayed migration and startup changes |
| B05: known rejected credentials | Rejection persists across cache reads/reconstruction; replacement and delayed failures keep the correct key state |
| B06: keyboard access | Escape from page focus; next Tab enters a card; modal stays open; popup long text scrolls by keyboard |
| B07-B09: selections and host-page layers | Oversized selections show errors without requests; nested open-shadow input/password checks; modal/fullscreen pointer and keyboard controls |
| B10-B11: provider output and language | Output-limit/block guidance; thought parts filtered; validated language on card and all six popup results |
| U03-U05: use and recovery | Settings action for key/model failures; manual timed Retry; Copy and fallback; popup language/time; saved/checked/rejected setup states |
| Shared code and architecture | Shared source validation, key labels, errors, Copy, UUIDs, popup/settings CSS; one latest-result schema; documented cache and Off compatibility |
| Lifecycle hardening | Duplicate/concurrent limits, rate history, timeout, cancellation, shared catalog waiters, storage failure, exactly one terminal response; actual browser worker stop/start preserves rate history and resets stale active count |
| Delivery and documentation | Matched 1.2.0 versions; verified ZIP includes installer/privacy/license; minimum Node and browser checks; dated provider assumptions |

Independent review found and fixed additional races: startup changes lost between reads, a stale rejected-key snapshot, model 404 readiness, failed refresh restoring an unavailable model, and open Settings retaining stale catalog state after another tab recovered. The final checks use the real built extension with fake replies, not just helper functions.

## Repeatable release gate

1. Install from the lockfile with `npm ci`.
2. Run `npm run ci`. This checks repository text and syntax, runs Node tests, builds, packages, and verifies exact archive contents, source freshness, CRC, checksum, and matching versions.
3. Install the test browser with `npx playwright install chromium`, then run `npm run test:browser`. This tests the built folder and source-root content script. Use `CHROME_PATH` to repeat with a specific Chrome for Testing executable. Both scripts use new temporary profiles and fake provider replies. They must never use a personal API key.
4. Run `npm audit --audit-level=high`. Review any advisory against its actual runtime/build use.
5. Check light/dark layouts, keyboard focus, long text, Copy failure, and recovery text. Optional `BROWSER_EVIDENCE_DIR` saves popup/settings screenshots in an existing directory.
6. Finish active translations before reloading the installed extension. Keep the unpacked folder path, reload through Chrome, and refresh a test page. Verify version, saved settings, model/setup state, and active count. Do not uninstall or restart the whole browser to update.
7. Commit and verify remote main matches the reviewed commit. Check CI on that commit before calling the release fully validated.

CI runs the build/test/package flow on Linux, macOS, and Windows with Node 22 and on Linux with minimum Node 20.19.0. Linux also runs current Chromium and pinned Chrome 140.0.7339.80 browser checks. Keep the pinned minimum until the declared support floor changes deliberately.

## Local evidence and limits

For version 1.2.1, all 48 Node tests and package checks passed on macOS. Chrome for Testing 152.0.7977.82 passed the built-folder and source-root content checks, including Ctrl and context-menu delivery, plus the extension-page checks. These used temporary profiles and fake provider replies. The installed Chrome app is 152.0.7977.77; its live extension still needs the user's Reload action.

On 2026-09-05, the Node tests and build/package checks passed on Node 25.2.1 and minimum Node 20.19.0 on macOS. Browser checks passed on Chrome for Testing 151.0.7922.34 with fake replies, including file access on/off and an actual service-worker stop/start. No real translation, billing, revoked-key, or quota call was made. Re-run the final release gate after any source change.

The user confirmed the failing installed extension loads this repository's root, correcting an earlier assumption that it loaded dist. The previous browser checks covered dist and missed this source-root failure. Automated access to the installed popup was blocked by the browser tool's URL policy. The installed extension was not reloaded through another route, and its active count and loaded version were not verified. After translations finish, the user must choose Reload for AI Translator at chrome://extensions and refresh the pages where it is needed.

Chrome 120.0.6099.109 crashed before opening a page on this Mac, including a plain launch without the extension. Its separate Linux CI run started and proved a real startup failure: Chrome 120 cannot restrict local extension storage. The required local.setAccessLevel support arrived in [Chrome 140](https://chromium.googlesource.com/chromium/src.git/+/a8f1f337c692360aaec9470a0a91f965011d37a3%5E%21/). The manifest and install guide now require Chrome 140; the privacy guard stays intact. This is a corrected support claim, not a relaxed security check.

CI also exposed a Windows line-ending assumption in the Settings test loader and a fixed 100 ms wait in the browser test. The loader now accepts CRLF. Browser tests wait for a fresh request and a terminal card state, and failure diagnostics show safe runtime/API status without keys or selected text. A 400 ms fake-response probe passed locally. Windows, macOS, Linux minimum Node, and current Chromium passed after the test fixes.

These checks do not prove real provider compatibility or translation quality, screen-reader pronunciation, large real-site memory use, or every browser/OS keyboard conflict. A page can remove the injected UI. Closed-shadow editors and browser-restricted pages remain unsupported; small frames constrain cards. Direct Chrome storage has a small last-writer-wins window for simultaneous writes to the same field between a final read and write. Known conflicts and unrelated changes are protected without adding a separate state service.

## Fixed translation-quality sample

Run this only when deliberately checking a model or prompt with a real API key. Each action sends the sample to Google and may incur cost. The hardening release did not run this sample and makes no quality score claim.

Use the same six source cases for each target: Ukrainian, English, Spanish, French, German, and Russian. Where source and target match, preserve meaning and avoid invented changes. Use the same saved model and prompt for every comparison; do not silently fall back to another model.

| Case | Source |
|---|---|
| Names and identifiers | `Olena Kovalenko meets Alex Morgan at 09:30. Keep ID AB-204 and filename report_v2.csv unchanged.` |
| Numbers and units | `The package weighs 2.75 kg. Order 3 boxes, not 30. The total is EUR 125.40, including a 5% discount.` |
| Meaning and negation | `Do not delete the backup. The import failed, but the original file is safe. Retry only after the connection returns.` |
| Mixed language | `The status is "готово". Please confirm: "Vielen Dank, the file arrived."` |
| Formatting | Three lines: `Tasks:` then `1. Review the file.` then `2. Send it after approval.` |
| Long input | Repeat `The original file stays safe. Review each translated section before sharing it. ` 100 times. Confirm the full passage is translated, not silently cut short. |

Record the date, extension commit, exact model ID, request settings, target language, source case, finish/error category, and reviewer result. A fluent reviewer should mark meaning, negation, names/IDs, numbers/units, formatting, and completeness as pass/fail with one short note. Keep personal or client text out of test records. A transport success or helper test is not a quality score.

Before changing the default model or prompt, require no material meaning, identifier, number, or truncation regression against the current default on this fixed sample. If the provider rejects a case, record the safe error instead of weakening its restrictions or counting it as a correct translation. Review alias/thinking behavior against current official provider documentation before changing request parameters.
