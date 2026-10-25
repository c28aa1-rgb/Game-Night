import test from "node:test";
import assert from "node:assert/strict";
import { shuffleQueue } from "./queue.mjs";

const makeQueue = (counts) => counts.flatMap((n, i) => Array.from({ length: n }, (_, j) => ({
  id: `${i}-${j}`, singer: String(i), song: { title: `Song ${j}` },
})));
const repeats = (queue, previous = null) => {
  let count = 0;
  for (const entry of queue) {
    count += Number(entry.singer === previous);
    previous = entry.singer;
  }
  return count;
};

// Independent exhaustive search: compare against all possible singer orders,
// rather than repeating the production algorithm's lower-bound formula.
function optimum(counts, previous = -1, memo = new Map()) {
  if (counts.every(n => n === 0)) return 0;
  const key = `${counts}|${previous}`;
  if (memo.has(key)) return memo.get(key);
  let best = Infinity;
  for (let i = 0; i < counts.length; i++) {
    if (!counts[i]) continue;
    const rest = [...counts];
    rest[i]--;
    best = Math.min(best, Number(previous === i) + optimum(rest, i, memo));
  }
  memo.set(key, best);
  return best;
}

test("shuffle achieves the fewest possible repeats across small queues and current singers", () => {
  const memo = new Map();
  for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4; b++) for (let c = 0; c <= 4; c++) {
    const counts = [a, b, c];
    const queue = makeQueue(counts);
    for (const previous of [-1, 0, 1, 2]) {
      const singer = previous < 0 ? null : String(previous);
      for (let run = 0; run < 4; run++) {
        const result = shuffleQueue(queue, singer);
        assert.equal(repeats(result, singer), optimum(counts, previous, memo), `counts=${counts}, previous=${previous}`);
        assert.deepEqual(result.map(e => e.id).sort(), queue.map(e => e.id).sort());
        assert.ok(result.every(e => queue.includes(e)), "keep the original song entries");
      }
    }
  }
});

test("recognizes the same name regardless of case or incidental whitespace", () => {
  const queue = [" Rami ", "RAMI", "rami", "Alex", " alex "].map((singer, id) => ({ singer, id }));
  const before = structuredClone(queue);
  const result = shuffleQueue(queue);
  for (let i = 1; i < result.length; i++) {
    assert.notEqual(result[i].singer.trim().toLowerCase(), result[i - 1].singer.trim().toLowerCase());
  }
  assert.deepEqual(queue, before, "never mutate the input queue");
  assert.notEqual(shuffleQueue([{ singer: "Rami" }, { singer: "Alex" }], " RAMI ")[0].singer, "Rami");
});

test("handles a full queue, a single singer, and randomizes songs as well as singers", () => {
  for (const counts of [[100, 25, 25], [50, 50, 50], [150], Array(150).fill(1)]) {
    const queue = makeQueue(counts);
    const result = shuffleQueue(queue);
    const max = Math.max(...counts);
    assert.equal(repeats(result), Math.max(0, 2 * max - queue.length - 1));
    assert.equal(new Set(result.map(e => e.id)).size, queue.length);
  }
  const queue = makeQueue([3, 3, 3]);
  const orders = new Set(Array.from({ length: 20 }, () => shuffleQueue(queue).map(e => e.id).join(",")));
  assert.ok(orders.size > 1, "randomization should produce different valid orders");
});
