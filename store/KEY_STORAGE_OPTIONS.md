# API key storage design and alternatives

Research checked September 6, 2026. The publisher selected option D: remember an encrypted key on this device and use it automatically. This document records that design and its limits. Final implementation and release evidence belongs in [RELEASE_CHECKS.md](../RELEASE_CHECKS.md); the isolated proof below is not a substitute for those checks.

## Selected option D: remember the key on this device

Enter an API key once, keep it across normal Chrome restarts and updates, and use it without a password unlock. The design encrypts the API key with AES-256-GCM and stores a nonextractable `CryptoKey` in the extension's IndexedDB. WebCrypto supports storing these key objects through structured serialization, so they can be loaded in a later browser session. [WebCrypto key storage](https://www.w3.org/TR/webcrypto-2/#concepts-key-storage), [key serialization](https://www.w3.org/TR/webcrypto-2/#cryptokey-interface)

This provides real encryption of the saved API key. It does not provide an OS keychain or a password-protected vault. Nonextractable means ordinary scripts cannot export the encryption key through WebCrypto. It does not stop authorized extension code from using that key to decrypt data. The WebCrypto specification also does not guarantee protection of the underlying key material on disk. Someone who can read the browser profile, or run hostile code in the extension, may recover the API key. Browser storage deletion, extension removal, or losing the profile can require entering it again. [WebCrypto security limits](https://www.w3.org/TR/webcrypto-2/#security-considerations)

Chrome's secure-handling FAQ calls for strong encryption at rest and names AES as an example. This design uses that algorithm, but this research does not establish Chrome Web Store approval or settle every key-management requirement. Public wording must explain the local-profile limit and must not claim OS keychain protection. [Chrome secure-handling FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)

User-facing wording: **Remember my key on this device.** The key is encrypted and opens automatically. Someone with access to this browser profile may still recover it.

## Data agreement and controls

The data-sharing details remain visible in Settings. **Agree and connect to Google** records the agreement version and date for this browser profile. It enables new key entry or model loading for a safely migrated key. All Google API requests wait for that agreement, including refreshes and requests with an existing model cache. Normal restarts and updates keep the agreement.

**Withdraw data agreement** blocks new requests and aborts active ones locally. It keeps the encrypted key and preferences so the user can agree again later. **Remove saved key** deletes the ciphertext, encryption key and model cache. A non-secret revision marker remains to protect against stale Settings tabs. Neither action recalls data already sent to Google.

Google's use conditions are visible before use and apply through use, without an eligibility checkbox or identity checks. That notice and the data-agreement button serve different purposes.

## Offline proof and its scope

An isolated test used fake data in a separate Chrome 151.0.7922.34 profile on Mac. It saved AES-256-GCM ciphertext and a nonextractable encryption key in extension IndexedDB, fully closed Chrome, then opened the same profile again. Both before and after restart, decryption matched the fake input and `exportKey` was blocked. No real key, Google request, account, or production file was used.

Private local evidence is kept outside the repository at `/private/tmp/chrome-ai-translate-secret-audit/key-storage-probe/result.json`, with the probe beside it. The result contains booleans and the browser version, not credentials.

This tested a full browser restart, not an actual Chrome version update. Persistence across normal updates is expected when the extension keeps the same ID, browser profile, and compatible database schema, and no code or user action clears storage. Update migration must be tested before releasing an implemented version. The result does not prove resistance to copying or reading the profile.

## Final extension verification

Version 1.4.0 implements option D. The actual extension passed setup and agreement checks on Chrome 143.0.7499.4 on Mac, then the same temporary profile was fully closed and reopened with Chrome 151.0.7922.34. The encrypted key, its revision, agreement, language and model survived without a password or another acceptance. Native AES-GCM/IndexedDB tests also passed for corruption, failed writes, migration verification and removal. All tests used fake data. See [RELEASE_CHECKS.md](../RELEASE_CHECKS.md) for the complete scope. This is evidence for those versions, not a guarantee about future updates or profile loss.

## Checks for the selected implementation

- Use browser WebCrypto, a random 256-bit key, and a fresh random 12-byte IV for every AES-GCM write. Keep the encryption key nonextractable.
- Keep the encrypted record and encryption key in extension IndexedDB. Decrypt and call Google in the background worker. Do not send the saved API key to page content scripts.
- Prefer a legacy local key over a legacy synced key. Verify that the encrypted record can be decrypted before deleting plain text copies from both stores. If migration fails, retain the old value and block requests with a clear error. Do not silently fall back to plain text use or overwrite a damaged encrypted record.
- Make Remove saved key delete both the encrypted record and encryption key, invalidate model caches, and retain only the non-secret revision needed for stale-tab protection. Explain missing or damaged storage without silently deleting the user's key.
- Test that no Google request starts before agreement, including with migrated keys and cached models. Test agreement persistence, withdrawal during active work, and agreement again after withdrawal.
- Test full restart, worker restart, update migration, removal, failed decryption, and interrupted migration. Recheck disclosure, consent, screenshots, and the privacy policy against the implemented behavior.

## Other choices

The first three proposals were session-only storage, password-encrypted persistence, and entry for each translation. They remain alternatives. Session storage does not survive browser restart or extension update. Password-encrypted persistence requires an unlock step and must not save the password beside the encrypted key. Entry for every translation avoids keeping a saved key but adds repeated work. [Chrome session storage](https://developer.chrome.com/docs/extensions/reference/api/storage)

A native companion could use macOS Keychain and return the key when the OS allows access. This offers a separate OS security boundary, but needs another installed app and the `nativeMessaging` permission. It is outside the standalone-extension scope. [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging), [Apple Keychain services](https://developer.apple.com/documentation/security/keychain-services)

Google sign-in through `chrome.identity` could replace API keys with OAuth access tokens. Gemini supports OAuth, and Chrome handles its token cache and expiry. A production version still needs an OAuth client, suitable scopes, verification where required, and a clear project and billing setup. Sign-in or renewed consent may sometimes be needed. This is a larger authentication change, not a drop-in storage fix. [Gemini OAuth guide](https://ai.google.dev/gemini-api/docs/oauth), [Chrome identity](https://developer.chrome.com/docs/extensions/reference/api/identity)
