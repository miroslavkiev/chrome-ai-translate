# Install or update AI Translator

AI Translator translates selected text with your own Google Gemini API key. It runs as a local Chrome extension and sends selected text directly to Google after your action. It is not an offline translator. See PRIVACY.md for data handling and LICENSE for reuse terms.

## Install

1. Verify the ZIP against its SHA-256 file if available, then extract it.
2. Open chrome://extensions in Chrome 140 or later and enable Developer mode. Older versions cannot apply this extension's API-key storage protection.
3. Choose Load unpacked and select the extracted ZIP folder. It must contain manifest.json. When building from source, run npm ci and npm run ci first, then load the generated dist folder.
4. Click the extension icon. Without an API key, it shows a welcome guide. Open the setup checklist in Settings and follow API key guide to get your own key from https://aistudio.google.com/apikey.
5. Paste your key into Settings and wait for the model list. Choose your target language, model, and optional keyboard trigger, then choose Finish setup. A saved key with unfinished setup keeps a Finish setup action in the popup. Once finished, the popup shows the standard view.
6. For local files, enable Allow access to file URLs in the extension's details.

We recommend the Gemini Flash-Lite family. For this release in September 2026, our choice is Gemini 3.5 Flash-Lite when it is offered in your model list. Other models are allowed, but some may not work with this extension. If one fails, choose another or use the recommended model. Existing users keep their saved model and language.

The API key guide opens in a separate tab. It explains how to create or choose a key in Google AI Studio, return to Settings, and translate your first selection. You can also open About from the popup or Settings. Support for the developer's chosen foundation is optional and is never needed to use the extension.

## Update a ZIP install

1. Let active translations finish. Keep the existing unpacked folder path to keep the extension identity and settings.
2. Replace its contents with the new extracted files.
3. Choose Reload for AI Translator at chrome://extensions.
4. Refresh existing web pages so they use the new content script.

Reloading interrupts active requests. Do not uninstall the extension as an update step because that can remove its stored settings.

## Update a source install

1. Keep the existing loaded folder path, including when Chrome loads the repository root.
2. Update the source, then run npm ci and npm run ci in the repository root.
3. Let active translations finish, reload AI Translator at chrome://extensions, and refresh web pages.

Version 1.2.1 fixes the source-root error "Cannot use import statement outside a module" by loading the built content script. Do not replace source files with ZIP files or change the loaded folder to repair this error.

## Use and recovery

Select text, then release the configured key or choose Translate Selected Text from the context menu. Control is the initial key. Use Off in Settings for context-menu-only translation. After starting a card, press Tab to reach it or Escape to close it.

Clicking outside closes cards and cancels unfinished requests. Retry and a language change clear the old output and start a new request. They do not keep a prior result. Copy is available on successful results where Chrome allows clipboard access; if it is blocked, select and copy the text normally.

If setup fails, check the saved key and refresh models. Choose another model if the saved one is unavailable. If Settings reports conflicting or unreadable values, use Reload saved settings before editing again. For a long selection, select less text. Provider quota needs time or an account check. Browser settings, the Chrome Web Store, and the built-in PDF viewer are unsupported.

The language list follows Google's documented Gemini language list, checked on September 5, 2026: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/google-models#language_support. It has 110 choices, including separate Simplified and Traditional Chinese choices. Choose your target language during setup. Translation quality can vary by language and text.

Your key is stored locally in the extension and is not synced. Language, model, and trigger choices can sync through Chrome. Google API use can have costs and limits. Read Google's pricing and data-use notes at https://ai.google.dev/gemini-api/docs/pricing and the Gemini API terms at https://ai.google.dev/gemini-api/terms. For AI Studio access issues, see https://ai.google.dev/gemini-api/docs/available-regions.
