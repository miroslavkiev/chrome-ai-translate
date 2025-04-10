import path from 'path';
import pathBrowserify from 'path-browserify';
import CopyWebpackPlugin from 'copy-webpack-plugin';

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
    minimize: false,
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
  ],
};