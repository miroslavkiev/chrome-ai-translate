# Privacy and security

Updated September 6, 2026. This page describes the current build. The public-release review is still open, including applicable privacy contact information and legal bases, Google's service conditions and Store certifications. See the [release checklist](https://github.com/miroslavkiev/chrome-ai-translate/blob/main/store/README.md).

AI Translator has no analytics, advertising, remote backend, or translation history.

## Our data-use commitment

AI Translator's use and transfer of user data complies with the [Chrome Web Store User Data Policy, including its Limited Use requirements](https://developer.chrome.com/docs/webstore/program-policies/limited-use).

The extension uses selected text only to provide translations and the related operations described here. Requests go directly to Google; the extension does not send your API key or translation text to the developer. The developer does not sell that data, use it for advertising, or use it to train models. Google processing follows the required paid-service setup below, including its limited security and legal handling.

## Your data agreement

Settings explains which data goes to Google, how your API key is saved and the limits of that protection. Choose **Agree and connect to Google** before entering a new key or using a migrated key. Until that agreement is saved, the extension makes no Google API requests, including model checks and translations. Having a cached model list does not bypass this step.

The agreement version and date are stored locally for this browser profile. They are not sent to the developer or synced to other browsers. The agreement remains in place across normal restarts and updates unless the notice changes. A changed notice, withdrawal or clearing its storage requires you to review the details and agree again before any Google request. The data-sharing details remain visible in Settings for review.

Google's age, work/business, region and billing conditions are shown separately and apply through use of the extension. There is no eligibility checkbox, identity check or independent verification of these facts. Your data agreement does not prove eligibility and does not provide permission on behalf of other people whose information may appear in selected text.

## Data sent to Google

After you agree to data sharing, starting a translation sends the selected text, target language, and translation instruction directly from the extension to the Google Gemini API. This also applies to text selected from a local file after you enable Chrome's file URL access for the extension. Google processes that request under the terms of the Gemini API and your Google account.

Model-list refreshes send only your API authentication and a request for available model metadata.

**Required in every country:** use a Gemini API key from a Google Cloud project with active billing. Unpaid projects are outside this extension's supported use. Keep optional sharing of the extension's request logs and datasets with Google for product improvement or model training disabled. Do not contribute this data through feedback or dataset sharing. Google API charges can apply.

