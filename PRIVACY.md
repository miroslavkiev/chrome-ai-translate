# Privacy and security

AI Translator has no analytics, advertising, remote backend, or translation history.

## Data sent to Google

When you start a translation, the selected text, target language, and translation instruction are sent directly from the extension to the Google Gemini API. Google processes that request under the terms of the Gemini API and your Google account.

Model-list refreshes send only your API authentication and a request for available model metadata.

## Data stored by Chrome

- Your Gemini API key is stored in local extension storage. It is not synced to other browsers. Chrome extension storage is not encrypted against access to your local browser profile.
- Your default language, selected model, and trigger key are stored in Chrome sync storage.
- The latest translation or failure, active request count, and recent request timestamps are stored in session storage. They are cleared when the browser session ends.
- Source text is not kept in translation history or persistent storage.

An upgrade migrates any API key saved by version 1.0 from sync storage to local storage and removes the synced copy after verification.

## Page access

The configurable single-key trigger requires a content script on HTTP and HTTPS pages and frames. Chrome therefore reports that the extension can read and change data on those sites. The script reads the current selection when you press the configured key so it can confirm that the selection did not change. It sends the text only after a clean key release or the context-menu command.

Chrome pages, browser settings, the built-in PDF viewer, and other restricted pages are unsupported.

## Controls and limits

You can disable the global key and keep the context menu. You can replace or clear the API key at any time. The extension limits input size, active requests, rapid requests, response size, and request duration. Failed requests are not retried automatically.
