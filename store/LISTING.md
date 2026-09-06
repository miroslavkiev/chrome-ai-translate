# Store listing draft

Do not submit yet. See [the open release items and recorded risks](README.md). The description states Google's use conditions without a separate eligibility checkbox. The build uses a separate data-agreement button and the selected encrypted key storage. Check all claims against the final tested package. The publisher chose not to provide a public postal address; no substitute or personal details are invented, and this decision is not legal clearance.

## Dashboard fields

| Field | Value |
| --- | --- |
| Name | AI Translator |
| Summary | Select text and tap Control to translate with Gemini, right on the page. No copying, pasting, or switching tabs. |
| Category | Productivity > Tools, confirmed from the dashboard choices on September 6, 2026. |
| Listing language | English is the default listing and fallback. The packaged interface supports all 55 Chrome locales. Translation targets are a separate list. |
| Homepage URL | https://github.com/miroslavkiev/chrome-ai-translate |
| Support URL | https://github.com/miroslavkiev/chrome-ai-translate/issues |
| Privacy policy URL | https://github.com/miroslavkiev/chrome-ai-translate/blob/main/PRIVACY.md |
| Official verified URL | Leave empty unless the publisher owns and has verified an eligible website. A public GitHub repository does not prove ownership of github.com. |
| Pricing | Extension is free. Users need a Gemini project with active billing; Google charges can apply. |
| Distribution | Choose only regions supported by the provider after resolving eligibility. Do not automatically select worldwide. |
| Publisher status | Confirmed personal hobby purpose supports a non-trader assessment. The publisher must make the accurate account declaration. |

The revised summary is below Chrome's 132-character limit. Chrome takes this field from the extension package. To use the new summary, update `extDescription` in `_locales/en/messages.json` and rebuild the ZIP before uploading it; the current package still has the previous wording. The final privacy URL must contain complete current information before submission. The legal-notice template is not a URL for the listing.

## Detailed description to paste after release review

Read across languages without the copy-paste loop. Select a word, sentence or paragraph, tap and release Control, and see a Gemini translation beside the original. AI Translator is a free, open-source Chrome extension that keeps you on the page.

🌍 Translate your way

• Choose from 110 translation language and script options. The interface supports 55 language and regional options.
• Change the language for one result without changing your default.
• Copy a translation or reopen the latest result from the toolbar.
• Choose another trigger key, turn it off, or use the right-click menu.
• Translate selected text in local HTML files when Chrome's file access is enabled.

⚡ Quick setup

1. Get your own Gemini API key from Google AI Studio: https://aistudio.google.com/apikey
2. Open Settings, read the data-sharing notice, and choose Agree and connect to Google.
3. Paste your key, choose your language and model, finish setup, and refresh open pages.

🔑 What you need

An internet connection and a Gemini project with active billing are required in every country. The extension is free; Google API charges and limits may apply. A paid Gemini app subscription does not replace API project billing.

Keep optional sharing of this extension's request logs and datasets with Google for training or product improvement off. The extension does not verify your billing or sharing settings.

For people aged 18 or older, for work or business use, in Google's supported regions. Use requires following the Google API Terms and Gemini API Additional Terms:
https://developers.google.com/terms
https://ai.google.dev/gemini-api/terms
Supported regions: https://ai.google.dev/gemini-api/docs/available-regions

🔒 Privacy and control

No Google API request starts before your data agreement. Requested translations send your selected text, target language and instructions directly to Google using your key. Model checks also contact Google.

No ads, analytics or translation history; only the latest result stays for the browser session. Your saved key is encrypted on this device, but someone with access to your Chrome profile may still recover it. You can withdraw agreement or remove the key in Settings. Only share text you may send to Google, and check important translations.

💻 Compatibility and help

Chrome 140 or later. Manually tested on Mac only. Chrome settings pages, the Chrome Web Store, the built-in PDF viewer and other protected pages do not allow translation.

Guide and source: https://github.com/miroslavkiev/chrome-ai-translate
Support: https://github.com/miroslavkiev/chrome-ai-translate/issues
Privacy details: https://github.com/miroslavkiev/chrome-ai-translate/blob/main/PRIVACY.md

AI Translator is an independent project, not a Google product.

## Reviewer instructions

Use a reviewer-owned Gemini key from a project with active billing and optional sharing of this extension's request data with Google disabled. The project must meet Google's terms. No shared demo credential is provided. Never paste a real key into public issues or listing text.

1. Install the final ZIP and open AI Translator from the toolbar.
2. Follow the welcome guide. Read the use conditions and data-sharing details. Choose Agree and connect to Google, add the eligible key, choose a listed text model and a target language, then finish setup.
3. Open or refresh an ordinary HTTPS page. Select a short non-sensitive sentence and tap/release Control. Confirm the nearby result card.
4. Try the right-click Translate Selected Text command, Copy, a different card language and the latest-result popup.
5. Open Settings. Confirm that Withdraw data agreement blocks model checks and translations while retaining the encrypted key. Agree again to resume. Confirm that Remove saved key returns the extension to setup. Restart Chrome to check that a saved encrypted key and agreement remain available without a password unlock.
6. For local HTML only, enable Allow access to file URLs. Chrome blocks its built-in PDF viewer and protected pages by design.

If reviewers cannot use their own provider access, resolve their testing needs through the dashboard's private reviewer channel. Do not invent a demo-key path or expose the publisher's key.

## Source guidance

The [listing guide](https://developer.chrome.com/docs/webstore/cws-dashboard-listing) describes the homepage and support fields. Use the [images guide](https://developer.chrome.com/docs/webstore/images) for final upload dimensions and the [privacy guide](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) for permission justifications. A video is not included in this image pack; confirm the actual dashboard's current optional-video field before submission.
