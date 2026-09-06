# Production hardening audit, September 6, 2026

## Scope and decision

Initial baseline: `78d49b288407828664ed2a17fbf965dc1abb7e28`, version 1.5.0. This report covers extension code, credential and consent boundaries, user flows, browser compatibility, packaging, documentation, and Chrome Web Store requirements.

**Final review consensus: robust enough for production release within the tested engineering scope.** All accepted material findings are closed after six correction and review loops. Local release checks passed. The initial decision was not ready; the decision changed only after fixes and independent verification. Store submission still has separate publisher and dashboard prerequisites. No Store approval is implied.

## Review team and method

| Reviewer | Model and effort | Scope |
| --- | --- | --- |
| James | Sol Max | Credential storage, message boundaries and provider data |
| Ohm | Sol Ultra | Worker lifecycle, requests, state and failures |
| Hooke | Terra XHigh | Selection, Settings, popup, accessibility and recovery |
| Poincare | Astra High | Manifest, privacy, Store policies and documentation |
| Mencius | Astra High | Independent combined-plan and code QA review |
| Aquinas | Astra High | Independent user-flow and recovery QA |
| Orchestrator | Parent agent | Reproduction, finding decisions, integration and release checks |

Reviewers read the current code independently. The orchestrator checked findings against source, synthetic reproductions and official documents. Severity reflects the confirmed impact and required conditions. Consent withdrawal is high priority, rather than a universal critical failure: the defect requires failed persistence and a restart.

All automated provider tests use fake keys and replies in disposable profiles. No real Gemini generation request is part of this audit. GitHub CI is reserved for the final accepted engineering build. A GitHub run already active for the baseline commit was observed; this audit did not start it.

## Accepted findings and fix plan

Locations below refer to the initial baseline. The completed implementation and final checks are recorded later in this report.

| ID | Priority | Confirmed problem | Agreed direction |
| --- | --- | --- | --- |
| R1 | P1 | Failed agreement removal leaves a valid old agreement. Worker restart loses the memory-only denial and enables access again. `background.js`, consent and startup paths. | Persist a trusted session denial before credential waits, persist local withdrawal independently, and only reopen after a complete new acceptance. Test failed writes, restarts and competing intents. |
| R2 | P1 | Legacy plaintext keys in sync storage remain readable by content-script contexts during failed or late migration. A normal page script cannot read this storage directly. `background.js`, `content.js`. | Restrict sync storage to trusted extension contexts. Give content scripts only validated language and shortcut preferences through a narrow message route. |
| R3 | P1 | An invalid saved model ID silently becomes the legacy default, allowing a request to a model the user did not choose. `background.js`, `getPreferences()`. | Preserve invalid state, block requests before model discovery, and require an explicit valid choice. |
| R4 | P1 | A deadline can turn a completed translation into a timeout during bookkeeping. Stalled credential or storage waits can also delay terminal feedback beyond the deadline. `background.js`, translation lifecycle. | Bound request waiting, preserve a validated completed result, and make bookkeeping unable to replace or indefinitely delay terminal feedback. Keep cancellation, consent and reservation guards. |
| R5 | P2 | The provider reader parses the whole body before output limits. Model pagination retains raw unused fields across pages. `background.js`, `request-policy.js`. | Use one native byte-limited JSON reader and retain only normalized model fields between pages. Preserve HTTP status handling and count all raw model entries. |
| R6 | P2 | An aborted response body can be reported as invalid JSON instead of timeout or cancellation. `background.js`, `fetchJson()`. | Check the abort state before classifying parse failures. Test stalled bodies and withdrawal during reads. |
| R7 | P2 | Permission/configuration failures can offer Retry even when Google says the configuration must change. `request-policy.js`, error presentation. | Give safe Settings guidance for these errors without mislabeling a valid key as invalid or automatically retrying requests. |
| R8 | P2 | Norwegian Chrome reports native locale `nb`, but the `no` catalog is ignored, leaving the interface in English. | Use the native `nb` catalog code. Keep the existing translation-target code `no`. A temporary renamed build passed the complete flow in Chrome 140 and 151. |
| R9 | P3 | A context-menu message returning `accepted: false` gives no fallback feedback. `background.js`. | Record a safe selection failure for the popup without sending changed text. |
| R10 | P3 | DESIGN still describes a plaintext local key and the old sync-to-local migration. | Describe the actual encrypted IndexedDB record and verified cleanup of legacy local and sync copies. |
| T1 | P2, tests | The native locale check expects Australian English to remain `en_AU`, while macOS Chrome resolves it to `en_GB`. Its raw Chrome 140 launch also lacks the test-keychain flag. | Test Chrome's actual alias behavior and use the same mock-keychain flag as the other isolated browser checks. Keep assertions against real catalogs. |

