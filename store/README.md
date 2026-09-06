# Chrome Web Store release pack

Status: **prepared for review, not ready to submit**. Checked September 6, 2026.

The repository is already public: [source and project guide](https://github.com/miroslavkiev/chrome-ai-translate). No Chrome Web Store listing has been submitted or published by this work.

## Files and fields

| Artifact | Use |
| --- | --- |
| [Production audit](../PRODUCTION_AUDIT_2026-09-06.md) | Version 1.5.1 findings, corrections, reviewer decisions and separate submission gates. |
| [I18N.md](../I18N.md) | All 55 packaged interface locales, language defaults and the Chrome i18n guide review. |
| [LISTING.md](LISTING.md) | English description, category, homepage, support and privacy URLs, and reviewer instructions. |
| [assets](assets/) | Three screenshots, required small promo tile, optional marquee, and separate Store icon. |
| [REVIEW_CHECKLIST.md](REVIEW_CHECKLIST.md) | Current code and policy review, data categories, and open release checks. |
| [LEGAL_REVIEW.md](LEGAL_REVIEW.md) | Germany/EU review with official sources and missing facts. |
| [KEY_STORAGE_OPTIONS.md](KEY_STORAGE_OPTIONS.md) | Selected option D, automatic encryption, the data agreement and the limits of browser-profile protection. |
| [LEGAL_NOTICE_TEMPLATE.md](LEGAL_NOTICE_TEMPLATE.md) | Preparation only. Never use the placeholder document as a legal notice. |
| [PRIVACY.md](../PRIVACY.md) | Current technical data handling. Legal contact and release items remain open. |
| [extension ZIP](../dist/chrome-ai-translate.zip) | Current build only. Upload after the open release checks are closed. |

## Remaining publication checks and recorded risks

1. Google's use conditions are shown before the first API request and in the listing, without a separate eligibility checkbox. Choose supported Store distribution countries during submission and ensure the actual offering matches the provider's audience rules. The extension does not collect identity documents or prove each user's occupation or billing.
2. The selected encrypted storage and data-agreement flow passed the final local checks, including a real Chrome 143 to 151 profile upgrade. The user also reported successful manual tests with real translations on September 6, 2026; no model, operating system or test cases were specified. Review [the evidence and limits](../RELEASE_CHECKS.md) when completing the Store disclosures. Passing tests do not establish Store approval.
3. The publisher explicitly chose not to provide a public postal address. No personal information or substitute address is invented. This leaves a known publication risk if an address is required; it does not block the approved local implementation or reopen the same decision. Applicable privacy contact information remains unresolved. The legal-notice template stays unused.
4. The publisher now requires active billing in every country and no optional contribution of extension request logs or datasets to Google for product improvement or training. Unpaid projects are outside supported use. The privacy page includes the Limited Use commitment for this setup. Private project logging is separate. The extension does not verify Google project settings, and the final dashboard certification remains a submission step.
5. The user scheduled Store account and dashboard work for submission: verify the developer account, two-step verification, contact email, accurate trader/non-trader declaration, distribution regions and final privacy answers at that point. These are unfinished submission steps, not code blockers. No account declaration has been made here.

The refreshed artwork and copy match the final setup flow. Local work proceeds with the recorded address decision. Neither that decision nor passing code checks establish legal compliance or Google approval.

## Build and refresh

Run `npm ci`, then `npm run ci` to create and verify the ZIP. Run `npm run store:assets` after building to recreate the Store PNG files in a temporary browser profile. This uses offline example content and fake replies, without any real API key or provider request. It needs the Playwright Chromium browser installed, as do the existing browser checks.

After any setup change, regenerate the screenshots and recheck all listing claims. Include only the extension ZIP in the Store upload. This folder, templates, capture scripts and the source artwork must stay outside the extension package.

## Icon format

Chrome does not support SVG in extension manifest icons. Keep the approved purple PNG icons. The toolbar sizes retain the full-area artwork requested by the publisher. The separate `store-icon-128.png` follows the Store guide's recommended 96px artwork inside a transparent 128px canvas. This does not shrink the toolbar icons. [Chrome icon guide](https://developer.chrome.com/docs/extensions/develop/ui/configure-icons), [Store image guide](https://developer.chrome.com/docs/webstore/images).

The store assets use the existing approved artwork. The high-resolution source is retained for crisp exports. Small raster icons still have a fixed pixel limit; SVG would not remove that Chrome limitation.
