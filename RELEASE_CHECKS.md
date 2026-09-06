# Release checks and translation sample

## Version 1.5.0 interface languages and first setup

The interface now includes all 55 Chrome locales. Manifest text, Settings, popup, translation cards, Help, About, errors and accessibility labels use native Chrome messages with English fallback. The Chrome Concepts and usage guide review is recorded in [I18N.md](I18N.md). Catalog checks require complete message IDs, matching placeholders, safe numbered tags and valid manifest lengths. The 325 translated text messages plus one language metadata message are packaged for each locale. Translations are AI-assisted and have not all had native-speaker review. Setup screenshots and the Store long description remain in English.

New setup suggests the first supported language in Chrome's preferred-language list, then the raw Chrome interface language, then English. Users confirm or change it with Finish setup. Existing saved choices are preserved. A first successful key save opens the approved native dialog with **Refresh open pages** in bold. The same reminder is the first FAQ answer. The existing paid-service notice, agreement version 2, encrypted key storage, model choices and permissions remain unchanged.

The browser review caught a source-folder worker restart issue caused by a native JSON import. Source-folder and packaged installs now use the existing bundled background script. The source-folder browser flow checks worker and full-browser restart. An unsupported Urdu interface also exposed incorrect text direction on English fallback; catalog language metadata now keeps English left-to-right while Urdu remains available as a translation target. The right-click menu refreshes its language on browser startup.

On September 6, 2026, all 92 Node tests passed. Chrome 151.0.7922.34 passed both built-folder and source-folder content checks and full extension flows, including setup, data agreement, first-key reminder, saved language, conflicting tabs, worker restart and encrypted key/agreement survival after closing Chrome. Native encryption checks also passed with real Web Crypto and IndexedDB. These checks used disposable profiles and fake provider replies. No real Google request was made.

Native Chrome locale checks passed for English, German, Arabic, Japanese, Ukrainian, Simplified Chinese, Amharic, Kannada and Malayalam, plus an Urdu Chrome interface using English fallback. Each checked four pages, the full first-key flow, bold refresh dialog, narrow light/dark layouts, preserved target language and one successful translation request. The browser test also passed with an artificial 750 ms delay in content-settings initialization and still produced exactly one card and one request.

The final source checks, 92 tests, build and exact 76-file package checks passed. The ZIP contains all 55 catalogs with 326 messages each. Dependency audit reported zero vulnerabilities. Redacted working-tree and final ZIP scans found no credentials. Git history has one known false positive, the published 1.4.1 ZIP checksum; the previously audited stored-object/archive corpus also has no findings.

ZIP SHA-256: `2eccc56523e7e76478628e85eb2c5217509572c7d704f9062f61877c7866b5d4`.

The refreshed setup and Store images were checked for keys, account details and project names. All eight public screenshots and Store images contain no text or EXIF metadata. Independent code and UX reviews found no remaining material issue. The existing publisher address decision and dashboard submission steps remain recorded separately. Nothing was submitted to the Store. The installed extension still needs a manual Reload action, followed by refreshing open pages.

## Version 1.4.2 paid-service notice and FAQ

The publisher approved active API project billing in every country and disabled optional contribution of extension request logs or datasets to Google as required supported use. This replaces the earlier unpaid-project decision. Settings, Help, About, privacy and Store documents now agree on these requirements, possible Google charges, private logging versus sharing, and the lack of automatic billing or sharing checks. The public privacy page includes an affirmative Chrome Limited Use commitment for this setup. Store approval, applicable publisher information and submission declarations remain separate matters.

Help now includes ten plain-language FAQ answers with links to the relevant Chrome and Google rules. Settings and About link directly to the FAQ. Agreement version 2 pauses Google requests for older agreements until the user reviews the new notice and agrees again. The existing encrypted key, revision and preferences are preserved. No new checkbox, billing checker, permission, dependency or translation behavior was added.

On September 6, 2026, all 88 Node test entries, source checks, build and exact 20-file package checks passed. Chrome 151.0.7922.34 passed the extension-page flow with fake data in a disposable profile: FAQ navigation, 320px light/dark layouts, saved-key and agreement survival after closing Chrome, and renewal of an old agreement with zero provider calls before agreement. The runtime regression also checks an old agreement across worker restart, then successful model and translation requests after renewal. Independent code, policy, content and visual reviews found no material issue.

The guide and Store setup screenshots show the real empty-key UI with the complete new notice and FAQ link. PNG checks found only image chunks, with no text or EXIF metadata. Source/archive and Git-history scans found no real credentials. One scan match was verified to be exactly the published 1.4.1 ZIP checksum, a false positive. The previous stored-object/archive corpus also had no findings; external copies remain outside this evidence.

