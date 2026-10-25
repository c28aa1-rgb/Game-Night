import { AnimatePresence, motion } from "framer-motion";
import { Fragment, useDeferredValue, useEffect, useMemo, useState } from "react";
import { FILTERS, LIBRARY, loadSongbook, searchLibrary } from "../lib/library.js";
import { searchCatalog } from "../lib/youtube.js";
import { useLocal } from "../lib/local.js";
import { spring, springPop, springSoft } from "../lib/motion.js";
import SongRow from "./SongRow.jsx";

const PAGE = 50;

// Songbook-style index: group alphabetical rows under their first letter.
function groupByLetter(songs) {
  const groups = [];
  for (const s of songs) {
    const ch = s.title.replace(/^[^a-z0-9]+/i, "")[0]?.toUpperCase() || "#";
    const letter = /[A-Z]/.test(ch) ? ch : "#";
    if (groups.at(-1)?.letter !== letter) groups.push({ letter, songs: [] });
    groups.at(-1).songs.push(s);
  }
  return groups;
}

// Search + filters + the song list. `queued(key)` says how many times a song is already in the queue.
export default function Songbook({ onPick, queued = () => 0, autoFocus = false }) {
  const { favorites } = useLocal();
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("popular");
  const [limit, setLimit] = useState(PAGE);
  const [bookSize, setBookSize] = useState(LIBRARY.length);
  const [catalog, setCatalog] = useState({ q: "", songs: [], status: "idle" });

  useEffect(() => {
    loadSongbook().then((lib) => setBookSize(lib.length));
  }, []);

  const showFavs = filter === "favs";
  const songs = useMemo(() => {
    if (showFavs) return favorites;
    return searchLibrary(deferred, filter, sort);
    // bookSize: re-run once the full songbook arrives
  }, [deferred, filter, sort, showFavs, favorites, bookSize]);

  useEffect(() => setLimit(PAGE), [deferred, filter, sort]);

  // Songs that aren't in the songbook: search Apple's catalogue as you type.
  useEffect(() => {
    const q = deferred.trim();
    if (q.length < 2 || showFavs) {
      setCatalog({ q: "", songs: [], status: "idle" });
      return;
    }
    setCatalog((c) => ({ ...c, status: "loading" }));
    let live = true;
    const t = setTimeout(() => {
      searchCatalog(q)
        .then((found) => live && setCatalog({ q, songs: found, status: "idle" }))
        .catch((e) => live && setCatalog({ q, songs: [], status: e.kind === "limited" ? "limited" : "error" }));
    }, 500);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [deferred, showFavs]);

  const searching = deferred.trim().length > 0;
  const bookKeys = useMemo(() => new Set(LIBRARY.map((s) => s.key)), [bookSize]);
  // Songbook hits first; Apple's catalogue fills gaps (a few extras, or the full list if nothing matched).
  const extra = searching && !showFavs ? catalog.songs.filter((s) => !bookKeys.has(s.key)).slice(0, songs.length ? 5 : 15) : [];
  const bookHits = searching ? songs.slice(0, 60) : songs;
  const results = searching ? [...bookHits, ...extra] : songs;
  const shown = results.slice(0, limit);
  const groups = !searching && !showFavs && sort === "az" ? groupByLetter(shown) : null;
  const filters = [...(favorites.length ? [{ id: "favs", label: "♥ Favourites" }] : []), ...FILTERS];

  return (
    <div className="songbook">
      <div className="book-tools">
        <div className="search" role="search">
          <svg className="search-icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
            <path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          <label htmlFor="q" className="sr-only">
            Search songs or artists
          </label>
          <input
            id="q"
            className="search-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search songs or artists"
            autoComplete="off"
            enterKeyHint="search"
            autoFocus={autoFocus}
          />
          <AnimatePresence>
            {query && (
              <motion.button
                className="search-clear"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={springPop}
              >
                ×
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <div className="filters" role="tablist" aria-label="Filter songs">
          {filters.map((f) => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} className={`filter ${filter === f.id ? "is-on" : ""}`} onClick={() => setFilter(f.id)}>
              {filter === f.id && <motion.span layoutId="filter-pill" className="filter-pill" transition={spring} />}
              <span className="filter-label">{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      <section className="book" aria-live="polite">
        <div className="book-head">
          <h2 className="book-count">
            {showFavs ? "Favourites" : searching ? "Results" : (filters.find((f) => f.id === filter)?.label ?? "Songbook")}{" "}
            <span className="vfd">{results.length.toLocaleString()}</span>
            {searching && catalog.status === "loading" && <span className="book-busy">checking more songs…</span>}
          </h2>
          {!searching && !showFavs && (
            <div className="sort" role="radiogroup" aria-label="Sort songs">
              {[
                ["popular", "Most popular"],
                ["az", "A–Z"],
              ].map(([id, label]) => (
                <button key={id} role="radio" aria-checked={sort === id} className={`sort-opt ${sort === id ? "is-on" : ""}`} onClick={() => setSort(id)}>
                  {sort === id && <motion.span layoutId="sort-pill" className="sort-pill" transition={spring} />}
                  <span className="filter-label">{label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {showFavs && results.length === 0 && <p className="hint">Nothing here yet. Tap the heart on any song to save it.</p>}
        {searching && results.length === 0 && catalog.status !== "loading" && (
          <p className="hint">No songs match “{deferred.trim()}”. Check the spelling, or try the artist's name.</p>
        )}

        {groups ? (
          groups.map((g, gi) => (
            <div key={`${filter}-${g.letter}`} className="letter-group">
              <motion.h3 className="letter" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(gi, 6) * 0.05, ...springSoft }}>
                {g.letter}
              </motion.h3>
              <ul className="rows">
                {g.songs.map((s, i) => (
                  <SongRow key={s.key} song={s} index={gi < 3 ? i + gi * 3 : 0} queued={queued(s.key)} onPick={onPick} />
                ))}
              </ul>
            </div>
          ))
        ) : (
          <ul className="rows" key={`${filter}-${sort}-${deferred}`}>
            {shown.map((s, i) => (
              <Fragment key={s.key}>
                {s.source === "catalog" && i === bookHits.length && bookHits.length > 0 && (
                  <li className="rows-divider" aria-hidden="true">
                    Other matches
                  </li>
                )}
                <SongRow song={s} index={i % PAGE} queued={queued(s.key)} onPick={onPick} />
              </Fragment>
            ))}
          </ul>
        )}

        {searching && catalog.status === "limited" && <p className="hint">Showing songbook results only. Apple's catalogue is busy, so try again in a minute.</p>}

        {results.length > limit && (
          <motion.button className="btn btn--ghost more" onClick={() => setLimit((l) => l + PAGE)} whileTap={{ scale: 0.97 }}>
            Show more songs <span className="vfd">{(results.length - limit).toLocaleString()}</span>
          </motion.button>
        )}
      </section>
    </div>
  );
}
