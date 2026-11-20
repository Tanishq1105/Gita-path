import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Repeat1,
  X,
  Volume2,
  Settings2,
} from "lucide-react";
import { useAudio } from "../audio";
import { formatTime, step, TRACKS, trackLabel } from "../domain";
import { settings, useStore } from "../store";
import { IconButton, Modal } from "./UI";
import { ListeningSettings } from "./Settings";
export function Player({ chapters }) {
  const a = useAudio(),
    s = useStore((st) => st.settings),
    element = useRef(null),
    [options, setOptions] = useState(false);
  useEffect(() => {
    const root = document.documentElement,
      node = element.current;
    if (!node) {
      root.style.setProperty("--player-height", "0px");
      return;
    }
    const observe = new ResizeObserver(() =>
      root.style.setProperty("--player-height", `${node.offsetHeight}px`),
    );
    observe.observe(node);
    return () => {
      observe.disconnect();
      root.style.setProperty("--player-height", "0px");
    };
  }, [!!a.current]);
  if (!a.current) return null;
  const { chapter, verse } = a.current;
  const chapterName = chapters?.[chapter - 1]?.title;
  return (
    <>
      <section ref={element} className="player" aria-label="Audio player">
        <div className="player-inner">
          <Link className="player-title" to={`/read/${chapter}/${verse}`}>
            <span>
              <strong>
                Verse {chapter}.{verse}
              </strong>
              <small>
                {chapterName && `${chapterName} · `}
                {trackLabel(a.current.lang)}
              </small>
            </span>
          </Link>
          <div className="transport">
            <IconButton
              label="Previous recording"
              onClick={a.prev}
              disabled={!step(chapter, verse, -1)}
            >
              <SkipBack size={19} />
            </IconButton>
            <button
              className="play-circle"
              aria-label={a.playing ? "Pause audio" : "Play audio"}
              onClick={a.toggle}
            >
              {a.loading && !a.error ? (
                <span className="spinner" />
              ) : a.playing ? (
                <Pause size={21} />
              ) : (
                <Play size={21} />
              )}
            </button>
            <IconButton
              label="Next recording"
              onClick={a.next}
              disabled={!step(chapter, verse, 1)}
            >
              <SkipForward size={19} />
            </IconButton>
          </div>
          <div className="seek">
            <span>{formatTime(a.time)}</span>
            <input
              aria-label="Audio position"
              type="range"
              min="0"
              max={a.duration || 1}
              step=".1"
              value={Math.min(a.time, a.duration || 0)}
              onChange={(e) => a.seek(Number(e.target.value))}
            />
            <span>{formatTime(a.duration)}</span>
          </div>
          <div className="player-options">
            <IconButton
              label="Repeat recording"
              active={s.repeat}
              onClick={() => settings({ repeat: !s.repeat })}
            >
              <Repeat1 size={18} />
            </IconButton>
            <select
              aria-label="Audio language"
              value={s.audioTrack}
              onChange={(e) => a.chooseTrack(e.target.value)}
            >
              {TRACKS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Playback speed"
              value={s.playbackRate}
              onChange={(e) =>
                settings({
                  playbackRate: Number(e.target.value),
                })
              }
            >
              {[0.75, 1, 1.25, 1.5].map((rate) => (
                <option key={rate} value={rate}>
                  {rate}×
                </option>
              ))}
            </select>
            <label className="volume">
              <Volume2 size={17} />
              <input
                aria-label="Volume"
                type="range"
                min="0"
                max="1"
                step=".05"
                value={s.volume}
                onChange={(e) => settings({ volume: Number(e.target.value) })}
              />
            </label>
            <IconButton label="Audio options" onClick={() => setOptions(true)}>
              <Settings2 size={18} />
            </IconButton>
            <IconButton label="Close player" onClick={a.close}>
              <X size={18} />
            </IconButton>
          </div>
        </div>
        {a.error && (
          <div className="audio-error" role="alert">
            {a.error}
            <button onClick={a.toggle}>Retry</button>
          </div>
        )}
      </section>
      <Modal
        title="Listening preferences"
        open={options}
        onClose={() => setOptions(false)}
      >
        <ListeningSettings />
      </Modal>
    </>
  );
}
