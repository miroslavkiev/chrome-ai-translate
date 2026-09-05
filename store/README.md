# Chrome Web Store release pack

Status: **prepared for review, not ready to submit**. Checked September 5, 2026.

The repository is already public: [source and project guide](https://github.com/miroslavkiev/chrome-ai-translate). No Chrome Web Store listing has been submitted or published by this work.

## Files and fields

| Artifact | Use |
| --- | --- |
| [LISTING.md](LISTING.md) | English description, category, homepage, support and privacy URLs, and reviewer instructions. |
| [assets](assets/) | Three screenshots, required small promo tile, optional marquee, and separate Store icon. |
| [REVIEW_CHECKLIST.md](REVIEW_CHECKLIST.md) | Current code and policy review, data categories, and open release checks. |
| [LEGAL_REVIEW.md](LEGAL_REVIEW.md) | Germany/EU review with official sources and missing facts. |
| [KEY_STORAGE_OPTIONS.md](KEY_STORAGE_OPTIONS.md) | Four key-storage choices, including automatic encryption and its tested limits. |
| [LEGAL_NOTICE_TEMPLATE.md](LEGAL_NOTICE_TEMPLATE.md) | Preparation only. Never use the placeholder document as a legal notice. |
| [PRIVACY.md](../PRIVACY.md) | Current technical data handling. Legal contact and release items remain open. |
| [extension ZIP](../dist/chrome-ai-translate.zip) | Current build only. Upload after the open release checks are closed. |

## What prevents submission

1. Resolve Google's professional/business, adult, region and paid-service rules for the intended audience. The publisher described this as a free personal hobby project; this does not override Google's terms.
2. Choose and implement the reviewed API-key storage and consent flow. Current local key storage is not encrypted. Model loading must also wait for the required disclosure and consent.
3. Supply approved publisher name, suitable postal address, public email and the applicable privacy information. Do not infer those details from Git records.
4. Resolve the third-party data-use conditions, then add an accurate Limited Use statement and complete Chrome's privacy certifications.
5. Verify the developer account, two-step verification, contact email and accurate trader/non-trader declaration in the Store dashboard. No account declaration has been made here.

The draft artwork and copy are reusable, but final screenshots must match the final setup flow. Google approval and a legal compliance finding cannot be guaranteed by automated code checks.

## Build and refresh

Run `npm ci`, then `npm run ci` to create and verify the ZIP. Run `npm run store:assets` after building to recreate the Store PNG files in a temporary browser profile. This uses offline example content and fake replies, without any real API key or provider request. It needs the Playwright Chromium browser installed, as do the existing browser checks.

After any setup change, regenerate the screenshots and recheck all listing claims. Include only the extension ZIP in the Store upload. This folder, templates, capture scripts and the source artwork must stay outside the extension package.

## Icon format

Chrome does not support SVG in extension manifest icons. Keep the approved purple PNG icons. The toolbar sizes retain the full-area artwork requested by the publisher. The separate `store-icon-128.png` follows the Store guide's recommended 96px artwork inside a transparent 128px canvas. This does not shrink the toolbar icons. [Chrome icon guide](https://developer.chrome.com/docs/extensions/develop/ui/configure-icons), [Store image guide](https://developer.chrome.com/docs/webstore/images).

The store assets use the existing approved artwork. The high-resolution source is retained for crisp exports. Small raster icons still have a fixed pixel limit; SVG would not remove that Chrome limitation.
