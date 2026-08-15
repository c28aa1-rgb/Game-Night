/* Build Herd Mentality's TV and phone React clients into game-local bundles. */
const esbuild = require('esbuild');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

esbuild.build({
  absWorkingDir: ROOT,
  entryPoints: [
    path.join(ROOT, 'games', 'herd-mentality', 'src', 'tv.jsx'),
    path.join(ROOT, 'games', 'herd-mentality', 'src', 'play.jsx'),
  ],
  outdir: path.join(ROOT, 'games', 'herd-mentality', 'public', 'assets'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  sourcemap: false,
  logLevel: 'info',
}).catch(() => process.exit(1));
