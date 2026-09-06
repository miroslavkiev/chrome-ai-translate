import { SUPPORTED_LOCALES } from "./locales.mjs";

// One inventory is shared by packaging and verification to exclude unrelated files.
export const PACKAGE_FILES = Object.freeze([
  "INSTALL.md", "LICENSE", "PRIVACY.md", "about.html", "background.js", "content.js",
  "guide.css", "guide.js", "help.html", "icon-16.png", "icon-32.png", "icon-48.png",
  "icon.png", "manifest.json", "popup.html", "popup.js", "settings.html", "settings.js",
  "setup-key.png", "setup-language.png", "ui.css",
  ...SUPPORTED_LOCALES.map((locale) => `_locales/${locale}/messages.json`),
].sort());
