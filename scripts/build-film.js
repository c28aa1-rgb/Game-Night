/**
 * Cuts and grades the footage behind Mafia's opening cinematic.
 *
 * The sources are 4K stock masters totalling ~376 MB and they live outside the
 * repo, same arrangement as build-art.js. This script holds the edit: which
 * clip, which in-point, how long, and how it's graded. Run it after dropping
 * the masters somewhere, then commit what lands in games/mafia/public/film/.
 *
 *   node scripts/build-film.js "C:/path/to/masters"
 *
 * Masters are named <pexels-id>.mp4. Everything is licensed under the Pexels
 * licence — free to use and modify, no attribution required. Ids are recorded
 * against each shot so a clip can be traced back to its source.
 *
 * Output is H.264 MP4 rather than WebM on purpose: this plays on whatever
 * browser happens to be on somebody's living-room TV, and H.264 is the one
 * codec every device decodes in hardware. The files carry no audio track —
 * every sound in the cinematic goes through the Web Audio bus in sfx.js, so
 * the video never fights the mixer and never trips autoplay restrictions.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const OUT = path.join(__dirname, '..', 'games', 'mafia', 'public', 'film');

/*
 * One palette across every shot, or the cut reads as a collage of stock.
 * Saturation comes most of the way out, shadows go cold, and contrast is
 * raised — but gently. The first pass at this crushed brightness in the base
 * grade AND again in several per-shot extras, which stacked into black
 * rectangles; the warm highlight push turned every bright source sepia. Keep
 * the amber coming from sources that already contain fire, not from here.
 */
const GRADE = [
  'eq=contrast=1.14:brightness=-0.012:saturation=0.60',
  'colorbalance=rs=-0.05:bs=0.09:rm=0.02:bm=-0.02:rh=-0.03:bh=0.05',
  "curves=all='0/0 0.22/0.175 0.78/0.86 1/1'",
  'vignette=PI/5.4',
  'noise=alls=4:allf=t+u',
].join(',');

/*
 * Elements are bright-on-black and get screen-blended over the scene shots, so
 * they must not be vignetted or crushed — that would eat the very pixels we
 * are compositing. They only get desaturated and contrast-boosted so the smoke
 * doesn't arrive bright white against a graded frame.
 */
const ELEMENT = [
  'eq=contrast=1.30:brightness=-0.03:saturation=0.35',
  'noise=alls=4:allf=t+u',
].join(',');

const W = 1600;
const H = 900;

/**
 * The edit. `at` and `len` are seconds into the master — chosen by scrubbing
 * each clip, not guessed, since several masters wander somewhere useless
 * partway through (34333686 turns bright and pretty; 38583194 leaves the ship).
 */
const SHOTS = [
  {
    // Seven seconds, not thirteen: the master drifts into bright blue cloud
    // around 8s and is full pink-and-orange by 12s. The bleak part is the top.
    name: 'calm', src: '34333686', at: 0.4, len: 7,
    note: 'Station against a dark world. Only the first seconds stay this bleak.',
  },
  {
    name: 'readout', src: '35516561', at: 0.8, len: 11,
    note: 'A green seven-segment counter running down. Life support, as it happens.',
    extra: 'eq=contrast=1.22:saturation=0.85',
  },
  {
    name: 'ship', src: '38583194', at: 0.0, len: 7.5,
    note: 'Interior bay framing a viewport. Cut before the camera leaves the ship.',
    // The master is a warm sunset. Cool the highlights hard or the bay reads
    // as a holiday, not a ship eleven months from anywhere.
    extra: 'colorbalance=rh=-0.16:gh=-0.03:bh=0.18:rm=-0.08:bm=0.10,eq=saturation=0.38',
  },
  {
    name: 'corridor', src: '19217898', at: 0.2, len: 9.5,
    note: 'The one shot doing the most pretending. Red is pushed through it.',
    // Source is already near-black, so this LIFTS rather than darkens, and
    // puts the red in the midtones where the walls are.
    extra: 'eq=brightness=0.075:contrast=1.04,colorbalance=rm=0.30:gm=-0.05:bm=-0.17',
  },
  {
    name: 'viewport', src: '30078590', at: 1.0, len: 12,
    note: 'Wide: a figure at the window, room still readable around them.',
    extra: 'eq=brightness=0.035',
  },
  {
    name: 'figure', src: '30078590', at: 27.0, len: 14,
    note: 'Same master, later. The camera has pushed in; the figure fills frame.',
    extra: 'eq=brightness=0.045',
  },
  {
    name: 'console', src: '13550579', at: 0.3, len: 10.5,
    note: 'Macro on a lit panel, shallow focus. Quiet enough to talk over.',
  },
  {
    name: 'smoke', src: '6894947', at: 7.5, len: 8, element: true,
    note: 'Element. Atmosphere leaving a compartment.',
  },
  {
    name: 'embers', src: '29936066', at: 5.0, len: 8, element: true,
    note: 'Element. Debris, for the moment the shielding goes.',
  },
];

