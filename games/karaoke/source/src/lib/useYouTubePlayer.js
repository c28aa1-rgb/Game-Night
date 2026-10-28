import { useEffect, useRef, useState } from "react";

let apiPromise;
function loadApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve(window.YT);
      };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.async = true;
      document.head.appendChild(s);
    });
  }
  return apiPromise;
}

// Never autoplays: the TV calls play() after the countdown.
// States from the IFrame API.
export const YTState = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };

export function useYouTubePlayer(mountRef, videoId, handlers) {
  const playerRef = useRef(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const [state, setState] = useState(YTState.UNSTARTED);
  const [ready, setReady] = useState(false);
  const [time, setTime] = useState({ current: 0, duration: 0 });

  useEffect(() => {
    let cancelled = false;
    let player;
    setReady(false);
    if (!videoId) return;
    loadApi().then((YT) => {
      if (cancelled || !mountRef.current) return;
      const host = document.createElement("div");
      mountRef.current.appendChild(host);
      player = new YT.Player(host, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: { autoplay: 0, controls: 0, rel: 0, playsinline: 1, fs: 0, iv_load_policy: 3, modestbranding: 1, disablekb: 1 },
        events: {
          onReady: () => {
            if (cancelled) return;
            playerRef.current = player;
            setReady(true);
          },
          onStateChange: (e) => {
            setState(e.data);
            if (e.data === YTState.ENDED) handlersRef.current.onEnd?.();
          },
          onError: (e) => handlersRef.current.onError?.(e.data),
        },
      });
    });
    return () => {
      cancelled = true;
      playerRef.current = null;
      try {
        player?.destroy();
      } catch {
        /* already gone */
      }
      if (mountRef.current) mountRef.current.innerHTML = "";
    };
  }, [videoId, mountRef]);

  useEffect(() => {
    if (!ready) return;
    const t = setInterval(() => {
      const p = playerRef.current;
      if (!p?.getCurrentTime) return;
      setTime({ current: p.getCurrentTime() || 0, duration: p.getDuration() || 0 });
    }, 250);
    return () => clearInterval(t);
  }, [ready]);

  const api = {
    play: () => playerRef.current?.playVideo(),
    pause: () => playerRef.current?.pauseVideo(),
    toggle: () => (state === YTState.PLAYING ? playerRef.current?.pauseVideo() : playerRef.current?.playVideo()),
    restart: () => {
      playerRef.current?.seekTo(0, true);
      playerRef.current?.playVideo();
    },
    seek: (s) => playerRef.current?.seekTo(s, true),
    setVolume: (volume) => playerRef.current?.setVolume(Math.max(0, Math.min(100, volume))),
    mute: () => playerRef.current?.mute(),
    unMute: () => playerRef.current?.unMute(),
  };

  return { ready, state, time, ...api };
}
