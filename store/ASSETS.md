# Draft Chrome Web Store artwork

These assets are drafts for review. They are not a Store approval or a release decision. Resolve the items in [LEGAL_REVIEW.md](LEGAL_REVIEW.md) before submission.

## Files

| File | Size | Content |
| --- | --- | --- |
| `assets/01-select-and-translate.png` | 1280 x 800 | Actual translation card after selecting example text and pressing Control. |
| `assets/02-latest-result.png` | 1280 x 800 | Actual popup capture with an example result, placed beside its source text. |
| `assets/03-guided-setup.png` | 1280 x 800 | Actual first-use Settings page with an empty API key field. |
| `assets/promo-small.png` | 440 x 280 | Purple icon and the message: Select text. Press Control. |
| `assets/promo-marquee.png` | 1400 x 560 | Optional wide promotional image in the same style. |
| `assets/store-icon-128.png` | 128 x 128 | A separate Store icon with 96 x 96 artwork and 16 pixels of transparent padding per side. |
| `source/icon-master.png` | 1254 x 1254 | The approved high-resolution purple option 5 artwork used to render the promotional images. |

The separate padded Store icon does not change the full-area toolbar icons. SVG is not included because Chrome does not support SVG icons declared in an extension manifest.

## Capture method

Run `npm run build`, then `node scripts/store-assets.mjs` from the repository root. The script uses the installed Playwright browser. `CHROME_PATH` can select another local Chrome for Testing executable, and `EXTENSION_PATH` can select another built extension folder.

The script creates and removes a temporary browser profile. It loads the actual built extension pages and content script. Page requests are blocked except for a local example page supplied by the script. Model and translation replies are replaced with fixed example responses inside the temporary extension worker. No real key, project, account, or provider request is used.

The source paragraph and its Ukrainian translation are original example content. The page and popup presentation label this content as an example. The setup screenshot is captured before the temporary fake key is entered. The key is never shown in any image. The popup capture retains the actual extension UI; the surrounding text is presentation copy, not part of the extension.

The script checks all six output dimensions, the blank setup key, the full key row and page header in view, a completed translation, the visible Copy button, and that no unexpected external page request was attempted. The setup page is scrolled down 40 pixels to show the complete key help text without changing the UI. Public PNG exports contain no text or EXIF metadata. The source master retains only PNG image data and required structural chunks. Visually review each image after regeneration, especially if the extension layout changes.

## Chrome image requirements

Verified against [Chrome's icon guide](https://developer.chrome.com/docs/extensions/develop/ui/configure-icons) and [Store image guide](https://developer.chrome.com/docs/webstore/images) on September 5, 2026. The Store guide requires a PNG icon, a 440 x 280 promotional image, and at least one screenshot. It allows up to five screenshots at 1280 x 800 or 640 x 400, and an optional 1400 x 560 marquee. It recommends 96 x 96 square artwork within a 128 x 128 icon canvas. Screenshots use square corners and the full image area.

Google can change its requirements. Check the current Developer Dashboard before uploading.
