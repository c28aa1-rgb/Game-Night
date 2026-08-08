/**
 * Renders the crew dialogue for Mafia's opening cinematic.
 *
 *   node scripts/build-voices.js
 *
 * Why this is a build step and not something the browser does live: the only
 * speech engine available at runtime is the Web Speech API, and on a typical
 * Windows machine that means three formant voices from the 1990s. Three of
 * those talking to each other is worse than one. So the crew are rendered once
 * here with neural voices and committed as audio; the ship's AI keeps the
 * synthesised voice on purpose, because the ship is a machine and it is the
 * same voice that narrates the rest of the game.
 *
 * Nothing in this script depends on the players, which is what makes it
 * possible — the opening happens before anyone has a role, so no line here
 * needs to say a name.
 *
 * Output lands in games/mafia/public/vox/ along with a manifest the cinematic
 * reads, so the edit's timing lives in data rather than being hardcoded twice.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const ffmpeg = require('ffmpeg-static');

const OUT = path.join(__dirname, '..', 'games', 'mafia', 'public', 'vox');
const TMP = path.join(OUT, '.tmp');

/**
 * Cast, chosen by audition. All three are US voices so they read as one crew
 * rather than three unrelated recordings.
 */
const CAST = {
  comms: { voice: 'en-US-AriaNeural', label: 'Comms' },
  engineering: { voice: 'en-US-GuyNeural', label: 'Engineering' },
  captain: { voice: 'en-US-ChristopherNeural', label: 'Captain' },
};

/**
 * The script, in order. `rate` and `pitch` carry the escalation — the opening
 * line is bored and slow, the middle is fast and high, and the realisation
 * drops back to almost nothing. `beat` groups lines so the cinematic knows
 * which shot each belongs under. `cut` marks a line that ends mid-word.
 */
const SCRIPT = [
  { beat: 'calm', who: 'comms', rate: '-14%', pitch: '-6Hz',
    text: 'Kestrel survey control, cycle four one zero two. Long range check. Nothing on the band, same as yesterday.' },

  { beat: 'wrong', who: 'comms', rate: '-4%', pitch: '+0Hz',
    text: "Control, I've lost the array. Not degraded. Gone." },
  { beat: 'wrong', who: 'captain', rate: '-8%', pitch: '-4Hz',
    text: 'Reroute through the backup mast.' },
  { beat: 'wrong', who: 'comms', rate: '-2%', pitch: '+3Hz',
    text: "That's what I'm looking at. The backup went first." },

  { beat: 'reactor', who: 'engineering', rate: '+16%', pitch: '+8Hz', radio: true,
    text: "Bridge. Bridge, the shielding's open. Manual override, deck four. Somebody did this by hand." },
  { beat: 'reactor', who: 'captain', rate: '+4%', pitch: '+2Hz',
    text: 'Say again?' },
  { beat: 'reactor', who: 'engineering', rate: '+26%', pitch: '+14Hz', radio: true, cut: true,
    text: "It's open from the inside. There's no fault, there's a" },

  { beat: 'loss', who: 'captain', rate: '+20%', pitch: '+8Hz',
    text: 'Seal four. Seal four! Comms, get the mafia out.' },
  { beat: 'loss', who: 'comms', rate: '+22%', pitch: '+12Hz',
    text: 'Mafia, mafia, mafia. This is survey vessel Kestrel, eleven months out. Reactor breach and casualties. Any vessel, any vessel' },
  { beat: 'loss', who: 'captain', rate: '-6%', pitch: '-6Hz',
    text: "It won't transmit. The array's gone." },

  { beat: 'sequence', who: 'comms', rate: '-18%', pitch: '-8Hz',
    text: 'Captain. The array. Then the backup. Then the shielding. In that order.' },
  { beat: 'sequence', who: 'captain', rate: '-26%', pitch: '-10Hz',
    text: 'I know.' },
  { beat: 'sequence', who: 'comms', rate: '-16%', pitch: '-6Hz',
    text: "That's not a fault. That's a sequence." },
  { beat: 'sequence', who: 'comms', rate: '-6%', pitch: '-2Hz', cut: true,
    text: "Captain, there's someone in here with m" },
];

/**
 * Engineering is shouting down a channel from a compartment that is on fire,
 * so it gets treated like one: band-limited to a radio's range, compressed
 * flat, driven into clipping, and mixed with a bed of pink noise.
 */
function radioTreat(src, dest) {
  const chain = [
    '[0:a]highpass=f=420,lowpass=f=2700',
    'acompressor=threshold=0.06:ratio=9:attack=3:release=70',
    'volume=2.6,alimiter=limit=0.82[v]',
  ].join(',');

  const res = spawnSync(ffmpeg, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', src,
    '-f', 'lavfi', '-i', 'anoisesrc=c=pink:r=24000:a=0.05',
    '-filter_complex', `${chain};[v][1:a]amix=inputs=2:weights=1 0.34:duration=first[out]`,
    '-map', '[out]', '-c:a', 'libmp3lame', '-b:a', '64k', '-ac', '1',
    dest,
  ], { encoding: 'utf8' });

  if (res.status !== 0) throw new Error(`radio treatment failed: ${res.stderr}`);
}

/**
 * A line that ends mid-word needs to actually stop dead, not fade politely.
 * This trims the trailing silence the engine leaves and hard-cuts the tail.
 */
function hardCut(src, dest) {
  const res = spawnSync(ffmpeg, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', src,
    '-af', 'silenceremove=stop_periods=-1:stop_duration=0.12:stop_threshold=-42dB',
    '-c:a', 'libmp3lame', '-b:a', '64k', '-ac', '1',
    dest,
  ], { encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`hard cut failed: ${res.stderr}`);
}

function durationOf(file) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', file, '-f', 'null', '-'], { encoding: 'utf8' });
  const m = (r.stderr || '').match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : 0;
}

async function main() {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });

  const manifest = [];

  for (let i = 0; i < SCRIPT.length; i += 1) {
    const line = SCRIPT[i];
    const cast = CAST[line.who];
    const id = String(i + 1).padStart(2, '0');
    const name = `${id}-${line.who}`;

    const tts = new MsEdgeTTS();
    await tts.setMetadata(cast.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const stage = path.join(TMP, name);
    fs.mkdirSync(stage, { recursive: true });
    const { audioFilePath } = await tts.toFile(stage, line.text, {
      rate: line.rate,
      pitch: line.pitch,
      volume: '+0%',
    });

    const final = path.join(OUT, `${name}.mp3`);
    if (line.radio) {
      radioTreat(audioFilePath, final);
    } else if (line.cut) {
      hardCut(audioFilePath, final);
    } else {
      fs.copyFileSync(audioFilePath, final);
    }

    const dur = durationOf(final);
    manifest.push({
      file: `${name}.mp3`,
      beat: line.beat,
      who: cast.label,
      text: line.text + (line.cut ? '—' : ''),
      seconds: +dur.toFixed(2),
      cut: !!line.cut,
    });

    console.log(
      `${name.padEnd(16)} ${cast.voice.padEnd(24)} ${dur.toFixed(1).padStart(5)}s` +
      `${line.radio ? '  [radio]' : ''}${line.cut ? '  [cut]' : ''}`,
    );
  }

  fs.writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.rmSync(TMP, { recursive: true, force: true });

  const total = manifest.reduce((s, l) => s + l.seconds, 0);
  const bytes = manifest.reduce((s, l) => s + fs.statSync(path.join(OUT, l.file)).size, 0);
  console.log(`\n${manifest.length} lines, ${total.toFixed(1)}s of dialogue, ${(bytes / 1024).toFixed(0)} KB`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
