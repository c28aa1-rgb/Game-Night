/* Build the two game-local React entry points; the Arcade remains one Node app. */
const esbuild = require('esbuild');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
esbuild.build({
  absWorkingDir: ROOT,
  entryPoints: [
    path.join(ROOT, 'games', 'wavelength', 'src', 'tv.jsx'),
    path.join(ROOT, 'games', 'wavelength', 'src', 'play.jsx'),
  ],
  outdir: path.join(ROOT, 'games', 'wavelength', 'public', 'assets'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  logLevel: 'info',
}).catch(() => process.exit(1));
