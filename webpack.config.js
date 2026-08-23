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
      patterns: ["manifest.json", "popup.html", "settings.html", "icon.png"],
    }),
  ],
};
