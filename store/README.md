# Chrome Web Store release pack

Status: **prepared for review, not ready to submit**. Checked September 6, 2026.

The repository is already public: [source and project guide](https://github.com/miroslavkiev/chrome-ai-translate). No Chrome Web Store listing has been submitted or published by this work.

## Files and fields

| Artifact | Use |
| --- | --- |
| [LISTING.md](LISTING.md) | English description, category, homepage, support and privacy URLs, and reviewer instructions. |
| [assets](assets/) | Three screenshots, required small promo tile, optional marquee, and separate Store icon. |
| [REVIEW_CHECKLIST.md](REVIEW_CHECKLIST.md) | Current code and policy review, data categories, and open release checks. |
| [LEGAL_REVIEW.md](LEGAL_REVIEW.md) | Germany/EU review with official sources and missing facts. |
| [KEY_STORAGE_OPTIONS.md](KEY_STORAGE_OPTIONS.md) | Selected option D, automatic encryption, the data agreement and the limits of browser-profile protection. |
| [LEGAL_NOTICE_TEMPLATE.md](LEGAL_NOTICE_TEMPLATE.md) | Preparation only. Never use the placeholder document as a legal notice. |
| [PRIVACY.md](../PRIVACY.md) | Current technical data handling. Legal contact and release items remain open. |
| [extension ZIP](../dist/chrome-ai-translate.zip) | Current build only. Upload after the open release checks are closed. |

## Remaining publication checks and recorded risks

1. Google's use conditions are shown before the first API request and in the listing, without a separate eligibility checkbox. Choose supported Store distribution countries and ensure the actual offering matches the provider's audience rules. The extension does not collect identity documents or prove each user's occupation or billing.
2. The selected encrypted storage and data-agreement flow passed the final local checks, including a real Chrome 143 to 151 profile upgrade. Review [the evidence and limits](../RELEASE_CHECKS.md) when completing the Store disclosures. Passing tests do not establish Store approval.
3. The publisher explicitly chose not to provide a public postal address. No personal information or substitute address is invented. This leaves a known publication risk if an address is required; it does not block the approved local implementation or reopen the same decision. Applicable privacy contact information remains unresolved. The legal-notice template stays unused.
4. Resolve the third-party data-use conditions, then add an accurate Limited Use statement and complete Chrome's privacy certifications.
5. Verify the developer account, two-step verification, contact email and accurate trader/non-trader declaration in the Store dashboard. No account declaration has been made here.

The refreshed artwork and copy match the final setup flow. Local work proceeds with the recorded address decision. Neither that decision nor passing code checks establish legal compliance or Google approval.

## Build and refresh

Run `npm ci`, then `npm run ci` to create and verify the ZIP. Run `npm run store:assets` after building to recreate the Store PNG files in a temporary browser profile. This uses offline example content and fake replies, without any real API key or provider request. It needs the Playwright Chromium browser installed, as do the existing browser checks.

After any setup change, regenerate the screenshots and recheck all listing claims. Include only the extension ZIP in the Store upload. This folder, templates, capture scripts and the source artwork must stay outside the extension package.

## Icon format

Chrome does not support SVG in extension manifest icons. Keep the approved purple PNG icons. The toolbar sizes retain the full-area artwork requested by the publisher. The separate `store-icon-128.png` follows the Store guide's recommended 96px artwork inside a transparent 128px canvas. This does not shrink the toolbar icons. [Chrome icon guide](https://developer.chrome.com/docs/extensions/develop/ui/configure-icons), [Store image guide](https://developer.chrome.com/docs/webstore/images).

The store assets use the existing approved artwork. The high-resolution source is retained for crisp exports. Small raster icons still have a fixed pixel limit; SVG would not remove that Chrome limitation.
