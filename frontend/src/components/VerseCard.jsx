import { useEffect, useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  NotebookPen,
  Copy,
  Share2,
  Circle,
  CheckCircle2,
  Play,
  Pause,
  ChevronDown,
} from "lucide-react";
import { useApi } from "../api";
import { useAudio } from "../audio";
import { bookmark, note, mark, useStore } from "../store";
import { IconButton, Modal, Loading, useNotice } from "./UI";
export function NoteEditor({ reference, initial, open, onClose }) {
  const [text, setText] = useState(initial),
    notify = useNotice();
  useEffect(() => {
    if (open) setText(initial);
  }, [open, initial]);
  return (
    <Modal title={`Your note · ${reference}`} open={open} onClose={onClose}>
      <label>
        Your reflection
        <textarea
          aria-label="Your reflection"
          rows={7}
          maxLength={10000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What does this verse mean to you?"
        />
      </label>
      <p className="muted small">
        Private to this browser. Back it up from My Library.
      </p>
      <div className="modal-actions">
        <button className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button"
          onClick={() => {
            note(reference, text);
            notify(text.trim() ? "Note saved" : "Note removed");
            onClose();
          }}
        >
          Save note
        </button>
      </div>
    </Modal>
  );
}
function Commentary({ v, meta }) {
  const [open, setOpen] = useState(false),
    [author, setAuthor] = useState(meta.commentators[0]?.id ?? 16);
  const q = useApi(open ? `/api/commentary/${v.chapter}/${author}` : null);
  return (
    <section className="commentary">
      <button
        className="text-button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ChevronDown size={17} className={open ? "rotated" : ""} />
        Explore commentary
      </button>
      {open && (
        <div className="commentary-content">
          <label className="sr-only" htmlFor={`commentary-${v.id}`}>
            Commentary author
          </label>
          <select
            id={`commentary-${v.id}`}
            value={author}
            onChange={(e) => setAuthor(Number(e.target.value))}
          >
            {meta.commentators.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.lang === "hindi" ? "Hindi" : "English"}
              </option>
            ))}
          </select>
          {q.loading ? (
            <Loading />
          ) : q.error ? (
            <p role="alert">{q.error}</p>
          ) : (
            <p
              className={
                meta.commentators.find((a) => a.id === author)?.lang === "hindi"
                  ? "deva"
                  : ""
              }
            >
              {q.data?.[v.verse] ||
                "No commentary from this author for this verse."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
export function verseText(v, s, meta) {
  const names = (id) =>
    [...meta.translators.english, ...meta.translators.hindi].find(
      (a) => a.id === id,
    )?.name || "";
  return [
    v.text,
    v.transliteration,
    s.translationMode !== "hi"
      ? `${v.translations[s.enAuthor]} — ${names(s.enAuthor)}`
      : "",
    s.translationMode !== "en"
      ? `${v.translations[s.hiAuthor]} — ${names(s.hiAuthor)}`
      : "",
    `Bhagavad Gita ${v.chapter}.${v.verse}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
export function VerseCard({ v, meta, selected = false }) {
  const ref = `${v.chapter}.${v.verse}`,
    s = useStore((st) => st.settings),
    saved = useStore((st) => st.bookmarks[ref]),
    memo = useStore((st) => st.notes[ref]),
    read = useStore((st) => !!st.read[ref]),
    a = useAudio(),
    notify = useNotice(),
    [editor, setEditor] = useState(false);
  const current =
    a.current?.chapter === v.chapter && a.current.verse === v.verse;
  const name = (id) =>
    [...meta.translators.english, ...meta.translators.hindi].find(
      (p) => p.id === id,
    )?.name;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(verseText(v, s, meta));
      notify(`Verse ${ref} copied`);
    } catch {
      notify("Copy is unavailable in this browser.");
    }
  };
  const share = async () => {
    try {
      const url = `${location.origin}/read/${v.chapter}/${v.verse}`;
      if (navigator.share)
        await navigator.share({ title: `Bhagavad Gita ${ref}`, url });
      else {
        await navigator.clipboard.writeText(url);
        notify("Verse link copied");
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        notify("Sharing is unavailable in this browser.");
    }
  };
  return (
    <article
      id={`verse-${v.verse}`}
      data-verse={v.verse}
      aria-labelledby={`verse-heading-${v.id}`}
      className={`verse-card ${selected ? "selected" : ""} ${current ? "reciting" : ""}`}
      style={{
        "--read-scale": s.fontScale,
        "--read-leading": s.lineHeight,
      }}
    >
      <header className="verse-heading">
        <h2 id={`verse-heading-${v.id}`}>
          <span className="sr-only">Verse </span>
          {ref}
        </h2>
        <div className="verse-actions">
          <IconButton
            label={
              current && a.playing ? "Pause recitation" : "Play recitation"
            }
            active={current}
            onClick={() => (current ? a.toggle() : a.play(v.chapter, v.verse))}
          >
            {current && a.playing ? <Pause size={16} /> : <Play size={16} />}
          </IconButton>
          <IconButton
            label={saved ? "Remove bookmark" : "Bookmark verse"}
            active={!!saved}
            onClick={() => {
              bookmark(ref);
              notify(saved ? "Bookmark removed" : "Verse bookmarked");
            }}
          >
            {saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
          </IconButton>
          <IconButton
            label={memo ? "Edit note" : "Add note"}
            active={!!memo}
            onClick={() => setEditor(true)}
          >
            <NotebookPen size={16} />
          </IconButton>
          <IconButton label="Copy verse" onClick={copy}>
            <Copy size={16} />
          </IconButton>
          <IconButton label="Share verse" onClick={share}>
            <Share2 size={16} />
          </IconButton>
          <IconButton
            label={read ? "Mark unread" : "Mark read"}
            active={read}
            onClick={() => mark(ref)}
          >
            {read ? <CheckCircle2 size={16} /> : <Circle size={16} />}
          </IconButton>
        </div>
      </header>
      {s.showSanskrit && (
        <p lang="sa" className="shloka deva">
          {v.text}
        </p>
      )}
      {s.showTransliteration && (
        <p className="transliteration" lang="sa-Latn">
          {v.transliteration}
        </p>
      )}
      {s.showWordMeanings && v.wordMeanings && (
        <div className="word-meanings">
          <h3>Word meanings</h3>
          <p>{v.wordMeanings}</p>
        </div>
      )}
      <div className="ornament" aria-hidden="true">
        ✦
      </div>
      <div className="translations">
        {s.translationMode !== "hi" && (
          <figure>
            <blockquote lang="en">{v.translations[s.enAuthor]}</blockquote>
            <figcaption>— {name(s.enAuthor)}</figcaption>
          </figure>
        )}
        {s.translationMode !== "en" && (
          <figure>
            <blockquote className="deva" lang="hi">
              {v.translations[s.hiAuthor]}
            </blockquote>
            <figcaption>— {name(s.hiAuthor)}</figcaption>
          </figure>
        )}
      </div>
      {memo && (
        <button className="saved-note" onClick={() => setEditor(true)}>
          <span>
            <NotebookPen size={15} />
            Your note
          </span>
          <p>{memo.text}</p>
        </button>
      )}
      <Commentary v={v} meta={meta} />
      <NoteEditor
        reference={ref}
        initial={memo?.text || ""}
        open={editor}
        onClose={() => setEditor(false)}
      />
    </article>
  );
}