The independent plan review also requires Settings tabs to observe the new session denial state, preserves the total model-count and pagination limits, and adds boundary, split-UTF-8, stalled-body and HTTP error regressions.

## Findings not accepted as release defects

| Proposal | Decision and evidence |
| --- | --- |
| Lower or re-explain the Chrome 140 minimum because `setAccessLevel` existed in Chrome 102 | Rejected and withdrawn by the reviewer. Earlier support was for session storage. Chromium 139 rejects local access restrictions; Chrome 140 added local and sync support. Keep the current protection and minimum. |
| Force model discovery whenever the translation catalog is over 24 hours old | Rejected as a defect. README explicitly documents the current latency choice: translation may use older checked data, while Settings refreshes it. Known model rejection remains blocked and manual refresh is available. |
| Add a live local-file access status in Settings | Useful enhancement, not a confirmed blocking defect. Existing instructions explain Chrome's file toggle, and real browser tests cover access on and off. |
| Change all hover rules for touch | No failing touch interaction was reproduced. Keep as an optional refinement, not a production blocker. |
| Replace the approved icon with padded artwork | Nonblocking presentation guidance, not a demonstrated Store violation. The required PNG sizes are present and checked. |

## Baseline evidence

- Source checks passed for 111 files; all 92 Node tests passed.
- Build and ZIP checks passed: 76 files, 55 catalogs, 326 messages per catalog.
- Dependency audit returned zero known vulnerabilities.
- Chrome 151.0.7922.34 passed the full existing suite, including source and built installs, consent, conflicting Settings tabs, frames, file access, worker restart, full browser restart and native encryption.
- Chrome 140.0.7339.80 passed all existing non-locale browser flows. The original locale launcher failed before opening a debugging port. Adding `--use-mock-keychain` in a temporary test copy made the seven-locale flow pass.
- All 55 requested interface locales were exercised on Chrome 151. There were 53 initial passes, the Australian English test assumption, and the Norwegian product defect. A temporary `nb` catalog passed the full Norwegian flow in both Chrome 140 and 151.

These checks demonstrate the stated cases. They do not establish translation quality across every model or language, native-speaker review of all copy, or Store acceptance.

## Chrome and provider requirements

The engineering review uses the following official sources. Broad page access supports the disclosed selection shortcut across pages and frames; it is not evidence of history collection. No additional permission, remote executable code, analytics service or backend is proposed.