function encode(shot, srcDir) {
  const src = path.join(srcDir, `${shot.src}.mp4`);
  if (!fs.existsSync(src)) {
    console.log(`${shot.name.padEnd(10)} SKIP — no master at ${src}`);
    return;
  }

  /*
   * Elements are screen-blended overlays that get scaled and blurred by the
   * compositor anyway, so they encode smaller and softer. Sparks on black are
   * pathologically expensive at full detail — the first pass spent 5.4 MB on
   * the ember burst alone, which is more than the rest of the cut combined.
   */
  const w = shot.element ? 1280 : W;
  const h = shot.element ? 720 : H;
  const crf = shot.element ? '31' : '26';

  const chain = [
    `scale=${w}:${h}:force_original_aspect_ratio=increase`,
    `crop=${w}:${h}`,
    shot.element ? ELEMENT : GRADE,
    shot.extra || null,
    'format=yuv420p',
  ].filter(Boolean).join(',');

  const dest = path.join(OUT, `${shot.name}.mp4`);
  const res = spawnSync(ffmpeg, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-ss', String(shot.at), '-t', String(shot.len), '-i', src,
    '-vf', chain,
    '-an',
    '-c:v', 'libx264', '-profile:v', 'main', '-preset', 'slow', '-crf', crf,
    '-g', '48', '-movflags', '+faststart',
    dest,
  ], { encoding: 'utf8' });

  if (res.status !== 0) {
    console.log(`${shot.name.padEnd(10)} FAILED\n${res.stderr}`);
    return;
  }
  const kb = fs.statSync(dest).size / 1024;
  console.log(`${shot.name.padEnd(10)} ${String(shot.len).padStart(5)}s  ${kb.toFixed(0).padStart(5)} KB   ${shot.note}`);
}

function main() {
  const srcDir = process.argv[2];
  if (!srcDir) {
    console.log('Pass the directory holding the <pexels-id>.mp4 masters.');
    console.log('They are not in the repo — see the header for why.');
    console.log('Optionally name shots to rebuild just those: … "src" corridor ship');
    return;
  }

  // Naming shots rebuilds only those. Grading is iterative and re-encoding all
  // nine to nudge one in-point is a waste of a minute you'll spend many times.
  const only = new Set(process.argv.slice(3));
  const shots = only.size ? SHOTS.filter((s) => only.has(s.name)) : SHOTS;

  fs.mkdirSync(OUT, { recursive: true });
  for (const shot of shots) encode(shot, srcDir);

  const total = SHOTS.reduce((sum, s) => {
    const f = path.join(OUT, `${s.name}.mp4`);
    return sum + (fs.existsSync(f) ? fs.statSync(f).size : 0);
  }, 0);
  console.log(`\ntotal ${(total / 1048576).toFixed(1)} MB across ${SHOTS.length} shots`);
}

main();