ZIP SHA-256: `a96187d1d7258d65e5417c878b56c23b089e5c3c96f7775dcd9aa728f4716ca8`.

The user's reported real translation tests remain accepted. No real Google request or paid API call was made in these checks. No public postal address was added and no address service was purchased. Store dashboard fields remain scheduled for submission; nothing was submitted. The local FAQ and asset previews are refreshed. Reloading the user's installed extension remains a manual action because browser security blocks those controls.

## Version 1.4.1 privacy clarification

This documentation update adds a factual statement about the developer's use of data and explains that optional Google log/dataset sharing can apply unpaid data-use terms even to billing-enabled projects. The publisher chose to keep unpaid projects supported, so the unresolved provider-side Limited Use question remains open. No unconditional Store certification, new eligibility check, agreement reset or translation change is included.

The user reported successful real translation tests on September 6, 2026. That report is accepted as user evidence without inventing a model, platform or test matrix. Developer account and item-dashboard fields are scheduled for the submission stage. Address-service pricing research is recorded in the legal review; no service was ordered and no address was added.

The source checks, Node suite, build and exact 20-file package verification passed. Comparing the ZIP with 1.4.0 confirms that only PRIVACY.md and the manifest version changed; runtime files are byte-identical, so no extra manual translation test was requested. Redacted source/archive scanning found no credentials.

ZIP SHA-256: `1136a67af932fa636b2ffaeeae93e0d46e266a13d833c373115069738d785c8e`.

## Version 1.4.0 encrypted key and data agreement

The selected option D stores the API key with native AES-256-GCM and a nonextractable CryptoKey in extension IndexedDB. It opens automatically in the same Chrome profile. No extra dependency or password unlock was added. Profile access remains a limit; this is not an OS keychain. Legacy keys are encrypted and decrypted for verification before their old local/sync copies are removed. Failed migration preserves the old value and blocks requests. Damaged storage requires an explicit removal action.

Settings now shows the final Google use notice and a separate **Agree and connect to Google** button. No model or translation request starts before that agreement, including with migrated keys or cached models. **Withdraw data agreement** stops new access and aborts active requests locally, while keeping the encrypted key and preferences. **Remove saved key** deletes its ciphertext, encryption key and catalog, retaining a non-secret revision to reject stale Settings writes. Neither action recalls data already sent to Google.

The Help screenshots and Store setup screenshot show the actual agreement flow before any key is entered. Their PNG files contain no text or EXIF metadata. No real key, Google account, project name or private address is included. The publisher chose not to provide a postal address; the existing legal review records that decision and its limits without inventing a replacement. The Store listing remains unsubmitted. The user scheduled account and dashboard fields for submission; they remain unfinished submission steps, not code blockers. Provider, privacy and legal checks remain open.

The source checks, Node suite, build and exact 20-file package checks passed on September 6, 2026. Chrome 151 passed the built-folder and source-root content checks. The extension-page check passed on Chrome 143.0.7499.4, fully closed Chrome, and reopened the same temporary profile with Chrome 151.0.7922.34. The API key, credential revision, agreement, language and model survived that real browser upgrade without another acceptance or password. This verifies those versions and the same extension ID/profile, not every future update.

Native Chrome 151 checks passed for AES-GCM/IndexedDB, full restart, failed transactions, verification before migration cleanup, corruption and removal. Runtime and Settings regressions cover requests before agreement, stale tabs, immediate cancellation during a stalled save, older acceptance replies, failed withdrawal persistence and its explicit retry. Independent code and UX review found no remaining material issue, including first-click Show, Finish setup, Withdraw and Remove behavior. All automated browser checks used fake data in disposable profiles, with no real Google request.

On September 6, 2026, the user reported that manual tests with real translations passed. This is user-reported evidence, separate from the automated checks above. The report did not specify the model, operating system or test cases, and it does not claim a translation-quality score.

Redacted secret scans found no credentials in the final source or extracted ZIP. The ZIP was version 1.4.0 with 20 root files, SHA-256 `68687440a1cc5bf1585635d2cfd0624439da2d5cbeed67f11156e50b3301aa3e`. Git history/reflog and the previously audited stored-object/archive corpus also had no findings. This is scoped evidence, not a guarantee about external copies. The installed extension still needs the user's manual Reload action because browser security blocks those controls.

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
3. Install the test browser with `npx playwright install chromium`, then run `npm run test:browser`. This tests the built folder, source-root content and extension pages, native encrypted storage, and real Chrome locale selection. Use `CHROME_PATH` to repeat with a specific Chrome for Testing executable. The extension-page check accepts `CHROME_UPGRADE_TO` to reopen its temporary profile with a newer Chrome executable. All checks use disposable profiles and fake data. They must never use a personal API key.
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
