import { useSyncExternalStore } from "react";

// Per-device things that never leave this browser: who I am, my favourites, names I've used.
const KEY = "nk.local.v1";

function read() {
  try {
    return { deviceId: null, name: "", favorites: [], ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { deviceId: null, name: "", favorites: [] };
  }
}

let state = read();
if (!state.deviceId) {
  state.deviceId = crypto.randomUUID?.() || `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  persist();
}

const subs = new Set();
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: still works for this visit */
  }
}
function update(patch) {
  state = { ...state, ...patch };
  persist();
  subs.forEach((f) => f());
}

export const local = {
  get: () => state,
  setName: (name) => update({ name: name.trim().slice(0, 30) }),
  toggleFavorite: (song) => {
    const has = state.favorites.some((s) => s.key === song.key);
    const slim = { key: song.key, title: song.title, artist: song.artist, year: song.year, genre: song.genre, art: song.art, source: song.source };
    update({ favorites: has ? state.favorites.filter((s) => s.key !== song.key) : [slim, ...state.favorites].slice(0, 80) });
  },
};

export function useLocal() {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => state
  );
}

// The TV remembers its room for this tab so a refresh lands back in the same party.
const HOST = "nk.host";
export const hostSession = {
  get() {
    try {
      return JSON.parse(sessionStorage.getItem(HOST) || "null");
    } catch {
      return null;
    }
  },
  set(v) {
    try {
      if (v) sessionStorage.setItem(HOST, JSON.stringify(v));
      else sessionStorage.removeItem(HOST);
    } catch {
      /* ignore */
    }
  },
};
