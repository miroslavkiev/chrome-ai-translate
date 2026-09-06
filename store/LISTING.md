# Store listing draft

Do not submit yet. See [the open release items and recorded risks](README.md). The description states Google's use conditions without a separate eligibility checkbox. The build uses a separate data-agreement button and the selected encrypted key storage. Check all claims against the final tested package. The publisher chose not to provide a public postal address; no substitute or personal details are invented, and this decision is not legal clearance.

## Dashboard fields

| Field | Value |
| --- | --- |
| Name | AI Translator |
| Summary | Super easy translation: select text and press Control. Translate into your chosen language with Gemini. |
| Category | Productivity, or the closest current language/translation subcategory offered by the dashboard. |
| Listing language | English. This is the interface language, not the set of translation target languages. |
| Homepage URL | https://github.com/miroslavkiev/chrome-ai-translate |
| Support URL | https://github.com/miroslavkiev/chrome-ai-translate/issues |
| Privacy policy URL | https://github.com/miroslavkiev/chrome-ai-translate/blob/main/PRIVACY.md |
| Official verified URL | Leave empty unless the publisher owns and has verified an eligible website. A public GitHub repository does not prove ownership of github.com. |
| Pricing | Extension is free. Users need a Gemini project with active billing; Google charges can apply. |
| Distribution | Choose only regions supported by the provider after resolving eligibility. Do not automatically select worldwide. |
| Publisher status | Confirmed personal hobby purpose supports a non-trader assessment. The publisher must make the accurate account declaration. |

The summary is taken from the manifest and is below Chrome's 132-character limit. The final privacy URL must contain complete current information before submission. The legal-notice template is not a URL for the listing.

## Detailed description to paste after release review

Super easy translation: just select text and press the Control key.

AI Translator uses Google Gemini to translate the words you choose. The result appears beside your selection, so you can keep reading without leaving the page.

WHAT YOU CAN DO

- Translate selected text with a tap and release of Control, or use the right-click menu.
- Choose your target language from 110 language and script choices based on Google's shared Gemini language list.
- Change the language in a result card without changing your default.
- Copy a translation and see your latest result in the toolbar popup.
- Choose another supported trigger key, or turn it off and use the right-click menu.
- Translate text from local HTML files when you enable Chrome's file access setting.

YOUR GEMINI KEY AND MODEL

You need your own Google Gemini API key from a project with active billing. The first-use guide explains how to get a key, choose a target language and select a model. We recommend the Flash-Lite family. At this release in September 2026, our choice is Gemini 3.5 Flash-Lite when it is available to your key. You may choose another listed model. Some models may not work; if one fails, choose an alternative or the recommended model.

Read the data-sharing details in Settings and choose Agree and connect to Google before adding your key. No Google API request is made before this agreement. The key is encrypted on this device and stays available across normal Chrome restarts without an unlock password. Someone with access to this browser profile may still recover it.

The extension is free, but Google API charges and limits can apply. It is not an offline translator.

CONDITIONS OF USE

This extension is for people aged 18 or older, for work or business use, in Google's supported countries and regions. It is not designed for children.

In every country, your API key must belong to a Google Cloud project with active billing. Unpaid projects are not supported. Keep optional sharing of this extension's request logs and datasets with Google for product improvement or model training disabled. Do not contribute this data through feedback or dataset sharing. The extension does not verify these settings.

By using this extension, you agree to follow these conditions, the Google API Terms and the Gemini API Additional Terms. Do not use it if you cannot meet these conditions.

Supported countries and regions: https://ai.google.dev/gemini-api/docs/available-regions

Google API Terms: https://developers.google.com/terms

Gemini API Additional Terms: https://ai.google.dev/gemini-api/terms

YOUR TEXT AND PRIVACY

When you request a translation, the selected text, target language and translation instruction go directly to Google with your API authentication. Loading the model list also contacts Google. The developer has no translation server, analytics or advertising. The extension has no translation history; the popup keeps only the latest result for the browser session. Language, model and trigger preferences can sync through Chrome.

The data-sharing details stay visible in Settings. Your agreement is saved for this browser profile. If the notice changes, review it and agree again before connecting. Choose Withdraw data agreement to stop new Google requests and cancel active ones locally, while keeping the encrypted key and preferences. Choose Remove saved key to delete the saved key and model cache. Neither action recalls data already sent to Google.

AI Translator follows Chrome's Limited Use requirements for its required paid-service setup. Google's paid-service terms exclude using prompts and responses for product improvement, while allowing limited security and legal handling. Private project logging is separate from sharing data with Google. Do not send text that you are not allowed to share. Read the privacy page and Google's terms before adding a key. AI translations can be wrong; check important wording before relying on it.

COMPATIBILITY

Chrome 140 or later is required. Manually tested on Mac only. Windows and Linux have not been manually tested. Chrome settings pages, the Chrome Web Store, the built-in PDF viewer and other protected pages do not allow translation. Refresh open pages after installing or updating the extension.

OPEN SOURCE AND SUPPORT

Source code and project guide: https://github.com/miroslavkiev/chrome-ai-translate

Help and issue reports: https://github.com/miroslavkiev/chrome-ai-translate/issues

Privacy: https://github.com/miroslavkiev/chrome-ai-translate/blob/main/PRIVACY.md

AI Translator is an independent project, not a Google product. The developer made it to help people read and connect across languages. If you wish to support the work, the developer asks you to support Ukraine in its defence against Russian aggression through the foundation he trusts: https://www.sternenkofund.org/en/donate

Support is optional and never unlocks features. Donations are handled by the foundation, not this extension.

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
