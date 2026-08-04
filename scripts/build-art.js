/**
 * Turns the source key art into web-sized WebP for the hub.
 *
 * The originals are ~1.9 MB each, which is more than a landing page should
 * spend on three images. Run this after dropping a new poster in, then commit
 * the output: `node scripts/build-art.js <id>=<path-to-source> …`
 *
 *   node scripts/build-art.js draft="C:/Users/me/Downloads/draft.png"
 *
 * With no arguments it rebuilds nothing — the sources live outside the repo.
 */

const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const OUT = path.join(__dirname, '..', 'hub', 'public', 'art');
const WIDTH = 1200;

async function main() {
  const jobs = process.argv.slice(2).map((arg) => {
    const at = arg.indexOf('=');
    return { id: arg.slice(0, at), source: arg.slice(at + 1) };
  });

  if (!jobs.length) {
    console.log('Nothing to do. Pass <id>=<source path> for each poster.');
    return;
  }

  fs.mkdirSync(OUT, { recursive: true });

  for (const { id, source } of jobs) {
    const target = path.join(OUT, `${id}.webp`);
    const info = await sharp(source)
      .resize({ width: WIDTH, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(target);
    const before = fs.statSync(source).size;
    console.log(
      `${id.padEnd(10)} ${info.width}×${info.height}  ` +
      `${(before / 1024 / 1024).toFixed(2)} MB → ${(info.size / 1024).toFixed(0)} KB`
    );
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
