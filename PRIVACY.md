# Privacy and security

Updated September 5, 2026. This page describes the current build. The public-release review is still open: publisher contact details, applicable legal bases, key storage protection, and Google's service eligibility must be settled before Store submission. See the [release checklist](https://github.com/miroslavkiev/chrome-ai-translate/blob/main/store/README.md).

AI Translator has no analytics, advertising, remote backend, or translation history.

## Data sent to Google

When you start a translation, the selected text, target language, and translation instruction are sent directly from the extension to the Google Gemini API. This also applies to text selected from a local file after you enable Chrome's file URL access for the extension. Google processes that request under the terms of the Gemini API and your Google account.

Model-list refreshes send only your API authentication and a request for available model metadata.

Google's handling of text depends on the service tier and region. Some unpaid-service terms allow product improvement and human review. Paid-service terms exclude product improvement but retain limited safety and legal logging. Users in the EEA, UK, and Switzerland receive the paid data-use treatment even for unpaid quota. Separately, Google's terms require Paid Services for API clients offered in those regions, which means a project with active billing. They also limit the API to adult professional or business use in supported regions. A successful model check cannot verify all these conditions. Read the [Gemini API terms](https://ai.google.dev/gemini-api/terms) and [pricing and data-use notes](https://ai.google.dev/gemini-api/docs/pricing).

Requests use HTTPS and authenticate with a request header. The extension does not add the page URL, page title, complete page, browsing history, or your Google account name to translation requests. Google receives network details such as your IP address as part of the connection. Text you select can itself include personal or sensitive information. Only send content that you are allowed to share.

Google's terms allow processing in countries where Google or its agents have facilities. This extension does not select an EU-only processing location. Google has separate responsibilities under the terms and privacy policies linked above.

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

The background service has explicit network permission only for `https://generativelanguage.googleapis.com/*`. Declarative content-script access is still needed on the pages where you use the shortcut. It does not upload whole pages or track browsing.

Chrome pages, browser settings, the built-in PDF viewer, and other restricted pages are unsupported.

## Controls and limits

You can disable the global key and keep the context menu. You can replace the API key by pasting another key or remove it by emptying the field. The extension limits input size, active requests, rapid requests, response size, and request duration. Failed requests are not retried automatically.

Copy runs only when you choose it and writes only the displayed result to the clipboard. If the browser blocks copying, the result remains selectable. No new clipboard permission is requested.

Help and About contain links to Google, the project, and an optional donation website. These open only when you click them. The extension does not process donations or send your API key or translation text with these links.

Cancelling a request stops local waiting and attempts to abort the network request. Removing a key prevents future requests after the current-key check. Neither action guarantees that already dispatched provider work stops or becomes free. No translation data is sent to any service other than the configured Gemini API endpoint.

## Deletion and external support

Empty the key field in Settings to remove the saved key. This also invalidates its model cache. Ending the browser session clears the session result. Uninstalling the extension removes its extension storage from that browser; manage Chrome sync separately if you use it. Revoking a key or deleting Google-side data requires the controls provided by Google. Removing local data does not recall requests already sent.

The [source repository](https://github.com/miroslavkiev/chrome-ai-translate) and [support issues](https://github.com/miroslavkiev/chrome-ai-translate/issues) are public and hosted by GitHub. Do not post API keys, private translations, account details, or sensitive screenshots there. Visiting GitHub or sending an issue involves GitHub's own [privacy policy](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement). A private publisher contact and the applicable privacy-rights information still need to be supplied before Store submission.

## Store review status

No Limited Use compliance certification is made for this build. The saved key is not encrypted at rest, the setup needs the selected consent/storage flow, and unpaid provider data use can conflict with the Store's single-purpose restrictions. These issues must be resolved before completing the Store's privacy certifications. See the [Chrome user-data requirements](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) and [Limited Use policy](https://developer.chrome.com/docs/webstore/program-policies/policies).
