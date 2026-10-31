const esbuild = require('esbuild');

esbuild.build({
  entryPoints: { guide: './tv-guide/entry.jsx' },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  outdir: './hub/public/tv-guide/app',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  minify: true,
  logLevel: 'info',
}).catch(() => process.exit(1));
