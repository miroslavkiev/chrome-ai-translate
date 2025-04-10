# Chrome AI Translate Extension

This Chrome extension allows you to translate selected text into a target language using the Gemini AI API. The default target language is Ukrainian, but you can customize it through the extension's settings.

## Features
- Translate selected text into a target language.
- Choose the target language from a list of supported languages.
- Add and manage your Gemini API Key securely through the extension's settings.

## Installation

1. Clone this repository to your local machine:
   ```bash
   git clone https://github.com/your-username/chrome-ai-translate.git
   ```

2. Navigate to the project directory:
   ```bash
   cd chrome-ai-translate
   ```

3. Install dependencies and build the project:
   ```bash
   npm install
   npm run build
   ```

4. Open Chrome and navigate to `chrome://extensions/`.

5. Enable **Developer mode** in the top-right corner.

6. Click **Load unpacked** and select the `dist` folder inside the project directory.

7. The extension will now be added to Chrome.

## Usage

### Adding the Gemini API Key
1. Right-click the extension icon in the Chrome toolbar and select **Options**.
2. Enter your Gemini API Key in the provided field.
3. Click **Save**. A confirmation message will appear.

### Selecting the Target Language
1. In the same **Options** page, select your desired target language from the dropdown menu.
2. Click **Save** to apply the changes.

### Translating Text
1. Select any text on a webpage.
2. Either:
   - Right-click and choose **Translate Selected Text** from the context menu.
   - Press the **Control** key to trigger the translation directly.
3. A popup will appear with the translated text.

## Supported Languages
- Ukrainian (Default)
- English
- Spanish
- French
- German
- Russian

## Development

### Running in Watch Mode
To automatically rebuild the project when files are changed, run:
```bash
npm run watch
```

### File Structure
- `background.js`: Handles background tasks and API calls.
- `content.js`: Manages interactions with the webpage.
- `settings.html` and `settings.js`: Provide the UI and logic for managing the API Key and target language.
- `popup.html` and `popup.js`: Define the popup interface.
- `manifest.json`: Chrome extension configuration.
- `webpack.config.js`: Webpack configuration for building the project.

## License
This project is licensed under the MIT License.