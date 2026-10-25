import { motion } from "framer-motion";
import { songCode } from "../lib/youtube.js";
import { local, useLocal } from "../lib/local.js";
import { easeOut, spring } from "../lib/motion.js";
import Wipe from "./Wipe.jsx";

export default function SongRow({ song, index = 0, queued = 0, onPick }) {
  const { favorites } = useLocal();
  const fav = favorites.some((s) => s.key === song.key);

  return (
    <motion.li
      className="row wipe-trigger"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: easeOut, delay: Math.min(index, 14) * 0.028 }}
    >
      <span className="row-code code">{songCode(song.key)}</span>
      <button className="row-main" onClick={() => onPick(song)} aria-label={`Add ${song.title} by ${song.artist}`}>
        {song.art && <img className="row-art" src={song.art} alt="" loading="lazy" />}
        <span className="row-text">
          <span className="row-title">
            <Wipe>{song.title}</Wipe>
          </span>
          <span className="row-meta">
            {song.artist}
            {song.year ? ` · ${song.year}` : ""}
            {song.genre ? ` · ${song.genre}` : ""}
          </span>
        </span>
        {song.duet && <span className="tag">Duet</span>}
        {queued > 0 && (
          <motion.span className="tag tag--pink" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring}>
            In queue{queued > 1 ? ` ×${queued}` : ""}
          </motion.span>
        )}
      </button>
      <motion.button
        className={`icon-btn icon-btn--quiet ${fav ? "is-on" : ""}`}
        onClick={() => local.toggleFavorite(song)}
        aria-pressed={fav}
        aria-label={fav ? `Remove ${song.title} from favourites` : `Save ${song.title} to favourites`}
        whileTap={{ scale: 0.8 }}
        transition={spring}
      >
        <motion.svg width="18" height="18" viewBox="0 0 24 24" animate={{ scale: fav ? [1, 1.35, 1] : 1 }} transition={{ duration: 0.3 }} aria-hidden="true">
          <path
            d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z"
            fill={fav ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </motion.svg>
      </motion.button>
      <motion.button className="btn btn--small row-reserve" onClick={() => onPick(song)} whileTap={{ scale: 0.95 }} tabIndex={-1}>
        Add
      </motion.button>
    </motion.li>
  );
}
