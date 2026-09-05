# Store listing draft

Do not submit yet. See [the open release items](README.md). The description below assumes that Google's adult professional-use and billing conditions can be met. Recheck it after the publisher chooses the audience and key-storage flow.

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
| Pricing | Extension is free. Users provide their own eligible Gemini API access; Google charges can apply. |
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

You need your own Google Gemini API key. The first-use guide explains how to get a key, choose a target language and select a model. We recommend the Flash-Lite family. At this release in September 2026, our choice is Gemini 3.5 Flash-Lite when it is available to your key. You may choose another listed model. Some models may not work; if one fails, choose an alternative or the recommended model.

Google's current API terms require adult professional or business use in supported regions. Apps offered in the European Economic Area, UK or Switzerland must use an API project with active billing. The extension is free, but Google API charges and limits can apply. It is not an offline translator and is not designed for children.

YOUR TEXT AND PRIVACY

When you request a translation, the selected text, target language and translation instruction go directly to Google with your API authentication. Loading the model list also contacts Google. The developer has no translation server, analytics or advertising. The extension has no translation history; the popup keeps only the latest result for the browser session. Language, model and trigger preferences can sync through Chrome.

Google's terms govern provider processing and retention. Do not send text that you are not allowed to share. Read the privacy page and Google's terms before adding a key. AI translations can be wrong; check important wording before relying on it.

COMPATIBILITY

Chrome 140 or later is required. Manually tested on Mac only. Windows and Linux have not been manually tested. Chrome settings pages, the Chrome Web Store, the built-in PDF viewer and other protected pages do not allow translation. Refresh open pages after installing or updating the extension.

OPEN SOURCE AND SUPPORT

Source code and project guide: https://github.com/miroslavkiev/chrome-ai-translate

Help and issue reports: https://github.com/miroslavkiev/chrome-ai-translate/issues

Privacy: https://github.com/miroslavkiev/chrome-ai-translate/blob/main/PRIVACY.md

AI Translator is an independent project, not a Google product. The developer made it to help people read and connect across languages. If you wish to support the work, the developer asks you to support Ukraine in its defence against Russian aggression through the foundation he trusts: https://www.sternenkofund.org/en/donate

Support is optional and never unlocks features. Donations are handled by the foundation, not this extension.

## Reviewer instructions

Use a reviewer-owned eligible Gemini key and a project that meets Google's terms. No shared demo credential is provided. Never paste a real key into public issues or listing text.

1. Install the final ZIP and open AI Translator from the toolbar.
2. Follow the welcome guide. Add the eligible key, choose a listed text model and a target language, then finish setup.
3. Open or refresh an ordinary HTTPS page. Select a short non-sensitive sentence and tap/release Control. Confirm the nearby result card.
4. Try the right-click Translate Selected Text command, Copy, a different card language and the latest-result popup.
5. Open Settings. Confirm key removal returns the extension to setup. Check the final key-storage flow documented for the release.
6. For local HTML only, enable Allow access to file URLs. Chrome blocks its built-in PDF viewer and protected pages by design.

If reviewers cannot use their own provider access, resolve their testing needs through the dashboard's private reviewer channel. Do not invent a demo-key path or expose the publisher's key.

## Source guidance

The [listing guide](https://developer.chrome.com/docs/webstore/cws-dashboard-listing) describes the homepage and support fields. Use the [images guide](https://developer.chrome.com/docs/webstore/images) for final upload dimensions and the [privacy guide](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) for permission justifications. A video is not included in this image pack; confirm the actual dashboard's current optional-video field before submission.
