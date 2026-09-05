import path from "node:path";
import { fileURLToPath } from "node:url";
import CopyWebpackPlugin from "copy-webpack-plugin";

const root = path.dirname(fileURLToPath(import.meta.url));

export default {
  mode: "production",
  target: "web",
  devtool: false,
  entry: {
    background: "./background.js",
    content: "./content.js",
    popup: "./popup.js",
    settings: "./settings.js",
  },
  output: {
    path: path.join(root, "dist"),
    filename: "[name].js",
    clean: true,
    compareBeforeEmit: false,
  },
  optimization: {
    minimize: true,
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: "manifest.json",
          transform(content) {
            const manifest = JSON.parse(content.toString());
            for (const script of manifest.content_scripts) {
              script.js = script.js.map((file) => file.replace(/^dist\//, ""));
            }
            return `${JSON.stringify(manifest, null, 2)}\n`;
          },
        },
        "popup.html", "settings.html", "help.html", "about.html", "guide.css", "ui.css", "icon-16.png", "icon-32.png", "icon-48.png", "icon.png", "setup-key.png", "setup-language.png", "INSTALL.md", "PRIVACY.md", "LICENSE",
      ],
    }),
  ],
};
