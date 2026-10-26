import { useCallback, useEffect, useState } from "react";
import { findKaraokeVideos, lookupVideo, markUnplayable, parseVideoInput, rememberUnplayableVideos } from "./youtube.js";
import { useRoom } from "./room.jsx";

// The TV finds the karaoke video for whoever is up. Phones never need the YouTube key.
export function useCurrentVideo(entry, session) {
  const { state: room, send } = useRoom();
  const [v, setV] = useState({ id: null, status: "idle", items: [], index: 0, error: null });
  const entryId = entry?.id ?? null;
  const rejectedKey = room?.rejectedVideoIds?.join("\n") || "";

  useEffect(() => {
    rememberUnplayableVideos(rejectedKey ? rejectedKey.split("\n") : []);
  }, [rejectedKey]);

  const find = useCallback(
    async (refresh = false) => {
      if (!entry) return;
      setV({ id: entry.id, status: "finding", items: [], index: 0, error: null });
      try {
        const items = await findKaraokeVideos(entry.song, { refresh, code: session.code, hostToken: session.hostToken });
        setV((cur) => (cur.id === entry.id ? { ...cur, status: "found", items, index: 0 } : cur));
        await send("videoChoices", { entryId: entry.id, items });
      } catch (e) {
        setV((cur) => (cur.id === entry.id ? { ...cur, status: "error", error: { kind: e.kind || "network", message: e.message } } : cur));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entryId, session.code, session.hostToken, send]
  );

  useEffect(() => {
    if (entryId) find();
    else setV({ id: null, status: "idle", items: [], index: 0, error: null });
  }, [entryId, find]);

  const activeId = room?.current?.id === entryId ? room.videoId : null;
  const activeIndex = activeId ? v.items.findIndex((item) => item.id === activeId) : -1;
  const video = v.id === entryId && v.status === "found" ? v.items[activeIndex >= 0 ? activeIndex : v.index] : null;

  return {
    ...v,
    video,
    retry: () => find(true),
    another: () => {
      if (v.items.length < 2) return;
      const currentIndex = Math.max(0, activeIndex >= 0 ? activeIndex : v.index);
      const next = v.items[(currentIndex + 1) % v.items.length];
      send("selectVideo", { videoId: next.id }).catch(() => {});
    },
    // A video refused to play: forget it for this song and move to the next version. Returns false if none left.
    dropCurrent: () => {
      if (!video || !entry) return false;
      const left = markUnplayable(entry.song.key, video.id);
      send("rejectVideo", { videoId: video.id }).catch(() => {});
      const items = left.length ? left : v.items.filter((x) => x.id !== video.id);
      setV((cur) => ({ ...cur, items, index: 0, status: items.length ? "found" : "error", error: items.length ? null : { kind: "empty", message: "No playable karaoke video for this song." } }));
      return items.length > 0;
    },
    useLink: async (text) => {
      const id = parseVideoInput(text);
      if (!id) return false;
      const item = await lookupVideo(id);
      await send("videoChoices", { entryId, items: [item] });
      setV({ id: entryId, status: "found", items: [item], index: 0, error: null });
      return true;
    },
  };
}
