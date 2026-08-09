/* Build the two game-local React entry points; the Arcade remains one Node app. */
const esbuild = require('esbuild');
esbuild.build({
  entryPoints: ['./games/wavelength/src/tv.jsx', './games/wavelength/src/play.jsx'],
  outdir: './games/wavelength/public/assets',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  logLevel: 'info',
}).catch(() => process.exit(1));