Under Google's paid-service terms, prompts and responses are not used to improve Google's products. Limited safety and legal logging still applies. Google also requires adult professional or business use in supported regions. Read the [Gemini API terms](https://ai.google.dev/gemini-api/terms) and [pricing and data-use notes](https://ai.google.dev/gemini-api/docs/pricing).

Optional private logging within your own Google Cloud project is separate from contributing data to Google. If you enable it, requests and responses can remain in your project under its logging and dataset settings. Sharing them with Google can permit training and human review even when billing is active, so that sharing is not permitted for this extension's data. The extension does not change or verify these settings. A working key or successful model check does not verify billing or sharing status. Read [Google's logging and sharing policy](https://ai.google.dev/gemini-api/docs/logs-policy).

Requests use HTTPS and authenticate with a request header. The extension does not add the page URL, page title, complete page, browsing history, or your Google account name to translation requests. Google receives network details such as your IP address as part of the connection. Text you select can itself include personal or sensitive information. Only send content that you are allowed to share.

Google's terms allow processing in countries where Google or its agents have facilities. This extension does not select an EU-only processing location. Google has separate responsibilities under the terms and privacy policies linked above.

## Data stored by Chrome

- Your Gemini API key is encrypted with AES-256-GCM and stored in the extension's IndexedDB database. Its nonextractable encryption key is stored there too, so the extension can use your API key automatically after a restart. The API key and encryption key are not synced to other browsers.
- This is not an OS keychain or a password-protected vault. Extension code can use the saved encryption key to decrypt the API key. Someone with access to the Chrome profile, or hostile code running inside the extension, may still recover it. Nonextractable does not guarantee protection of key material on disk.
- The data-agreement version and date are kept locally. A non-secret storage revision can remain after key removal to prevent an older Settings tab from restoring stale data.
- The last model list and known key/model check state are also stored locally. They contain provider model metadata and a key fingerprint, not source text or translation history. Key replacement or removal invalidates the old catalog.
- Your default language, selected model, and trigger key are stored in Chrome sync storage.
- The latest translation or failure, active request count, and recent request timestamps are stored in session storage. They are cleared when the browser session ends.
- Source text is not kept in translation history or persistent storage.

An upgrade moves older plain text keys from local or sync storage into the encrypted database. If both exist, the local key takes priority. The extension saves and decrypts the encrypted record to verify it before removing plain text copies from both stores. If migration fails, the old plain text value remains to avoid data loss, an error is shown and Google requests stay blocked. Missing, damaged or inaccessible encrypted storage is not silently overwritten. No Google request is needed for migration.

New setup records an unselected language until you make a choice. An upgrade preserves existing saved choices and earlier defaults. Setup adds no tracking or separate first-run history.

## Page access

The configurable single-key trigger requires a content script on HTTP, HTTPS, and approved local-file pages and frames. Chrome therefore reports that the extension can read and change data on those pages. The script reads the current selection when you press the configured key so it can confirm that the selection did not change. It sends the text only after a clean key release or the context-menu command.

The background service has explicit network permission only for `https://generativelanguage.googleapis.com/*`. Declarative content-script access is still needed on the pages where you use the shortcut. It does not upload whole pages or track browsing.

Chrome pages, browser settings, the built-in PDF viewer, and other restricted pages are unsupported.

## Controls and limits

You can disable the global key and keep the context menu. After data agreement, you can replace the API key by pasting another key. Use **Remove saved key** to delete it. The extension limits input size, active requests, rapid requests, response size, and request duration. Failed requests are not retried automatically.

Use **Withdraw data agreement** in Settings to block new Google requests and abort active requests locally. Your encrypted key and preferences remain saved so you can resume if you agree again. Withdrawal does not delete Google's copies of earlier requests.

Copy runs only when you choose it and writes only the displayed result to the clipboard. If the browser blocks copying, the result remains selectable. No new clipboard permission is requested.

Help and About contain links to Google, the project, and an optional donation website. These open only when you click them. The extension does not process donations or send your API key or translation text with these links.

Cancelling a request stops local waiting and attempts to abort the network request. Withdrawing agreement or removing a key blocks future requests and attempts to abort active work. These actions do not guarantee that already dispatched provider work stops or becomes free. No translation data is sent to any service other than the configured Gemini API endpoint.

## Deletion and external support

Choose **Remove saved key** in Settings to delete the encrypted API key, its encryption key and model cache. A non-secret revision marker remains to protect against stale Settings tabs. Ending the browser session clears the session result. Uninstalling the extension removes its extension storage from that browser; manage Chrome sync separately if you use it. Revoking a key or deleting Google-side data requires the controls provided by Google. Removing local data does not recall requests already sent.

The [source repository](https://github.com/miroslavkiev/chrome-ai-translate) and [support issues](https://github.com/miroslavkiev/chrome-ai-translate/issues) are public and hosted by GitHub. Do not post API keys, private translations, account details, or sensitive screenshots there. Visiting GitHub or sending an issue involves GitHub's own [privacy policy](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement). Applicable publisher contact and privacy-rights information remains unresolved. No contact details are invented here, and the unused legal-notice template is not a public notice.

## Store review status

The Limited Use commitment above applies to the extension's required paid-service setup, with optional contribution of request data to Google disabled. It is a commitment about data use, not a claim of Store approval or automatic checks of your Google settings. Applicable publisher/privacy information and submission declarations remain open. See the [Chrome user-data requirements](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) and [release checklist](https://github.com/miroslavkiev/chrome-ai-translate/blob/main/store/REVIEW_CHECKLIST.md).
