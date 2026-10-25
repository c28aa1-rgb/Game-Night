import { useCallback, useEffect, useState } from "react";
import { findKaraokeVideos, lookupVideo, markUnplayable, parseVideoInput } from "./youtube.js";

// The TV finds the karaoke video for whoever is up. Phones never need the YouTube key.
export function useCurrentVideo(entry, session) {
  const [v, setV] = useState({ id: null, status: "idle", items: [], index: 0, error: null });
  const entryId = entry?.id ?? null;

  const find = useCallback(
    async (refresh = false) => {
      if (!entry) return;
      setV({ id: entry.id, status: "finding", items: [], index: 0, error: null });
      try {
        const items = await findKaraokeVideos(entry.song, { refresh, code: session.code, hostToken: session.hostToken });
        setV((cur) => (cur.id === entry.id ? { ...cur, status: "found", items, index: 0 } : cur));
      } catch (e) {
        setV((cur) => (cur.id === entry.id ? { ...cur, status: "error", error: { kind: e.kind || "network", message: e.message } } : cur));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entryId, session.code, session.hostToken]
  );

  useEffect(() => {
    if (entryId) find();
    else setV({ id: null, status: "idle", items: [], index: 0, error: null });
  }, [entryId, find]);

  const video = v.id === entryId && v.status === "found" ? v.items[v.index] : null;

  return {
    ...v,
    video,
    retry: () => find(true),
    another: () => setV((cur) => ({ ...cur, index: (cur.index + 1) % Math.max(1, cur.items.length) })),
    // A video refused to play: forget it for this song and move to the next version. Returns false if none left.
    dropCurrent: () => {
      if (!video || !entry) return false;
      const left = markUnplayable(entry.song.key, video.id);
      const items = left.length ? left : v.items.filter((x) => x.id !== video.id);
      setV((cur) => ({ ...cur, items, index: 0, status: items.length ? "found" : "error", error: items.length ? null : { kind: "empty", message: "No playable karaoke video for this song." } }));
      return items.length > 0;
    },
    useLink: async (text) => {
      const id = parseVideoInput(text);
      if (!id) return false;
      const item = await lookupVideo(id);
      setV({ id: entryId, status: "found", items: [item], index: 0, error: null });
      return true;
    },
  };
}
