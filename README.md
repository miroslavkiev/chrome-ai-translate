# AI Translator for Chrome

AI Translator translates selected text with the Google Gemini API. It uses your own API key and shows each result beside the selected text.

## Features

- Translate through a configurable single key or the context menu.
- Translate several selections on the same page.
- Change the target language for one result without changing the saved default.
- Choose from the compatible models returned by the Gemini Models API.
- See loading, success, timeout, quota, network, and other failure states.
- Retry failed translations manually. The extension does not retry paid requests automatically.
- Review the latest result and current activity in the toolbar popup.
- Use light, dark, high-contrast, reduced-motion, and keyboard-accessible interfaces.

## Requirements

- Google Chrome 120 or later.
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
- Node.js 20.19 or later only when building from source.

## Install a packaged build

1. Download `chrome-ai-translate.zip` and its `.sha256` file from a release.
2. Verify the checksum if your operating system supports it.
3. Extract the ZIP.
4. Open `chrome://extensions` in Chrome.
5. Enable Developer mode.
6. Choose Load unpacked and select the extracted folder. The selected folder must contain `manifest.json` at its root.

## Build from source

```bash
git clone https://github.com/miroslavkiev/chrome-ai-translate.git
cd chrome-ai-translate
npm ci
npm run ci
```

Load the generated `dist` folder from `chrome://extensions`.

`npm run package` creates and verifies:

- `dist/chrome-ai-translate.zip`
- `dist/chrome-ai-translate.zip.sha256`

## Set up the extension

1. Open the extension toolbar popup and choose Settings.
2. Enter your Gemini API key.
3. Choose a default target language and global key, then choose Save Settings.
4. Wait for the compatible model list to load automatically.
5. If the saved model is unavailable, choose a compatible model and save again.
6. Use Refresh models later when you want a new list from Gemini.

The model list comes from Gemini `models.list`. It includes text models that report support for `generateContent`, provide an output limit, and support this extension's system-instruction contract. The last successful list remains available after a transient refresh failure. An invalid or changed API key is never hidden by the cache.

## Translate text

1. Select text on an HTTP or HTTPS page.
2. Release the configured key after a clean key press, or choose Translate Selected Text from the context menu.
3. Wait for the result card near the selection.

The default key is Control. The key trigger cancels if another input, selection change, page change, or long hold occurs. It does not block the page's normal keyboard behavior. Every single-key choice can conflict with a website, browser, operating system, or accessibility tool. Set the key to Off if you prefer to use only the context menu.

Inside a result card, choose another language, then choose Translate. This translates the same selection for that card only and can be repeated. Translate and Retry each start a new API request.

## Privacy and permissions

The extension sends selected text directly to Google only after a translation action. It has no analytics, advertising, remote backend, or translation history. The Gemini API key is stored in local extension storage and is not synced. The most recent result is kept only for the current browser session.

The global key requires the extension content script to be present on HTTP and HTTPS pages and frames. Chrome therefore reports that the extension can read and change data on those sites. Chrome pages, the built-in PDF viewer, and other restricted pages are unsupported.

See [PRIVACY.md](PRIVACY.md) for the complete data and permission explanation.

## Request limits

- Maximum input: 10,000 Unicode characters.
- Maximum active requests: 3 per tab and 6 in total.
- Maximum starts: 30 in a rolling 60-second window.
- Request timeout: 25 seconds.
- Automatic retries: none.

These limits protect quota without preventing sequential translations on the same page.

On very small embedded frames, the inline card can be constrained by the frame viewport. The toolbar popup keeps the latest result available for the browser session.

## Development commands

```bash
npm run check
npm test
npm run build
npm run watch
npm run package
```

- `check` validates JavaScript, JSON, and repository text rules.
- `test` runs the native Node test suite.
- `build` performs one clean production build and exits.
- `watch` rebuilds while source files change.
- `package` builds, creates the root-layout ZIP, writes its checksum, and verifies both.

GitHub Actions runs the full flow on Linux, macOS, and Windows. A release should use the matching manifest and package version, a Git tag, the verified ZIP, and its checksum.

## License

[MIT](LICENSE)
