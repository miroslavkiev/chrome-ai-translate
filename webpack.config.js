import path from 'path';
import pathBrowserify from 'path-browserify';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import TerserPlugin from "terser-webpack-plugin";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

class ZipAfterBuildPlugin {
  apply(compiler) {
    compiler.hooks.done.tapPromise("ZipAfterBuildPlugin", async () => {
      try {
        console.log("Creating zip archive of dist folder...");
        await execAsync("zip -r dist/chrome-ai-translate.zip dist/*");
        console.log("Zip archive created successfully.");
      } catch (error) {
        console.error("Error creating zip archive:", error);
      }
    });
  }
}

export default {
  mode: 'production',
  entry: {
    background: './background.js',
    content: './content.js',
    popup: './popup.js',
  },
  output: {
    path: path.resolve(path.dirname(''), 'dist'),
    filename: '[name].js',
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
          },
        },
      },
    ],
  },
  resolve: {
    extensions: ['.js'],
    fallback: {
      "fs": false,
      "path": "path-browserify"
    }
  },
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin()],
  },
  watch: true,
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: 'manifest.json', to: '' },
        { from: 'popup.html', to: '' },
        { from: 'icon.png', to: '' },
        { from: 'settings.html', to: '' },
        { from: 'settings.js', to: '' },
      ],
    }),
    new ZipAfterBuildPlugin(),
  ],
};