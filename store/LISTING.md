# Store listing draft

Do not submit yet. See [the open release items and recorded risks](README.md). The description states Google's use conditions without a separate eligibility checkbox. The build uses a separate data-agreement button and the selected encrypted key storage. Check all claims against the final tested package. The publisher chose not to provide a public postal address; no substitute or personal details are invented, and this decision is not legal clearance.

## Dashboard fields

| Field | Value |
| --- | --- |
| Name | AI Translator |
| Summary | Super easy translation: select text and press Control. Translate into your chosen language with Gemini. |
| Category | Productivity > Tools, confirmed from the dashboard choices on September 6, 2026. |
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

💜 Super easy translation: select text and tap Control.

AI Translator uses Google Gemini to translate the words you choose. Read the result beside your selection and keep going, without leaving the page.

🌍 Translate your way

• Choose from 110 language and script options based on Google's shared Gemini language list.
• Tap and release Control, or use the right-click menu.
• Change the language in a result card without changing your default.
• Copy a translation or view the latest result in the toolbar popup.
• Choose another trigger key, or turn it off and use the right-click menu.
• Translate selected text in local HTML files when Chrome's file access is enabled.

🔑 Guided setup with your own Gemini key

1. Open the extension and follow the guide to get your own Google Gemini API key.
2. Read the data-sharing notice and choose Agree and connect to Google.
3. Add your key, choose a model and target language, then finish setup.

The built-in FAQ explains API keys, billing, privacy and why each requirement exists, with links to the official rules.

We recommend the Flash-Lite family. For this release in September 2026, our choice is Gemini 3.5 Flash-Lite when available to your key. You can choose another listed model. If a model does not work, choose an alternative or the recommended model.

💳 Free extension, separate Google API costs

The extension is free. Google API charges and limits may apply, and an internet connection is needed.

Your key must belong to a Google Cloud project with active billing in every country. Unpaid projects are not supported. A paid Gemini app subscription does not replace API project billing.

Keep optional sharing of this extension's request logs and datasets with Google for training or product improvement OFF. Do not contribute this data through feedback or dataset sharing. Private project logging is separate. The extension does not verify these settings.

🔒 Your key, your text and your choices

• No Google API request starts before your data agreement.
• Your key is encrypted on this device and opens automatically after normal Chrome restarts. No unlock password is needed. Someone with access to your browser profile may still recover it.
• Requested translations send selected text, target language and translation instructions directly to Google with your API authentication. Model-list checks also contact Google.
• The developer has no translation server, analytics or advertising. There is no translation history; only the latest result stays for the browser session. Language, model and shortcut preferences can sync through Chrome.
• Withdraw data agreement blocks new requests and cancels active ones locally, keeping your saved key and preferences. Remove saved key deletes the key and model cache. Neither recalls data already sent to Google.
• Your agreement stays saved. If the notice changes, review it and agree again before connecting.

AI Translator follows Chrome's Limited Use requirements for its required paid-service setup. Google's paid terms exclude product improvement use of prompts and responses, while allowing limited security and legal handling. Only send text you may share. AI translations can be wrong, so check important wording.

📋 Before you use it

For people aged 18 or older, for work or business use, in Google's supported regions. Not designed for children.

By using this extension, you agree to follow these conditions, the Google API Terms and the Gemini API Additional Terms. Do not use it if you cannot meet them.

Supported regions: https://ai.google.dev/gemini-api/docs/available-regions
Google API Terms: https://developers.google.com/terms
Gemini API Additional Terms: https://ai.google.dev/gemini-api/terms

💻 Compatibility

Chrome 140 or later. Manually tested on Mac only; Windows and Linux have not been manually tested.

Chrome settings pages, the Chrome Web Store, the built-in PDF viewer and other protected pages do not allow translation. Refresh open pages after installing or updating.

🔗 Open source and support

Source code and guide: https://github.com/miroslavkiev/chrome-ai-translate
Help and issues: https://github.com/miroslavkiev/chrome-ai-translate/issues
Privacy: https://github.com/miroslavkiev/chrome-ai-translate/blob/main/PRIVACY.md

AI Translator is an independent project, not a Google product.

🇺🇦 Support Ukraine

The developer created this extension to help people read and connect across languages. If you would like to support the work, please support Ukraine in its defence against Russian aggression through the foundation the developer trusts:

https://www.sternenkofund.org/en/donate

Support is optional and never unlocks features. Donations are handled by the foundation, not the extension.

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
