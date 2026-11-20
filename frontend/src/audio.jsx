import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  audioUrl,
  trackLabel,
  ended,
  SEQUENCE,
  startLang,
  step,
  validRef,
} from "./domain";
import { getState, settings, useStore } from "./store";
const AudioContext = createContext(null);
export function useAudio() {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error("Audio provider is missing");
  return ctx;
}
export function AudioProvider({ children }) {
  const element = useRef(null),
    track = useRef(null),
    epoch = useRef(0);
  const [current, setCurrent] = useState(null),
    [playing, setPlaying] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(null),
    [time, setTime] = useState(0),
    [duration, setDuration] = useState(0);
  const prefs = useStore((s) => s.settings);
  useEffect(() => {
    if (element.current) {
      element.current.playbackRate = prefs.playbackRate;
      element.current.volume = prefs.volume;
    }
  }, [prefs.playbackRate, prefs.volume]);
  const attempt = useCallback(() => {
    const a = element.current,
      token = epoch.current;
    if (!a) return;
    setError(null);
    a.play().catch((failure) => {
      if (token !== epoch.current) return;
      setLoading(false);
      setPlaying(false);
      if (failure.name !== "AbortError")
        setError(
          failure.name === "NotAllowedError"
            ? "Press play to start the recording."
            : "Unable to play this recording. Please try again.",
        );
    });
  }, []);
  const play = useCallback(
    (chapter, verse, lang) => {
      const a = element.current;
      if (!a || !validRef(chapter, verse)) return;
      epoch.current++;
      a.pause();
      lang = lang || startLang(getState().settings.audioTrack);
      track.current = { chapter, verse, lang };
      setCurrent(track.current);
      setTime(0);
      setDuration(0);
      setLoading(true);
      setPlaying(false);
      setError(null);
      a.src = audioUrl(chapter, verse, lang);
      a.load();
      a.playbackRate = getState().settings.playbackRate;
      a.volume = getState().settings.volume;
      attempt();
    },
    [attempt],
  );
  const toggle = useCallback(() => {
    const a = element.current;
    if (a && track.current) {
      if (a.paused) attempt();
      else a.pause();
    }
  }, [attempt]);
  const move = useCallback(
    (direction) => {
      const t = track.current;
      if (t) {
        const r = step(t.chapter, t.verse, direction);
        if (r) play(r.chapter, r.verse);
      }
    },
    [play],
  );
  const close = useCallback(() => {
    epoch.current++;
    const a = element.current;
    if (a) {
      a.pause();
      a.removeAttribute("src");
      a.load();
    }
    track.current = null;
    setCurrent(null);
    setPlaying(false);
    setLoading(false);
    setError(null);
  }, []);
  useEffect(() => {
    if (!current || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `Bhagavad Gita ${current.chapter}.${current.verse}`,
        artist: trackLabel(current.lang),
        album: "Gita Path",
      });
      navigator.mediaSession.setActionHandler("play", attempt);
      navigator.mediaSession.setActionHandler("pause", () =>
        element.current?.pause(),
      );
      navigator.mediaSession.setActionHandler("nexttrack", () => move(1));
      navigator.mediaSession.setActionHandler("previoustrack", () => move(-1));
    } catch {
      /* Media Session is optional. */
    }
  }, [current, attempt, move]);
  function onEnded() {
    setPlaying(false);
    const t = track.current;
    if (!t) return;
    const s = getState().settings;
    if (
      s.audioTrack === "all" &&
      SEQUENCE.indexOf(t.lang) < SEQUENCE.length - 1
    ) {
      play(t.chapter, t.verse, SEQUENCE[SEQUENCE.indexOf(t.lang) + 1]);
      return;
    }
    const n = ended(t.chapter, t.verse, getState().settings);
    if (n) {
      if (
        n.chapter === t.chapter &&
        n.verse === t.verse &&
        s.audioTrack !== "all" &&
        element.current
      ) {
        element.current.currentTime = 0;
        attempt();
      } else play(n.chapter, n.verse);
    }
  }
  return (
    <AudioContext.Provider
      value={{
        current,
        playing,
        loading,
        error,
        time,
        duration,
        play,
        toggle,
        next: () => move(1),
        prev: () => move(-1),
        seek: (t) => {
          const a = element.current;
          if (a && Number.isFinite(t))
            a.currentTime = Math.max(0, Math.min(t, a.duration || 0));
        },
        close,
        chooseTrack: (id) => {
          settings({ audioTrack: id });
          const t = track.current;
          if (t) play(t.chapter, t.verse);
        },
      }}
    >
      {children}
      <audio
        ref={element}
        preload="metadata"
        onPlaying={() => {
          setPlaying(true);
          setLoading(false);
          setError(null);
        }}
        onPause={() => setPlaying(false)}
        onWaiting={() => setLoading(true)}
        onCanPlay={() => setLoading(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) =>
          setDuration(
            Number.isFinite(e.currentTarget.duration)
              ? e.currentTarget.duration
              : 0,
          )
        }
        onEnded={onEnded}
        onError={() => {
          if (track.current) {
            setLoading(false);
            setPlaying(false);
            setError(
              "Recording unavailable. Check the server connection and retry.",
            );
          }
        }}
      />
    </AudioContext.Provider>
  );
}
