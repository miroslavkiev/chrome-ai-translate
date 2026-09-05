# Privacy and security

AI Translator has no analytics, advertising, remote backend, or translation history.

## Data sent to Google

When you start a translation, the selected text, target language, and translation instruction are sent directly from the extension to the Google Gemini API. This also applies to text selected from a local file after you enable Chrome's file URL access for the extension. Google processes that request under the terms of the Gemini API and your Google account.

Model-list refreshes send only your API authentication and a request for available model metadata.

Google's handling of text depends on the service tier and region. Its unpaid-service terms can allow product improvement and human review. Paid-service terms exclude product improvement but retain limited safety and legal logging. Read the [Gemini API terms](https://ai.google.dev/gemini-api/terms) and [pricing and data-use notes](https://ai.google.dev/gemini-api/docs/pricing) before translating private text.

## Data stored by Chrome

- Your Gemini API key is stored in local extension storage. It is not synced to other browsers. Chrome extension storage is not encrypted against access to your local browser profile.
- The last model list and known key/model check state are also stored locally. They contain provider model metadata and a key fingerprint, not source text or translation history. Key replacement or removal invalidates the old catalog.
- Your default language, selected model, and trigger key are stored in Chrome sync storage.
- The latest translation or failure, active request count, and recent request timestamps are stored in session storage. They are cleared when the browser session ends.
- Source text is not kept in translation history or persistent storage.

An upgrade migrates any API key saved by version 1.0 from sync storage to local storage and removes the synced copy after verification.

New setup records an unselected language until you make a choice. An upgrade preserves existing saved choices and earlier defaults. Setup adds no tracking or separate first-run history.

## Page access

The configurable single-key trigger requires a content script on HTTP, HTTPS, and approved local-file pages and frames. Chrome therefore reports that the extension can read and change data on those pages. The script reads the current selection when you press the configured key so it can confirm that the selection did not change. It sends the text only after a clean key release or the context-menu command.

Chrome pages, browser settings, the built-in PDF viewer, and other restricted pages are unsupported.

## Controls and limits

You can disable the global key and keep the context menu. You can replace the API key by pasting another key or remove it by emptying the field. The extension limits input size, active requests, rapid requests, response size, and request duration. Failed requests are not retried automatically.

Copy runs only when you choose it and writes only the displayed result to the clipboard. If the browser blocks copying, the result remains selectable. No new clipboard permission is requested.

Help and About contain links to Google, the project, and an optional donation website. These open only when you click them. The extension does not process donations or send your API key or translation text with these links.

Cancelling a request stops local waiting and attempts to abort the network request. Removing a key prevents future requests after the current-key check. Neither action guarantees that already dispatched provider work stops or becomes free. No translation data is sent to any service other than the configured Gemini API endpoint.
