/* eslint-env node */

const fs = require('node:fs');
const path = require('node:path');

const baseConfig = require('kolibri-build/src/webpack.config.base');
const { merge } = require('webpack-merge');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const BundleTracker = require('kolibri-build/src/webpackBundleTracker');
const CircularDependencyPlugin = require('circular-dependency-plugin');

const WebpackRTLPlugin = require('kolibri-build/src/webpackRtlPlugin');

const { InjectManifest } = require('workbox-webpack-plugin');

// Bind versus advertised address: see webpackDevServerAddress.js. settings.py mirrors it.
const {
  getWebpackDevHost,
  getWebpackDevPort,
  getWebpackDevPublicHost,
  getWebpackDevPublicPort,
} = require('./webpackDevServerAddress');

const djangoProjectDir = path.resolve('contentcuration');
const staticFilesDir = path.resolve(djangoProjectDir, 'contentcuration', 'static');
const srcDir = path.resolve(djangoProjectDir, 'contentcuration', 'frontend');

const bundleOutputDir = path.resolve(staticFilesDir, 'studio');

// Perseus's math is rendered with MathJax, which loads its fonts from a folder:
// copy them where Django serves them, at /static/mathjax/fonts.
function copyMathjaxFonts() {
  const rendererDir = path.dirname(require.resolve('@khanacademy/mathjax-renderer/package.json'));
  const mathjaxDir = path.dirname(
    require.resolve('mathjax-full/package.json', { paths: [rendererDir] }),
  );
  const source = path.join(mathjaxDir, 'ts', 'output', 'chtml', 'fonts', 'tex-woff-v2');
  const target = path.resolve(staticFilesDir, 'mathjax', 'fonts');
  fs.mkdirSync(target, { recursive: true });
  for (const file of fs.readdirSync(source)) {
    fs.copyFileSync(path.join(source, file), path.join(target, file));
  }
}

module.exports = (env = {}) => {
  copyMathjaxFonts();
  const dev = env.dev;
  const hot = env.hot;
  const base = baseConfig({ mode: dev ? 'development' : 'production', hot, cache: dev, transpile: !dev });

  if (String(base.module.rules[1].test) !== String(/\.css$/)) {
    throw Error('Check base webpack configuration for update of location of css loader');
  }

  const rootDir = __dirname;
  const rootNodeModules = path.join(rootDir, 'node_modules');
  const baseCssLoaders = base.module.rules[1].use;
  // For pnpm, this directory holds symlinks to a particular version of each package, not unlike
  // a hoisted node_modules directory.
  const pnpmNodeModules = path.join(rootDir, 'node_modules', '.pnpm', 'node_modules');

  const devServerHost = getWebpackDevHost();
  const devServerPort = getWebpackDevPort();
  const devPublicHost = getWebpackDevPublicHost();
  const devPublicPort = getWebpackDevPublicPort();
  const devPublicPath = `http://${devPublicHost}:${devPublicPort}/dist/`;

  const workboxPlugin = new InjectManifest({
    swSrc: path.resolve(srcDir, 'serviceWorker/index.js'),
    swDest: 'serviceWorker.js',
    exclude: dev ? [/./] : [/\.map$/, /^manifest.*\.js$/]
  });

  if (dev) {
    // Suppress the "InjectManifest has been called multiple times" warning by reaching into
    // the private properties of the plugin and making sure it never ends up in the state
    // where it makes that warning.
    // https://github.com/GoogleChrome/workbox/blob/v6/packages/workbox-webpack-plugin/src/inject-manifest.ts#L260-L282
    // Solution taken from here:
    // https://github.com/GoogleChrome/workbox/issues/1790#issuecomment-1241356293
    Object.defineProperty(workboxPlugin, "alreadyCalled", {
      get() {
        return false
      },
      set() {
        // do nothing; the internals try to set it to true, which then results in a warning
        // on the next run of webpack.
      },
    })
  }

  const config = merge(base, {
    context: srcDir,
    entry: {
      // Use arrays for every entry to allow for hot reloading.
      // The rtlcss-stub must come first to set up the window global before any CSS chunk loading.
      channel_edit: ['./shared/rtlcss-stub.js', './channelEdit/index.js'],
      channel_list: ['./shared/rtlcss-stub.js', './channelList/index.js'],
      settings: ['./shared/rtlcss-stub.js', './settings/index.js'],
      accounts: ['./shared/rtlcss-stub.js', './accounts/index.js'],
      administration: ['./shared/rtlcss-stub.js', './administration/index.js'],
      // The page Khan Academy's question editor previews questions in
      perseus_preview: ['./shared/rtlcss-stub.js', './perseusPreview/index.js'],
      // A simple code sandbox to play with components in
      pdfJSWorker: ['pdfjs-dist/build/pdf.worker.entry.js'],
      // Utility for taking screenshots inside an iframe sandbox
      htmlScreenshot: ['./shared/utils/htmlScreenshot.js'],
    },
    output: {
      filename: dev ? '[name].js' : '[name]-[fullhash].js',
      chunkFilename: '[name]-[id]-[fullhash].js',
      path: bundleOutputDir,
      publicPath: dev ? devPublicPath : '/static/studio/',
      pathinfo: dev,
    },
    devServer: {
      port: devServerPort,
      host: devServerHost,
      client: {
        // Otherwise the socket URL derives from the bind address, which the browser cannot reach.
        webSocketURL: {
          hostname: devPublicHost,
          port: devPublicPort,
        },
      },
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      allowedHosts: [...new Set(['127.0.0.1', 'localhost', devServerHost, devPublicHost])]
    },
    module: {
      rules: [
        {
          test: /\.m?js/,
          resolve: {
            fullySpecified: false
          }
        },
        {
          test: /\.styl(us)?$/,
          use: baseCssLoaders.concat(require.resolve('stylus-loader')),
        },
      ],
    },
    resolve: {
      alias: {
        // explicit alias definitions (rather than modules) for speed
        shared: path.resolve(srcDir, 'shared'),
        frontend: srcDir,
        // needed to reference Vuetify styles in the shadow DOM
        vuetify: path.resolve('node_modules', 'vuetify'),
        static: staticFilesDir,
      },
      extensions: ['.js', '.vue', '.css'],
      symlinks: true,
      modules: [rootNodeModules, pnpmNodeModules],
    },
    resolveLoader: {
      modules: [rootNodeModules],
    },
    plugins: [
      new BundleTracker({
        filename: path.resolve(djangoProjectDir, 'build', 'webpack-stats.json'),
      }),
      new MiniCssExtractPlugin({
        filename: dev ? '[name].css' :'[name]-[fullhash].css',
        chunkFilename: dev ? '[name]-[id].css' :'[name]-[fullhash]-[id].css',
      }),
      new WebpackRTLPlugin({
        minify: false,
      }),
      new CircularDependencyPlugin({
        // exclude detection of files based on a RegExp
        exclude: /a\.js|node_modules/,
        // include specific files based on a RegExp
        include: /frontend/,
        // add errors to webpack instead of warnings
        failOnError: false,
        // allow import cycles that include an asyncronous import,
        // e.g. via import(/* webpackMode: "weak" */ './file.js')
        allowAsyncCycles: false,
        // set the current working directory for displaying module paths

        cwd: process.cwd(),
      }),
      workboxPlugin,
    ],
    stats: 'normal',
  });
  return config;
};
