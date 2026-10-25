import { randomInt } from "node:crypto";

const singerKey = (name) => name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();

// A singer with c songs needs c - 1 separators (c if they just sang).
// Any shortage is the minimum number of adjacent repeats still required.
function minimumRepeats(groups, previous, total) {
  let repeats = 0;
  for (const [key, songs] of groups) {
    repeats = Math.max(repeats, songs.length - (total - songs.length) - (key === previous ? 0 : 1));
  }
  return repeats;
}

export function shuffleQueue(queue, previousSinger = null) {
  const groups = new Map();
  for (const song of queue) {
    const key = singerKey(song.singer);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(song);
  }
  // Randomize the songs within each singer's turns, too.
  for (const songs of groups.values()) {
    for (let i = songs.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [songs[i], songs[j]] = [songs[j], songs[i]];
    }
  }

  const result = [];
  let previous = previousSinger == null ? null : singerKey(previousSinger);
  for (let remaining = queue.length; remaining > 0; remaining--) {
    const budget = minimumRepeats(groups, previous, remaining);
    const candidates = [];
    for (const [key, songs] of groups) {
      if (!songs.length) continue;
      const song = songs.pop();
      const cost = Number(key === previous) + minimumRepeats(groups, key, remaining - 1);
      songs.push(song);
      // Randomly choose only moves that preserve the best possible final result.
      if (cost === budget) candidates.push(key);
    }
    const key = candidates[randomInt(candidates.length)];
    result.push(groups.get(key).pop());
    previous = key;
  }
  return result;
}
