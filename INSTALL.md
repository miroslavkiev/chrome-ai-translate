# Install or update AI Translator

AI Translator translates selected text with your own Google Gemini API key. It runs as a local Chrome extension and sends selected text directly to Google after your action. It is not an offline translator. See PRIVACY.md for data handling and LICENSE for reuse terms.

## Install

1. Verify the ZIP against its SHA-256 file if available, then extract it.
2. Open chrome://extensions in Chrome 140 or later and enable Developer mode. Older versions cannot apply this extension's API-key storage protection.
3. Choose Load unpacked and select this folder. It must contain manifest.json.
4. Open the extension's Settings, paste your key, wait for the model list, and choose a compatible model.
5. Choose your default language and key, then save preferences.
6. For local files, enable Allow access to file URLs in the extension's details.

## Update

1. Let active translations finish. Keep the existing unpacked folder path to keep the extension identity and settings.
2. Replace its contents with the new extracted files.
3. Choose Reload for AI Translator at chrome://extensions.
4. Refresh existing web pages so they use the new content script.

Reloading interrupts active requests. Do not uninstall the extension as an update step because that can remove its stored settings.

## Use and recovery

Select text, then release the configured key or choose Translate Selected Text from the context menu. Control is the initial key. Use Off in Settings for context-menu-only translation. After starting a card, press Tab to reach it or Escape to close it.

Clicking outside closes cards and cancels unfinished requests. Retry and a language change clear the old output and start a new request. They do not keep a prior result. Copy is available on successful results where Chrome allows clipboard access; if it is blocked, select and copy the text normally.

If setup fails, check the saved key and refresh models. Choose another model if the saved one is unavailable. If Settings reports conflicting or unreadable values, use Reload saved settings before editing again. For a long selection, select less text. Provider quota needs time or an account check. Browser settings, the Chrome Web Store, and the built-in PDF viewer are unsupported.

Languages: Ukrainian (default), English, Spanish, French, German, Russian.
