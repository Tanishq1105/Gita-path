import { Modal } from "./UI";
import { settings, useStore } from "../store";
import { TRACKS } from "../domain";
export function ReadingSettings({ meta }) {
  const s = useStore((st) => st.settings);
  return (
    <div className="settings-stack">
      <label>
        Translation language
        <select
          value={s.translationMode}
          onChange={(e) =>
            settings({
              translationMode: e.target.value,
            })
          }
        >
          <option value="en">English</option>
          <option value="hi">हिन्दी</option>
          <option value="both">English + हिन्दी</option>
        </select>
      </label>
      {s.translationMode !== "hi" && (
        <label>
          English translator
          <select
            value={s.enAuthor}
            onChange={(e) => settings({ enAuthor: Number(e.target.value) })}
          >
            {meta.translators.english.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {s.translationMode !== "en" && (
        <label>
          Hindi translator
          <select
            value={s.hiAuthor}
            onChange={(e) => settings({ hiAuthor: Number(e.target.value) })}
          >
            {meta.translators.hindi.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Text size <span>{Math.round(s.fontScale * 100)}%</span>
        <input
          aria-label="Text size"
          type="range"
          min=".8"
          max="1.6"
          step=".05"
          value={s.fontScale}
          onChange={(e) => settings({ fontScale: Number(e.target.value) })}
        />
      </label>
      <label>
        Line spacing <span>{s.lineHeight.toFixed(1)}</span>
        <input
          aria-label="Line spacing"
          type="range"
          min="1.3"
          max="2.2"
          step=".1"
          value={s.lineHeight}
          onChange={(e) => settings({ lineHeight: Number(e.target.value) })}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={s.showSanskrit}
          onChange={(e) => settings({ showSanskrit: e.target.checked })}
        />
        Sanskrit shloka
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={s.showTransliteration}
          onChange={(e) => settings({ showTransliteration: e.target.checked })}
        />
        Roman transliteration
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={s.showWordMeanings}
          onChange={(e) => settings({ showWordMeanings: e.target.checked })}
        />
        Word meanings
      </label>
      <div>
        <p className="label">Reading theme</p>
        <div className="segmented">
          {["paper", "light", "dark"].map((t) => (
            <button
              key={t}
              className={t === s.theme ? "selected" : ""}
              aria-pressed={t === s.theme}
              onClick={() => settings({ theme: t })}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
export function ListeningSettings() {
  const s = useStore((st) => st.settings);
  return (
    <div className="settings-stack">
      <label>
        Volume
        <input
          aria-label="Listening volume"
          type="range"
          min="0"
          max="1"
          step=".05"
          value={s.volume}
          onChange={(e) => settings({ volume: Number(e.target.value) })}
        />
      </label>
      <label>
        Audio language
        <select
          aria-label="Audio language setting"
          value={s.audioTrack}
          onChange={(e) => settings({ audioTrack: e.target.value })}
        >
          {TRACKS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label} — {t.detail}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">
        Hindi narrates Swami Tejomayananda&apos;s translation and English
        narrates Shri Purohit Swami&apos;s, the defaults in Reading preferences.
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={s.autoplay}
          onChange={(e) => settings({ autoplay: e.target.checked })}
        />
        Play the next verse automatically
      </label>
      <label>
        At the end of a chapter
        <select
          value={s.autoplayScope}
          onChange={(e) =>
            settings({
              autoplayScope: e.target.value,
            })
          }
        >
          <option value="chapter">Stop listening</option>
          <option value="continue">Continue to the next chapter</option>
        </select>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={s.repeat}
          onChange={(e) => settings({ repeat: e.target.checked })}
        />
        Repeat the current verse
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={s.followAudio}
          onChange={(e) => settings({ followAudio: e.target.checked })}
        />
        Follow the recording in the reader
      </label>
    </div>
  );
}
export function SettingsDialog({ meta, open, onClose }) {
  return (
    <Modal title="Reading preferences" open={open} onClose={onClose}>
      <ReadingSettings meta={meta} />
    </Modal>
  );
}
