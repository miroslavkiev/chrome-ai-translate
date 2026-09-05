# AI Translator for Chrome

Super easy translation: select text and press Control. AI Translator translates into your chosen language with the Google Gemini API and shows each result beside the selected text. It uses your own API key.

Manually tested on Mac only. Windows and Linux have not been manually tested.

The [source repository](https://github.com/miroslavkiev/chrome-ai-translate) is public under the MIT license. For help, use [public issues](https://github.com/miroslavkiev/chrome-ai-translate/issues) without sharing keys or private text. Read the [privacy details](PRIVACY.md).

## Chrome Web Store preparation

The [Store release pack](store/README.md) contains listing text, screenshots, promotional images, reviewer notes and a Germany/EU legal review. It is a draft, not a published Store listing. Key-storage protection, disclosure/consent, Google's audience/service conditions and approved publisher details remain open. No personal address is inferred or published.

## Features

- Translate through a configurable single key or the context menu.
- Translate several selections on the same page.
- Change the target language for one result without changing the saved default.
- Choose from Google's documented Gemini languages, including separate Simplified and Traditional Chinese choices.
- Follow a first-use checklist and an API key guide inside the extension.
- Choose from the compatible models returned by the Gemini Models API.
- See loading, success, timeout, quota, network, and other failure states.
- Retry failed translations manually. The extension does not retry paid requests automatically.
- Review the latest result and current activity in the toolbar popup.
- Copy a result, with a clear fallback when the browser blocks clipboard access.
- Use light, dark, high-contrast, reduced-motion, and keyboard-accessible interfaces.

## Requirements

- Google Chrome 140 or later. Earlier versions cannot apply the local-storage access protection used for API keys.
- Your own Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).
- Eligible adult professional or business use under the [Gemini API terms](https://ai.google.dev/gemini-api/terms). API clients offered in the European Economic Area, UK or Switzerland require a project with active billing. A working API key does not verify every term or billing condition.
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

For a new install, load the generated `dist` folder from `chrome://extensions`. An existing install may keep the repository root as its loaded folder. Its manifest now uses the built `dist/content.js`, so build again after source changes, reload the extension, and refresh web pages. Keep the same loaded folder to preserve the extension identity and saved settings.

`npm run package` creates and verifies:

- `dist/chrome-ai-translate.zip`
- `dist/chrome-ai-translate.zip.sha256`

## Set up the extension

1. Open the extension toolbar popup. Without a saved API key, it shows a welcome guide. Choose Start setup to open the checklist in Settings.
2. Follow the API key guide to open Google AI Studio, sign in, and create or choose your own key. The guide opens in a separate tab and contains links to Google's current instructions.
3. Paste your key into Settings. The key saves and the model list loads automatically. A manually typed key saves when you leave the field. Delete the field contents to remove it.
4. Choose a model, target language, and optional keyboard trigger. Choose Finish setup to save these choices and complete the checklist.
5. Open a normal web page, select text, then tap and release Control. You can also choose Translate Selected Text from the right-click menu. Refresh the web page first if the extension was just installed or reloaded.

After setup, the popup returns to the standard view. A saved key with unfinished setup keeps a Finish setup action so you can return to the checklist. Removing the key brings back the welcome guide. Existing users keep their saved language and model. Later changes use Save Preferences in Settings.

We recommend the Gemini Flash-Lite family. For this release in September 2026, the recommended model is `gemini-3.5-flash-lite`, when it is available to your key. You can choose another listed model. Some models may not work with this extension; if one fails, choose another or use the recommended model. Use Refresh models to request an updated list.

The language list follows [Google's documented Gemini languages](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/google-models#language_support), checked on September 5, 2026. Google lists 109 language entries, with both Chinese scripts in one entry. The extension offers 110 choices by separating Simplified and Traditional Chinese. This is Google's shared Gemini list, not a promise of equal translation quality in every language. The Models API does not return a language list.

Settings shows whether the key is saved, checked, or rejected. A checked key means a previous provider request worked, not that future quota or availability is guaranteed. If loading saved settings fails, saving stays disabled. Open Settings again after the problem clears. If another Settings tab changes the same field you are editing, your edit stays visible; Reload saved settings discards it and loads the saved choice. Changes to other fields are kept automatically.

The model list comes from Gemini `models.list`. It filters known non-text variants, but the API does not report output modality, so an unknown future variant can still appear. Settings reuses a list less than 24 hours old and tries to refresh an older one. Translation can use an older list to avoid blocking on discovery. A temporary refresh failure can use the last successful list with a cached-data notice in Settings. A known rejected key or model stays unavailable until a successful check or replacement. Use Refresh models to check again. [DESIGN.md](DESIGN.md) records the provider rules and their limits.

Open API key guide or About from the popup or Settings at any time. About explains the purpose of the project and includes an optional link to support Ukraine through the developer's trusted foundation. Donations are not required to use the extension.

## Translate text

1. Select text on an HTTP, HTTPS, or enabled local-file page.
2. Release the configured key after a clean key press, or choose Translate Selected Text from the context menu.
3. Wait for the result card near the selection.

The default key is Control. The key trigger cancels if another input, selection change, page change, or long hold occurs. It does not block the page's normal keyboard behavior. Every single-key choice can conflict with a website, browser, operating system, or accessibility tool. Set the key to Off if you prefer to use only the context menu.

Inside a result card, choosing another language starts a new translation immediately. This changes only that card and does not change the saved default language. Retry also starts a new API request. Both actions clear the old output, including when the new request fails.

Cards do not take focus when they appear. Press Tab next to enter the new card, or Escape to close the focused or newest card. Clicking outside all cards closes every card and cancels unfinished work. Each frame keeps at most five completed cards. Cancellation can replace the popup's latest result with a cancellation message. These result-lifetime rules are unchanged.

Choose Copy on a successful card or in the popup. If copying is blocked, select the result text and copy it yourself. The popup shows the language and completion time of the latest result. It is a session preview, not a history.

### Local files

The extension can translate pages opened from `file://` URLs. After installing or updating it, open the extension details in `chrome://extensions` and enable Allow access to file URLs. Chrome controls this permission, so the extension cannot enable it for you.

### Update and recover

Keep the installed folder at the same path. Finish active translations, replace the build, then choose Reload on the extension at `chrome://extensions`. Refresh the web pages where you want to use it. Do not uninstall to update: uninstalling removes saved settings. Open cards and active requests do not survive page refresh or extension reload. A completed popup result can remain after a page refresh, for the current browser session.

Key or model errors offer Settings. Oversized or blocked text asks for a different selection. Temporary failures offer manual Retry; a known retry delay disables request actions until it expires. Chrome pages, the PDF viewer, inaccessible closed-shadow editors, and very small embedded frames have limits. See [INSTALL.md](INSTALL.md) for a short setup and recovery guide included in every ZIP.

## Privacy and permissions

The extension sends selected text directly to Google only after a translation action. It has no analytics, advertising, remote backend, or translation history. The Gemini API key is stored in local extension storage and is not synced. The most recent result is kept only for the current browser session.

Google API costs, limits, and use of submitted data depend on your plan and Google's terms. Read [Google's pricing and data-use notes](https://ai.google.dev/gemini-api/docs/pricing) and the [Gemini API terms](https://ai.google.dev/gemini-api/terms). For account access issues, check [Google's region and age requirements](https://ai.google.dev/gemini-api/docs/available-regions).

The global key requires the extension content script to be present on HTTP, HTTPS, and approved local-file pages and frames. Chrome therefore reports that the extension can read and change data on those pages. Chrome pages, the built-in PDF viewer, and other restricted pages are unsupported.

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
npx playwright install chromium
npm run test:browser
```

- `check` validates JavaScript, JSON, and repository text rules.
- `test` runs the native Node test suite.
- `build` performs one clean production build and exits.
- `watch` rebuilds while source files change.
- `package` builds, creates the root-layout ZIP, writes its checksum, and verifies both.
- `test:browser` checks the built extension in a temporary Chromium profile, using fake credentials and provider replies. Run `build` first. It makes no paid translation calls. Optional `CHROME_PATH` selects a Chrome for Testing executable.

GitHub Actions runs the full flow on Linux, macOS, and Windows, including the minimum Node version on Linux and Chromium checks on Node 22. A release should use the matching manifest and package version, a Git tag, the verified ZIP, and its checksum. [RELEASE_CHECKS.md](RELEASE_CHECKS.md) defines browser, update, and translation-quality checks and records this release's evidence.

## License

[MIT](LICENSE)
