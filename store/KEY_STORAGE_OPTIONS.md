# API key storage options

Research checked September 5, 2026. This is a proposal for review. No storage option has been selected, and none of these changes has been added to the production extension. The current build still saves the API key without encryption in `chrome.storage.local`.

## Fourth option: remember the key on this device

The user's requested flow is possible in a standalone extension: enter an API key once, keep it across normal Chrome restarts and updates, and use it without a password unlock. The proposed design encrypts the API key with AES-256-GCM and stores a nonextractable `CryptoKey` in the extension's IndexedDB. WebCrypto supports storing these key objects through structured serialization, so they can be loaded in a later browser session. A fourth mock is pending user choice; this document does not approve or implement it. [WebCrypto key storage](https://www.w3.org/TR/webcrypto-2/#concepts-key-storage), [key serialization](https://www.w3.org/TR/webcrypto-2/#cryptokey-interface)

This provides real encryption of the saved API key. It does not provide an OS keychain or a password-protected vault. Nonextractable means ordinary scripts cannot export the encryption key through WebCrypto. It does not stop authorized extension code from using that key to decrypt data. The WebCrypto specification also does not guarantee protection of the underlying key material on disk. Someone who can read the browser profile, or run hostile code in the extension, may recover the API key. Browser storage deletion, extension removal, or losing the profile can require entering it again. [WebCrypto security limits](https://www.w3.org/TR/webcrypto-2/#security-considerations)

Chrome's secure-handling FAQ calls for strong encryption at rest and names AES as an example. This design uses that algorithm, but this research does not establish Chrome Web Store approval or settle every key-management requirement. Public wording must explain the local-profile limit and must not claim OS keychain protection. [Chrome secure-handling FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)

Suggested short wording for the mock: **Remember my key on this device.** The key is encrypted and opens automatically. Someone with access to this browser profile may still recover it.

## Offline proof and its scope

An isolated test used fake data in a separate Chrome 151.0.7922.34 profile on Mac. It saved AES-256-GCM ciphertext and a nonextractable encryption key in extension IndexedDB, fully closed Chrome, then opened the same profile again. Both before and after restart, decryption matched the fake input and `exportKey` was blocked. No real key, Google request, account, or production file was used.

Private local evidence is kept outside the repository at `/private/tmp/chrome-ai-translate-secret-audit/key-storage-probe/result.json`, with the probe beside it. The result contains booleans and the browser version, not credentials.

This tested a full browser restart, not an actual Chrome version update. Persistence across normal updates is expected when the extension keeps the same ID, browser profile, and compatible database schema, and no code or user action clears storage. Update migration must be tested before releasing an implemented version. The result does not prove resistance to copying or reading the profile.

## Implementation checks after user choice

- Use browser WebCrypto, a random 256-bit key, and a fresh random 12-byte IV for every AES-GCM write. Keep the encryption key nonextractable.
- Keep the encrypted record and encryption key in extension IndexedDB. Decrypt and call Google in the background worker. Do not send the saved API key to page content scripts.
- Verify that the encrypted record can be read before deleting the old plain text value. Handle an interrupted migration without losing the user's key or silently falling back to plain text storage.
- Make Remove key delete both the encrypted record and encryption key. If storage is missing or damaged, explain that the user needs to enter the key again.
- Test full restart, worker restart, update migration, removal, failed decryption, and interrupted migration. Recheck disclosure, consent, screenshots, and the privacy policy against the implemented behavior.

## Other choices

The first three proposals were session-only storage, password-encrypted persistence, and entry for each translation. They remain alternatives. Session storage does not survive browser restart or extension update. Password-encrypted persistence requires an unlock step and must not save the password beside the encrypted key. Entry for every translation avoids keeping a saved key but adds repeated work. [Chrome session storage](https://developer.chrome.com/docs/extensions/reference/api/storage)

A native companion could use macOS Keychain and return the key when the OS allows access. This offers a separate OS security boundary, but needs another installed app and the `nativeMessaging` permission. It is outside the standalone-extension scope. [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging), [Apple Keychain services](https://developer.apple.com/documentation/security/keychain-services)

Google sign-in through `chrome.identity` could replace API keys with OAuth access tokens. Gemini supports OAuth, and Chrome handles its token cache and expiry. A production version still needs an OAuth client, suitable scopes, verification where required, and a clear project and billing setup. Sign-in or renewed consent may sometimes be needed. This is a larger authentication change, not a drop-in storage fix. [Gemini OAuth guide](https://ai.google.dev/gemini-api/docs/oauth), [Chrome identity](https://developer.chrome.com/docs/extensions/reference/api/identity)