- [Service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle): globals can be lost on shutdown, and requests must handle termination.
- [Chrome storage](https://developer.chrome.com/docs/extensions/reference/api/storage) and [messaging security](https://developer.chrome.com/docs/extensions/develop/concepts/messaging#security-considerations): protect sensitive storage from content-script contexts and validate messages.
- [Chrome 140 local/sync access implementation](https://chromium.googlesource.com/chromium/src.git/+/a8f1f337c692360aaec9470a0a91f965011d37a3%5E%21/): verifies the chosen browser floor.
- [Native localization](https://developer.chrome.com/docs/extensions/reference/api/i18n): packaged catalogs and native fallback. The Store list uses `no`; observed native browsers require `nb` for Norwegian.
- [Code readability](https://developer.chrome.com/docs/webstore/program-policies/code-readability): ordinary production minification is allowed. The package uses bundled local code.
- [Disclosure requirements](https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements), [Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use), and [privacy dashboard](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy): disclosures, consent and declared data use must match actual behavior.
- [Gemini troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting), [API errors](https://ai.google.dev/gemini-api/docs/api-errors), and [API key guidance](https://ai.google.dev/gemini-api/docs/api-key): configuration errors need configuration changes, and reviewer keys must meet current Google restrictions.

## Separate Store submission gates

Engineering readiness does not close these existing publisher tasks:

1. Complete actual dashboard data categories, permission explanations, privacy URL and Limited Use certification against the final package.
2. Verify publisher account details, two-step verification, accurate trader status and chosen distribution regions. Account state was not inspected.
3. Resolve reviewer access privately if a reviewer-owned billing-enabled key is insufficient. Do not add working keys to code, images or public instructions.
4. Confirm the offering meets Google's adult professional/business audience and region conditions, with active project billing and optional dataset contribution disabled. The extension discloses but does not independently verify these account settings.
5. Resolve applicable publisher/privacy contact and legal information. The existing decision not to supply a public postal address is preserved. No personal information is inferred or published.
6. Complete applicable legal and AI transparency assessments described in `store/LEGAL_REVIEW.md`. Their exact duties depend on publisher facts that code review cannot establish.

The existing optional donation link remains an unconfirmed Store-review risk. No finding establishes a blanket ban or authorizes changing the publisher's chosen link. See the existing [Store checklist](store/REVIEW_CHECKLIST.md) and [legal review](store/LEGAL_REVIEW.md) for scoped sources and unresolved facts.

## Implementation and final review

Correction loop 1 implemented the agreed storage, consent, model and user-flow changes. The shared response reader now limits each decoded HTTP body to 2 MiB before JSON parsing.

Correction loop 2 found two additional issues during independent QA:

- Racing every stream chunk against the same abort promise retained a handler for each chunk. One native reader-cancellation listener now handles aborts. The regression sends 100,002 one-byte chunks and checks memory while the read is still pending. Retained heap fell from about 36.8 MiB to 3.2 MiB.
- The browser locale test could resolve its worker event but still wait forever for a debugger command or cleanup. One overall discovery deadline now covers page creation, session attachment, registration wake-up and enablement. Cleanup is nonblocking, including resources that arrive after the deadline. A focused test and independent late-resource probes pass.

Mencius approved those two corrected slices with no material findings. Aquinas found three test expectations that confused a mocked page language with the worker's saved language. The corrected tests inspect the pending selector, then verify the authoritative completed language. Both UX reviewers approved the correction.

Correction loop 3 resolved further runtime findings: ordered marker writes prevent an older acceptance clear from erasing a newer denial; catalog persistence checks cancellation after each awaited read; separate best-effort active-count writes cannot hold the request gate. A new request succeeds while an earlier count write is stalled, and the displayed count catches up.

Correction loop 4 proved that rejected marker writes and stalled marker writes are different failure modes. Local withdrawal now proceeds independently of session marker and credential waits. Each storage area keeps its own write order. New tests cover a stalled first marker, an older acceptance clear that has applied but not returned, failed fallback writes and worker/session restart. Valid completed translations also have a regression showing they are delivered before status bookkeeping can stall.

Correction loop 5 separates withdrawal acknowledgement from the full Settings read. A confirmed local revocation returns immediately, even when an older credential operation still waits. Settings handles this narrow acknowledgement separately so it cannot clear key/revision fields or turn successful withdrawal into a false timeout. Full state is refreshed separately.

Correction loop 6 found an obsolete full-state read whose rejection could still lock Settings after newer withdrawal succeeded. The shared read boundary now ignores obsolete failures as well as obsolete successes. Current read failures still follow the normal error path.

## Final reviewer decisions

| Reviewer | Final scope decision |
| --- | --- |
| James, Sol Max | Security ready. Confirmed protected storage, narrow messages, independent withdrawal and the final acknowledgement change. |
| Ohm, Sol Ultra | Runtime ready. Confirmed deadlines, durable rate limits, ordered consent writes, late-write guards, counter isolation and the final acknowledgement change. |
| Hooke, Terra XHigh | Content and Settings ready. All 44 Settings tests passed, including confirmed withdrawal, stale replies, drafts and current failure recovery. |
| Poincare, Astra High | Policy/document scope ready with the listed Store gates. The required local browser and locale checks subsequently passed. |
| Mencius, Astra High | Final code QA approved. No material findings remained for background object `cb5cc3e` and Settings object `dff1a89`. |
| Aquinas, Astra High | Final UX QA approved. The stale rejection reproduction and all 44 Settings tests passed. |
| Orchestrator | Accepted the final combined release after the checks below. |

No reviewer reports an unresolved material engineering finding. This is a tested release decision, not a promise that all possible defects or external policy questions have been eliminated.

## Final local verification

- All 144 Node tests passed on Node 25.2.1 and minimum Node 20.19.0.
- Source checks passed for 113 files, including syntax, JSON and forbidden-character checks. Whitespace checks passed.
- The final source and built extension passed the complete browser suite on macOS with Chrome 151.0.7922.34 and Chrome 140.0.7339.80. This includes Settings/consent, conflicting tabs, narrow layouts, frames, file access on/off, worker restart, full browser restart and native encrypted storage.
- The 55-value native locale sweep passed on Chrome 151. On macOS, Australian English resolves to the British catalog and generic English to US English; Norwegian uses `nb`. The final build also passed nine locale/fallback cases on both browser versions. Later fixes changed state handling, not catalog text or locale selection.
- Package verification passed for the exact 76-file archive: 55 catalogs with 326 messages each, matched version 1.5.1, fresh source, CRC and deterministic checksum.
- Dependency audit reported zero known vulnerabilities. Gitleaks 8.30.1 found no secrets in the current source snapshot and release archive, including nested decoding. No finding suppressions were used.
- No new production dependency or Chrome permission was added. Existing native browser APIs and shared project helpers cover the changes.
- Automated tests used only disposable browser profiles, fake keys and fake provider replies. No real paid Gemini request was made.

Release archive: `dist/chrome-ai-translate.zip`.

SHA-256: `c0d52e24efe92e4db2d048cabde55fd848d773192307b03bcbd532383112f0f7`.

## Final delivery gate

GitHub CI was deliberately not run during the correction loops. It runs only after this release decision, on the reviewed commit pushed to `main`. Its result is attached to that exact commit in [GitHub Actions](https://github.com/miroslavkiev/chrome-ai-translate/actions/workflows/ci.yml); the release handoff records the final run link and outcome. This preserves one final CI stage rather than starting CI for each local correction.

The first final CI run, [34037478698](https://github.com/miroslavkiev/chrome-ai-translate/actions/runs/34037478698), passed all Node/build checks and the Linux content, extension-page and encrypted-storage flows. Its locale check found that Linux selects `en_AU`, while the macOS test expected `en_GB`. The test had applied the macOS alias to every platform. That expectation is now limited to macOS; the extension catalogs and release ZIP are unchanged. The corrected test passed source/package checks and the Australian English flow on macOS Chrome 140 and 151. The independent Astra code reviewer approved it before the next final CI attempt.

The branch also contains the handed-off locale worker-discovery commit `ae9a939`. Its behavior was reviewed and its timeout/cleanup handling was corrected as part of this audit. No unrelated work is included.

The installed extension was not reloaded. Browser security policy blocks automated access to extension controls, and no alternate route was used. Finish active translations, choose Reload for AI Translator at chrome://extensions, and refresh open web pages. Keep the same installation folder and saved profile.
