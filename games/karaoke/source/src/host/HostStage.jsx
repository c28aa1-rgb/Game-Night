import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRoom } from "../lib/room.jsx";
import { useToast } from "../lib/toast.jsx";
import { useMic } from "../lib/useMic.jsx";
import { YTState, useYouTubePlayer } from "../lib/useYouTubePlayer.js";
import { songCode } from "../lib/youtube.js";
import { screen, spring, springSoft } from "../lib/motion.js";
import MicButton from "../components/MicButton.jsx";
import MicInputSelect from "../components/MicInputSelect.jsx";

const BEAT = 0.75;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function HostStage({ v }) {
  const { state, send } = useRoom();
  const toast = useToast();
  const { status: micStatus, settings: micSettings, updateSettings, latency, inputMode, chooseInputMode } = useMic();
  const entry = state.current;
  const next = state.queue[0];
  const stageRef = useRef(null);
  const mountRef = useRef(null);
  const [chrome, setChrome] = useState(true);
  const [count, setCount] = useState(4); // count-in dots left; 0 = rolling
  const [blocked, setBlocked] = useState(false);
  const [videoMenu, setVideoMenu] = useState(false);
  const [audioMenu, setAudioMenu] = useState(false);
  const [musicVolume, setMusicVolume] = useState(80);
  const [musicMuted, setMusicMuted] = useState(false);
  const [switchingVideo, setSwitchingVideo] = useState(false);
  const hideTimer = useRef();
  const finishRef = useRef(() => {});
  const videoMenuOpen = useRef(false);
  videoMenuOpen.current = videoMenu || audioMenu;

  const player = useYouTubePlayer(mountRef, v.video?.id, {
    onEnd: () => finishRef.current(),
    onError: () => {
      if (v.dropCurrent()) toast("That version won't play here. Trying another.");
      else {
        toast("No playable karaoke video for this song. Moving on.");
        send("next", { from: "playing" }).catch(() => {});
      }
    },
  });
  const playing = player.state === YTState.PLAYING;
  finishRef.current = () => send("finish").catch((e) => toast(e.message));

  useEffect(() => {
    if (!player.ready) return;
    if (musicMuted) player.mute();
    else {
      player.setVolume(musicVolume);
      player.unMute();
    }
  }, [player.ready, musicMuted, musicVolume]);

  // Count-in once the video is ready, then roll. Restarts if the video version changes.
  useEffect(() => {
    if (!player.ready) return;
    setCount(4);
    let n = 4;
    const t = setInterval(() => {
      n -= 1;
      setCount(n);
      if (n === 0) {
        clearInterval(t);
        player.play();
      }
    }, BEAT * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.ready, v.video?.id]);

  // Browsers can block sound until someone taps the TV page once.
  useEffect(() => {
    if (count !== 0) return;
    const t = setTimeout(() => {
      if (player.state === YTState.UNSTARTED || player.state === YTState.CUED) setBlocked(true);
    }, 1600);
    if (playing) setBlocked(false);
    return () => clearTimeout(t);
  }, [count, player.state, playing]);

  const wake = useCallback(() => {
    setChrome(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!videoMenuOpen.current) setChrome(false);
    }, 3000);
  }, []);
  useEffect(() => {
    wake();
    return () => clearTimeout(hideTimer.current);
  }, [wake]);

  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };

  const chooseVideo = async (videoId) => {
    setSwitchingVideo(true);
    try {
      await send("selectVideo", { videoId });
      setVideoMenu(false);
      wake();
    } catch (error) {
      toast(error.message);
    } finally {
      setSwitchingVideo(false);
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.("input, textarea")) return;
      if (e.key === " ") {
        e.preventDefault();
        player.toggle();
      } else if (e.key.toLowerCase() === "f") fullscreen();
      else if (e.key.toLowerCase() === "n") finishRef.current();
      wake();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!entry) return null;
  const pct = player.time.duration ? (player.time.current / player.time.duration) * 100 : 0;
  const showChrome = chrome || !playing;

  return (
    <motion.main className={`stage ${showChrome ? "" : "stage--quiet"}`} ref={stageRef} {...screen}>
      <motion.div
        className="stage-video"
        initial={{ clipPath: "inset(48% 0% 48% 0%)" }}
        animate={{ clipPath: "inset(0% 0% 0% 0%)" }}
        transition={{ duration: 0.7, ease: [0.05, 0.7, 0.1, 1], delay: 0.1 }}
      >
        <div ref={mountRef} className="stage-mount" />
      </motion.div>
      {/* The iframe swallows pointer events; this layer keeps our controls in charge. */}
      <div className="stage-catch" onPointerMove={wake} onClick={() => (wake(), count === 0 && player.toggle())} aria-hidden="true" />

      {/* Count-in: four dots, like the karaoke machines. */}
      <AnimatePresence>
        {count > 0 && (
          <motion.div className="countin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.3 } }}>
            {!v.video || !player.ready ? (
              <p className="countin-wait">{v.status === "error" ? v.error?.message : "Getting the video ready…"}</p>
            ) : (
              <>
                <span className="countin-who">
                  {entry.singer} · {entry.song.title}
                </span>
                <div className="dots dots--big">
                  {[0, 1, 2, 3].map((i) => (
                    <motion.span
                      key={i}
                      initial={{ scale: 0 }}
                      animate={i < count ? { scale: 1, opacity: 1 } : { scale: 0.3, opacity: 0 }}
                      transition={i < count ? { type: "spring", stiffness: 500, damping: 20, delay: i * 0.06 } : { duration: 0.22, ease: [0.3, 0, 1, 1] }}
                    />
                  ))}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Next up: always on screen while someone sings. */}
      <motion.aside className="nextup" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4, ...springSoft }}>
        <span className="label">Next up</span>
        <AnimatePresence mode="wait" initial={false}>
          {next ? (
            <motion.div key={next.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={spring}>
              <strong>{next.singer}</strong>
              <span>{next.song.title}</span>
            </motion.div>
          ) : (
            <motion.div key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <span>Nobody yet. Scan the code to add a song.</span>
            </motion.div>
          )}
        </AnimatePresence>
        {state.queue.length > 1 && <span className="nextup-more">+{state.queue.length - 1} more in the queue</span>}
      </motion.aside>

      <AnimatePresence>
        {blocked && (
          <motion.button
            className="tap-play"
            onClick={() => {
              player.play();
              setBlocked(false);
            }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={spring}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5.5v13l10.5-6.5L8 5.5Z" fill="currentColor" />
            </svg>
            Tap to start the music
          </motion.button>
        )}
      </AnimatePresence>

      <footer className="stage-bottom">
        <AnimatePresence>
          {showChrome && (
            <motion.div className="controls" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16, transition: { duration: 0.2 } }} transition={springSoft}>
              <button className="btn btn--ghost" onClick={() => send("stop").catch((e) => toast(e.message))}>
                Back to queue
              </button>
              <div className="controls-mid">
                <motion.button className="round" onClick={player.restart} whileTap={{ scale: 0.88 }} aria-label="Restart song">
                  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </motion.button>
                <motion.button className="round round--big" onClick={player.toggle} whileTap={{ scale: 0.9 }} aria-label={playing ? "Pause" : "Play"} disabled={count > 0}>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.svg key={playing ? "pause" : "play"} width="26" height="26" viewBox="0 0 24 24" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ duration: 0.12 }} aria-hidden="true">
                      {playing ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" /> : <path d="M8 5.5v13l10.5-6.5L8 5.5Z" fill="currentColor" />}
                    </motion.svg>
                  </AnimatePresence>
                </motion.button>
                <motion.button className="round" onClick={() => finishRef.current()} whileTap={{ scale: 0.88 }} aria-label="End song">
                  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 5.5v13L15 12 6 5.5ZM17 5.5v13" fill="currentColor" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </motion.button>
              </div>
              <div className="controls-right">
                <MicButton compact />
                <div className="stage-audio-picker">
                  <button className="btn btn--ghost" aria-expanded={audioMenu} onClick={() => { setAudioMenu((open) => !open); wake(); }}>
                    Audio &amp; volume
                  </button>
                  <AnimatePresence>
                    {audioMenu && (
                      <motion.div className="stage-audio-menu" initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}>
                        <div className="stage-audio-menu-title">
                          <strong>Sound check</strong>
                          <button className="stage-audio-close" aria-label="Close audio controls" onClick={() => setAudioMenu(false)}>×</button>
                        </div>
                        <label className="stage-audio-slider">
                          <span><b>Song volume</b><output>{musicMuted ? "Muted" : `${musicVolume}%`}</output></span>
                          <input type="range" min="0" max="100" step="1" value={musicVolume} onChange={(e) => { setMusicVolume(Number(e.target.value)); if (Number(e.target.value) > 0) setMusicMuted(false); }} />
                        </label>
                        <button className="btn btn--ghost stage-audio-mute" aria-pressed={musicMuted} onClick={() => setMusicMuted((muted) => !muted)}>
                          {musicMuted ? "Unmute song" : "Mute song"}
                        </button>
                        <label className="stage-audio-slider">
                          <span><b>Mic input gain</b><output>{Math.round(micSettings.inputGain * 100)}%</output></span>
                          <input type="range" min="0" max="2" step="0.05" value={micSettings.inputGain} onChange={(e) => updateSettings({ inputGain: Number(e.target.value) })} />
                        </label>
                        <label className="stage-audio-slider">
                          <span><b>Microphone monitor</b><output>{Math.round(micSettings.volume * 100)}%</output></span>
                          <input type="range" min="0" max="1.5" step="0.05" value={micSettings.volume} onChange={(e) => updateSettings({ volume: Number(e.target.value) })} />
                        </label>
                        <MicInputSelect />
                        <label className="stage-audio-mode">
                          <span><b>Mic processing</b></span>
                          <select value={inputMode} disabled={micStatus === "starting"} onChange={(e) => chooseInputMode(e.target.value)}>
                            <option value="feedback">Feedback reduction</option>
                            <option value="low-latency">Low latency</option>
                          </select>
                        </label>
                        <p className="stage-audio-note">Low latency bypasses browser echo and noise reduction. Use headphones or keep the mic away from speakers to avoid feedback.</p>
                        <label className="stage-audio-slider">
                          <span><b>Mic echo</b><output>{Math.round(micSettings.echo * 100)}%</output></span>
                          <input type="range" min="0" max="1" step="0.05" value={micSettings.echo} onChange={(e) => updateSettings({ echo: Number(e.target.value) })} />
                        </label>
                        <label className="stage-audio-slider">
                          <span><b>Room reverb</b><output>{Math.round(micSettings.reverb * 100)}%</output></span>
                          <input type="range" min="0" max="1" step="0.05" value={micSettings.reverb} onChange={(e) => updateSettings({ reverb: Number(e.target.value) })} />
                        </label>
                        <p className="stage-audio-note">
                          {latency == null ? "Enable the mic to see the browser audio-path estimate." : `Browser audio path estimate: ~${latency} ms. This excludes microphone hardware and casting.`}
                        </p>
                        <p className="stage-audio-note">For the least mic delay, keep echo and reverb at 0. If only the mic lags, the mic route is the likely cause; if everything lags together, check casting or the TV connection.</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                {state.videoChoices.length > 1 && (
                  <div className="stage-video-picker">
                    <button className="btn btn--ghost" aria-expanded={videoMenu} onClick={() => { setVideoMenu((open) => !open); wake(); }}>
                      Change video
                    </button>
                    <AnimatePresence>
                      {videoMenu && (
                        <motion.div className="stage-video-menu" initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}>
                          <p className="stage-video-menu-title">Choose a karaoke version</p>
                          <ul>
                            {state.videoChoices.map((choice) => (
                              <li key={choice.id}>
                                <button className="stage-video-option" disabled={switchingVideo || state.videoId === choice.id} aria-current={state.videoId === choice.id ? "true" : undefined} onClick={() => chooseVideo(choice.id)}>
                                  <span>{choice.title}</span>
                                  <small>{state.videoId === choice.id ? "Playing now" : choice.channel || "YouTube"}</small>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
                <button className="btn btn--ghost" onClick={fullscreen}>
                  Full screen
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="stage-strip">
          <span className="code">No. {songCode(entry.song.key)}</span>
          <strong className="strip-who">{entry.singer}</strong>
          <span className="vfd">{fmt(player.time.current)}</span>
          <div className="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <span className="vfd">{player.time.duration ? fmt(player.time.duration) : "-:--"}</span>
        </div>
      </footer>
    </motion.main>
  );
}
