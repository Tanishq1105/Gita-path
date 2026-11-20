import { ThoughtSection } from "./components/Account";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  BookOpen,
  Headphones,
  Search,
  Play,
  Pause,
  Download,
  Upload,
  Trash2,
  Pencil,
} from "lucide-react";
import { useApi } from "./api";
import { useAudio } from "./audio";
import { dayVerse, parseRef, TOTAL } from "./domain";
import {
  useStore,
  bookmark,
  note,
  exportBackup,
  validateBackup,
  restore,
  reset,
  MAX_BACKUP,
  storageAvailable,
} from "./store";
import {
  Empty,
  ErrorBox,
  IconButton,
  Loading,
  Modal,
  useNotice,
} from "./components/UI";
import { ListeningSettings } from "./components/Settings";
import { NoteEditor } from "./components/VerseCard";
import heroManuscript from "./assets/hero-manuscript.jpg";
function DailyVerse({ meta }) {
  const ref = dayVerse(),
    q = useApi(`/api/verses/${ref.chapter}/${ref.verse}`),
    s = useStore((st) => st.settings),
    a = useAudio();
  return (
    <section className="daily panel">
      <div className="section-heading">
        <h2>Verse of the day</h2>
        <span className="daily-reference">
          Chapter {ref.chapter} · Verse {ref.verse}
        </span>
      </div>
      {q.loading ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox message={q.error} retry={q.retry} />
      ) : (
        q.data && (
          <>
            <p className="daily-shloka deva" lang="sa">
              {q.data.text}
            </p>
            <div className="ornament" aria-hidden="true">
              ✦
            </div>
            <blockquote className={s.translationMode === "hi" ? "deva" : ""}>
              {
                q.data.translations[
                  s.translationMode === "hi" ? s.hiAuthor : s.enAuthor
                ]
              }
            </blockquote>
            <p className="attribution">
              —{" "}
              {
                [...meta.translators.english, ...meta.translators.hindi].find(
                  (p) =>
                    p.id ===
                    (s.translationMode === "hi" ? s.hiAuthor : s.enAuthor),
                )?.name
              }
            </p>
            <div className="daily-actions">
              <Link
                className="button secondary small"
                to={`/read/${ref.chapter}/${ref.verse}`}
              >
                Read in context
              </Link>
              <button
                className="button secondary small"
                onClick={() => a.play(ref.chapter, ref.verse)}
              >
                <Play size={14} />
                Listen
              </button>
            </div>
          </>
        )
      )}
    </section>
  );
}
export function Chapters({ meta }) {
  const [filter, setFilter] = useState(""),
    read = useStore((st) => st.read);
  const chapters = meta.chapters.filter((c) =>
    `${c.title} ${c.name} ${c.meaning} ${c.number}`
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  return (
    <section className="chapter-library">
      <div className="section-heading">
        <h2>The eighteen chapters</h2>
        <div className="chapter-tools">
          <label className="search-mini">
            <Search size={16} />
            <input
              aria-label="Find a chapter"
              placeholder="Find a chapter…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </label>
          <Link className="chapter-search-link" to="/search">
            Search all verses →
          </Link>
        </div>
      </div>
      <div className="chapter-cards">
        {chapters.map((c) => {
          const count = Object.keys(read).filter((r) =>
            r.startsWith(`${c.number}.`),
          ).length;
          return (
            <Link
              className="chapter-card"
              to={`/read/${c.number}`}
              key={c.number}
            >
              <div className="chapter-card-top">
                <span className="chapter-number">
                  {String(c.number).padStart(2, "0")}
                </span>
                <span>{c.versesCount} verses</span>
              </div>
              <h3>{c.title}</h3>
              <p className="deva" lang="sa">
                {c.name}
              </p>
              <p className="chapter-meaning">{c.meaning}</p>
              <p className="chapter-excerpt">{c.summary.en}</p>
              <div className="chapter-progress">
                <div className="progress-track" aria-hidden="true">
                  <span
                    style={{ width: `${(count / c.versesCount) * 100}%` }}
                  />
                </div>
                <p>
                  {count ? `${count}/${c.versesCount} read` : "Not started"}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
      {!chapters.length && (
        <Empty title="No matching chapters">
          Try the chapter number or a different name.
        </Empty>
      )}
    </section>
  );
}
export function Home({ meta }) {
  const last = useStore((s) => s.last);
  return (
    <div className="container">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow deva" lang="sa">
            श्रीमद्भगवद्गीता
          </p>
          <h1>
            Read. Listen.
            <br />
            Reflect.
          </h1>
          <p className="lead">
            The Bhagavad Gita — {meta.chapters.length} chapters and {TOTAL}{" "}
            verses in the original Sanskrit, with English and Hindi translations
            and a recitation of every verse.
          </p>
          <div className="hero-actions">
            <Link
              className="button"
              to={last ? `/read/${last.chapter}/${last.verse}` : "/read/1"}
            >
              <BookOpen size={18} />
              {last
                ? `Continue · ${last.chapter}.${last.verse}`
                : "Begin reading"}
            </Link>
            {last ? (
              <Link className="button secondary" to="/read/1">
                Begin from the start
              </Link>
            ) : (
              <Link className="button secondary" to="/listen">
                <Headphones size={18} />
                Listen
              </Link>
            )}
          </div>
          {last && (
            <p className="hero-resume">
              You were reading {meta.chapters[last.chapter - 1].title}.
            </p>
          )}
        </div>
        <div className="hero-art">
          <img
            src={heroManuscript}
            width="1024"
            height="1152"
            alt=""
            fetchPriority="high"
          />
        </div>
      </section>
      <DailyVerse meta={meta} />
      <ThoughtSection />
      <Chapters meta={meta} />
    </div>
  );
}
export function Listen({ meta }) {
  const a = useAudio(),
    [selected, setSelected] = useState(1),
    [start, setStart] = useState(1),
    [options, setOptions] = useState(false);
  return (
    <div className="container page">
      <header className="page-heading">
        <p className="eyebrow">MAKE SPACE TO LISTEN</p>
        <h1>The sound of the shlokas</h1>
        <p className="lead">
          Original Sanskrit recitations, verse by verse. Follow along with the
          text or simply listen.
        </p>
      </header>
      <section className="listen-start panel">
        <div>
          <Headphones size={32} />
          <h2>Choose where to begin</h2>
          <p className="muted">
            Playback continues as you explore other pages.
          </p>
        </div>
        <div className="listen-form">
          <label>
            Chapter
            <select
              value={selected}
              onChange={(e) => {
                setSelected(Number(e.target.value));
                setStart(1);
              }}
            >
              {meta.chapters.map((c) => (
                <option key={c.number} value={c.number}>
                  {c.number}. {c.meaning}
                </option>
              ))}
            </select>
          </label>
          <label>
            Verse
            <select
              value={start}
              onChange={(e) => setStart(Number(e.target.value))}
            >
              {Array.from(
                { length: meta.chapters[selected - 1].versesCount },
                (_, i) => i + 1,
              ).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <button className="button" onClick={() => a.play(selected, start)}>
            <Play size={17} />
            Start listening
          </button>
          <button className="text-link" onClick={() => setOptions(true)}>
            Listening preferences
          </button>
        </div>
      </section>
      <div className="listen-chapters">
        {meta.chapters.map((c) => (
          <div
            key={c.number}
            className={`listen-row ${a.current?.chapter === c.number ? "selected" : ""}`}
          >
            <span className="chapter-number">
              {String(c.number).padStart(2, "0")}
            </span>
            <div>
              <h3>{c.meaning}</h3>
              <p className="muted small">
                {c.title} · {c.versesCount} verses
              </p>
            </div>
            <Link className="text-link read-link" to={`/read/${c.number}/1`}>
              Read
            </Link>
            <IconButton
              label={
                a.current?.chapter === c.number && a.playing
                  ? `Pause chapter ${c.number}`
                  : `Play chapter ${c.number}`
              }
              onClick={() =>
                a.current?.chapter === c.number
                  ? a.toggle()
                  : a.play(c.number, 1)
              }
            >
              {a.current?.chapter === c.number && a.playing ? (
                <Pause size={20} />
              ) : (
                <Play size={20} />
              )}
            </IconButton>
          </div>
        ))}
      </div>
      <Modal
        title="Listening preferences"
        open={options}
        onClose={() => setOptions(false)}
      >
        <ListeningSettings />
      </Modal>
    </div>
  );
}
export function SearchPage({ meta }) {
  const [params, setParams] = useSearchParams(),
    query = params.get("q") || "",
    lang = params.get("lang") || "all",
    chapter = params.get("chapter") || "",
    offset = Math.max(0, Number(params.get("offset")) || 0),
    [draft, setDraft] = useState(query);
  useEffect(() => setDraft(query), [query]);
  const change = (patch) =>
    setParams((old) => {
      const next = new URLSearchParams(old);
      Object.entries(patch).forEach(([k, v]) =>
        v ? next.set(k, v) : next.delete(k),
      );
      return next;
    });
  useEffect(() => {
    if (draft === query) return;
    const timer = setTimeout(() => change({ q: draft, offset: "" }), 350);
    return () => clearTimeout(timer);
  }, [draft, query]);
  const api = new URLSearchParams({
    q: query,
    lang,
    offset: String(offset),
    limit: "20",
  });
  if (chapter) api.set("chapter", chapter);
  const q = useApi(query.trim() ? `/api/search?${api}` : null);
  return (
    <div className="container page narrow">
      <header className="page-heading">
        <p className="eyebrow">EXPLORE THE TEXT</p>
        <h1>Find a verse</h1>
        <p className="lead">
          Search Sanskrit, transliteration, and all seven Hindi and English
          translations.
        </p>
      </header>
      <form
        className="search-form"
        onSubmit={(e) => {
          e.preventDefault();
          change({ q: draft, offset: "" });
        }}
      >
        <div className="search-field">
          <Search size={22} />
          <input
            autoComplete="off"
            aria-label="Search verses"
            placeholder="Try karma, धर्म, or 2.47…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="button" type="submit">
            Search
          </button>
        </div>
        <div className="filters">
          <label>
            Chapter
            <select
              value={chapter}
              onChange={(e) => change({ chapter: e.target.value, offset: "" })}
            >
              <option value="">All chapters</option>
              {meta.chapters.map((c) => (
                <option value={c.number} key={c.number}>
                  {c.number}. {c.meaning}
                </option>
              ))}
            </select>
          </label>
          <label>
            Language
            <select
              value={lang}
              onChange={(e) => change({ lang: e.target.value, offset: "" })}
            >
              {[
                ["all", "All languages"],
                ["sanskrit", "Sanskrit"],
                ["transliteration", "Transliteration"],
                ["english", "English"],
                ["hindi", "Hindi"],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </form>
      {!query.trim() ? (
        <Empty title="What would you like to explore?">
          Enter a word, phrase, or chapter and verse reference such as 2.47.
        </Empty>
      ) : q.loading ? (
        <Loading text="Searching the Gita…" />
      ) : q.error ? (
        <ErrorBox message={q.error} retry={q.retry} />
      ) : (
        q.data && (
          <>
            <p className="results-count">
              {q.data.total} {q.data.total === 1 ? "verse" : "verses"} found
              {q.data.total > 0 &&
                ` · showing ${offset + 1}–${Math.min(offset + 20, q.data.total)}`}
            </p>
            <div className="search-results">
              {q.data.results.map((r) => (
                <Link
                  className="result-card panel"
                  key={`${r.chapter}.${r.verse}`}
                  to={`/read/${r.chapter}/${r.verse}`}
                >
                  <span className="ref-badge">
                    {r.chapter}.{r.verse}
                  </span>
                  <div>
                    <h2>{meta.chapters[r.chapter - 1].meaning}</h2>
                    <p
                      className={
                        r.field === "hindi" || r.field === "sanskrit"
                          ? "deva"
                          : ""
                      }
                    >
                      {r.snippet}
                    </p>
                    <small className="muted">
                      {r.field}
                      {r.authorId
                        ? ` · ${[...meta.translators.english, ...meta.translators.hindi].find((a) => a.id === r.authorId)?.name}`
                        : ""}
                    </small>
                  </div>
                  <ArrowUpRight size={18} />
                </Link>
              ))}
            </div>
            {!q.data.total && (
              <Empty title="No verses found">
                Try a shorter phrase or change the chapter and language filters.
              </Empty>
            )}
            {q.data.total > 20 && (
              <div className="pagination">
                <button
                  className="button secondary"
                  disabled={!offset}
                  onClick={() =>
                    change({ offset: String(Math.max(0, offset - 20)) })
                  }
                >
                  Previous
                </button>
                <button
                  className="button secondary"
                  disabled={offset + 20 >= q.data.total}
                  onClick={() => change({ offset: String(offset + 20) })}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
function SavedPreview({ reference }) {
  const ref = parseRef(reference),
    q = useApi(`/api/verses/${ref.chapter}/${ref.verse}`),
    s = useStore((st) => st.settings);
  return (
    <p className="saved-preview">
      {q.data?.translations[
        s.translationMode === "hi" ? s.hiAuthor : s.enAuthor
      ]?.slice(0, 180)}
      {q.data ? "…" : ""}
    </p>
  );
}
export function Library({ meta }) {
  const state = useStore((s) => s),
    [tab, setTab] = useState("bookmarks"),
    [pending, setPending] = useState(null),
    [clear, setClear] = useState(false),
    [editing, setEditing] = useState(null),
    file = useRef(null),
    notify = useNotice();
  const last = state.last,
    books = Object.entries(state.bookmarks).sort((a, b) => b[1].at - a[1].at),
    notes = Object.entries(state.notes).sort((a, b) => b[1].at - a[1].at);
  function download() {
    const url = URL.createObjectURL(
        new Blob([exportBackup()], { type: "application/json" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = `gita-path-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Backup downloaded");
  }
  async function importFile(f) {
    if (!f) return;
    if (f.size > MAX_BACKUP) {
      notify("The backup exceeds the 2 MB limit.");
      return;
    }
    try {
      const text =
        typeof f.text === "function"
          ? await f.text()
          : await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result ?? ""));
              reader.onerror = () => reject(new Error("Could not read backup"));
              reader.readAsText(f);
            });
      const result = validateBackup(text);
      if (result.ok) setPending(result.data);
      else notify(result.error);
    } catch {
      notify("This file could not be read.");
    }
  }
  const link = (r) => {
    const ref = parseRef(r);
    return (
      <Link className="saved-title" to={`/read/${ref.chapter}/${ref.verse}`}>
        <span className="ref-badge">{r}</span>
        {meta.chapters[ref.chapter - 1].meaning}
      </Link>
    );
  };
  return (
    <div className="container page narrow">
      <header className="page-heading">
        <p className="eyebrow">YOUR READING JOURNEY</p>
        <h1>My Library</h1>
        <p className="lead">
          Keep the verses that speak to you, and the thoughts they inspire.
        </p>
      </header>
      {!storageAvailable && (
        <p className="error-box" role="alert">
          Browser storage is unavailable. Download a backup before closing this
          page.
        </p>
      )}
      <div className="library-summary">
        <Link
          className="panel resume-card"
          to={last ? `/read/${last.chapter}/${last.verse}` : "/read/1/1"}
        >
          <BookOpen size={24} />
          <div>
            <p className="eyebrow">
              {last ? "CONTINUE READING" : "BEGIN YOUR JOURNEY"}
            </p>
            <h2>
              {last
                ? `${last.chapter}.${last.verse} · ${meta.chapters[last.chapter - 1].meaning}`
                : "Begin with Chapter 1"}
            </h2>
          </div>
          <ArrowRight size={20} />
        </Link>
        <div className="panel read-stat">
          <strong>
            {Object.keys(state.read).length}
            <small> / {TOTAL}</small>
          </strong>
          <span>verses marked read</span>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Library sections">
        {[
          ["bookmarks", "Bookmarks", books.length],
          ["notes", "Notes", notes.length],
          ["progress", "Progress", null],
          ["recent", "Recent", null],
        ].map(([value, label, count]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            className={tab === value ? "selected" : ""}
            onClick={() => setTab(String(value))}
          >
            {label}
            {count !== null && <span>{count}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="library-content">
        {tab === "bookmarks" &&
          (books.length ? (
            <div className="saved-list">
              {books.map(([r]) => (
                <div className="panel saved-card" key={r}>
                  <div>
                    <div className="saved-row">
                      {link(r)}
                      <IconButton
                        label={`Remove bookmark ${r}`}
                        onClick={() => bookmark(r)}
                      >
                        <Trash2 size={18} />
                      </IconButton>
                    </div>
                    <SavedPreview reference={r} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="Keep a verse close">
              Use the bookmark icon on any verse to save it here.
            </Empty>
          ))}
        {tab === "notes" &&
          (notes.length ? (
            <div className="saved-list">
              {notes.map(([r, n]) => (
                <div className="panel saved-card" key={r}>
                  <div className="saved-row">
                    {link(r)}
                    <div className="inline-actions">
                      <IconButton
                        label={`Edit note ${r}`}
                        onClick={() => setEditing(r)}
                      >
                        <Pencil size={17} />
                      </IconButton>
                      <IconButton
                        label={`Delete note ${r}`}
                        onClick={() => note(r, "")}
                      >
                        <Trash2 size={17} />
                      </IconButton>
                    </div>
                  </div>
                  <p className="note-text">{n.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="A place for your reflections">
              Add a personal note while reading a verse.
            </Empty>
          ))}
        {tab === "progress" && (
          <div className="progress-grid">
            {meta.chapters.map((c) => {
              const n = Object.keys(state.read).filter((r) =>
                r.startsWith(`${c.number}.`),
              ).length;
              return (
                <Link
                  className="panel progress-item"
                  key={c.number}
                  to={`/read/${c.number}/1`}
                >
                  <div>
                    <strong>
                      {c.number}. {c.meaning}
                    </strong>
                    <span>
                      {n}/{c.versesCount}
                    </span>
                  </div>
                  <div className="progress-track">
                    <span style={{ width: `${(n / c.versesCount) * 100}%` }} />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        {tab === "recent" &&
          (state.recent.length ? (
            <div className="saved-list">
              {state.recent.map((r) => (
                <div className="panel saved-card" key={r.ref}>
                  {link(r.ref)}
                  <SavedPreview reference={r.ref} />
                </div>
              ))}
            </div>
          ) : (
            <Empty title="Your next chapter starts here">
              Verses you read will appear here.
            </Empty>
          ))}
      </div>
      <section className="backup-panel panel">
        <div>
          <h2>Keep a copy of your journey</h2>
          <p className="muted">
            Bookmarks, notes, progress and preferences are saved on this
            browser. Download a backup to keep them safe or move them to another
            device.
          </p>
        </div>
        <div className="backup-actions">
          <button className="button" onClick={download}>
            <Download size={17} />
            Download backup
          </button>
          <button
            className="button secondary"
            onClick={() => file.current?.click()}
          >
            <Upload size={17} />
            Restore backup
          </button>
          <button className="text-button danger" onClick={() => setClear(true)}>
            Clear personal data
          </button>
          <input
            ref={file}
            className="sr-only"
            type="file"
            accept=".json,application/json"
            aria-label="Choose backup file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              void importFile(f);
            }}
          />
        </div>
      </section>
      {editing && (
        <NoteEditor
          reference={editing}
          initial={state.notes[editing]?.text || ""}
          open
          onClose={() => setEditing(null)}
        />
      )}
      <Modal
        title="Restore this backup?"
        open={!!pending}
        onClose={() => setPending(null)}
      >
        <p>
          This will replace the current bookmarks, notes, progress and
          preferences in this browser.
        </p>
        {pending && (
          <p className="muted">
            {Object.keys(pending.bookmarks).length} bookmarks ·{" "}
            {Object.keys(pending.notes).length} notes ·{" "}
            {Object.keys(pending.read).length} read verses
          </p>
        )}
        <div className="modal-actions">
          <button className="button secondary" onClick={() => setPending(null)}>
            Cancel
          </button>
          <button
            className="button"
            onClick={() => {
              if (pending) restore(pending);
              setPending(null);
              notify("Backup restored");
            }}
          >
            Replace with backup
          </button>
        </div>
      </Modal>
      <Modal
        title="Clear your personal library?"
        open={clear}
        onClose={() => setClear(false)}
      >
        <p>
          This removes bookmarks, notes, progress and settings from this
          browser. Download a backup first if you want to keep them.
        </p>
        <div className="modal-actions">
          <button className="button secondary" onClick={() => setClear(false)}>
            Cancel
          </button>
          <button
            className="button danger-bg"
            onClick={() => {
              reset();
              setClear(false);
              notify("Personal library cleared");
            }}
          >
            Clear all data
          </button>
        </div>
      </Modal>
    </div>
  );
}
export function About({ meta }) {
  return (
    <div className="container page prose narrow">
      <p className="eyebrow">ABOUT GITA PATH</p>
      <h1>A companion for your reading.</h1>
      <p className="lead">
        A complete Bhagavad Gita reader for exploring the Sanskrit verses,
        understanding different translations, and listening to recorded
        recitations.
      </p>
      <h2>One scripture, several ways to explore</h2>
      <p>
        The Sanskrit shloka is the original text. Transliteration presents its
        pronunciation in Roman letters. Hindi and English translations express
        its meaning; commentaries offer an author's interpretation. Each
        translation and commentary retains its author's name.
      </p>
      <h2>The edition</h2>
      <p>
        This imported edition contains 18 chapters and 701 verse records.
        Chapter 13 includes Arjuna's opening question as 13.1 and has 35 verses.
        Its numbering is preserved so the text, translations and recordings stay
        aligned.
      </p>
      <h2>Translations</h2>
      <div className="credits-grid">
        {Object.entries(meta.translators).map(([lang, authors]) => (
          <div className="panel" key={lang}>
            <h3>{lang === "english" ? "English" : "Hindi"}</h3>
            <ul>
              {authors.map((a) => (
                <li key={a.id}>{a.name}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <h2>Listen and follow along</h2>
      <p>
        The included recordings are Sanskrit recitations. Spoken Hindi and
        English translations are not part of this collection. The uploaded
        source does not identify the reciter, so no narrator attribution has
        been added. Commentary is available in Hindi and English.
      </p>
      <h2>Your personal library</h2>
      <p>
        Anyone can read and listen without an account. Bookmarks, notes, reading
        marks and preferences are stored only in your browser, and no personal
        notes are sent to the server. Use My Library's backup and restore to
        move them between browsers or devices. Clearing browser data removes
        this personal library.
      </p>
      <h2>Source and attribution</h2>
      <p>
        Text, translations, commentary and audio were imported from the provided
        gita-main repository. The source software's licence and import manifest
        are included in the project. Translations and recordings retain their
        respective authors' rights; public redistribution should follow the
        source owners' terms.
      </p>
      <p>
        Gita Path is a reading and study companion. Interpretations may differ
        across translators and traditions.
      </p>
      <Link className="button" to="/read/1/1">
        <BookOpen size={18} />
        Begin reading
      </Link>
    </div>
  );
}
