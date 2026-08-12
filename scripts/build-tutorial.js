const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['./tutorials/tutorial.jsx'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  outfile: './hub/public/tutorial/tutorial.js',
  minify: true,
  logLevel: 'info',
}).catch(() => process.exit(1));
