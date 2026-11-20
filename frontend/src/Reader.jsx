import { useEffect, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  PanelLeft,
  Settings2,
  Maximize,
  Minimize,
  Play,
  Headphones,
} from "lucide-react";
import { useApi } from "./api";
import { useAudio } from "./audio";
import { activeFromRects, step, validRef } from "./domain";
import { useStore, visit } from "./store";
import { ErrorBox, IconButton, Loading, Modal } from "./components/UI";
import { ListeningSettings, SettingsDialog } from "./components/Settings";
import { VerseCard } from "./components/VerseCard";
export default function Reader({ meta }) {
  const params = useParams(),
    chapter = Number(params.chapter),
    verse = params.verse === undefined ? 1 : Number(params.verse);
  if (
    !validRef(chapter, verse) ||
    !/^\d+$/.test(params.chapter || "") ||
    !/^[0-9]+$/.test(params.verse || "1")
  )
    return (
      <section className="container page narrow">
        <h1>That verse is not in this edition.</h1>
        <p className="lead">
          There are 18 chapters. Chapter 13 includes 35 verses in this edition.
        </p>
        <Link className="button" to="/">
          Browse all chapters
        </Link>
      </section>
    );
  return (
    <ReaderPage
      meta={meta}
      chapter={chapter}
      requested={verse}
      chapterStart={params.verse === undefined}
    />
  );
}
function ReaderPage({ meta, chapter, requested, chapterStart }) {
  const q = useApi(`/api/chapters/${chapter}`),
    a = useAudio(),
    s = useStore((st) => st.settings),
    read = useStore((st) => st.read),
    navigate = useNavigate(),
    [query] = useSearchParams();
  const whole = query.get("view") !== "verse",
    ch = meta.chapters[chapter - 1];
  const [active, setActive] = useState(requested),
    [rail, setRail] = useState(true),
    [desktop, setDesktop] = useState(
      () => window.matchMedia("(min-width: 1024px)").matches,
    ),
    [drawer, setDrawer] = useState(false),
    [listening, setListening] = useState(false),
    [prefs, setPrefs] = useState(false),
    [focus, setFocus] = useState(false);
  const list = useRef(null),
    lock = useRef(0);
  useEffect(() => {
    const breakpoint = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      setDesktop(breakpoint.matches);
      setDrawer(false);
    };
    breakpoint.addEventListener("change", update);
    return () => breakpoint.removeEventListener("change", update);
  }, []);
  function go(ref, chapterMode = whole, replace = false) {
    if (!ref) return;
    setActive(ref.verse);
    visit(ref.chapter, ref.verse);
    lock.current = Date.now() + 250;
    const target = `/read/${ref.chapter}/${ref.verse}${chapterMode ? "" : "?view=verse"}`;
    navigate(target, { replace });
    if (ref.chapter === chapter && ref.verse === requested && chapterMode)
      document
        .getElementById(`verse-${ref.verse}`)
        ?.scrollIntoView({ block: "start" });
    setDrawer(false);
  }
  useEffect(() => {
    setActive(requested);
    visit(chapter, requested);
    if (!q.data) return;
    lock.current = Date.now() + 250;
    if (whole && !chapterStart)
      document
        .getElementById(`verse-${requested}`)
        ?.scrollIntoView({ block: "start" });
    else window.scrollTo({ top: 0 });
  }, [chapter, requested, whole, q.data, chapterStart]);
  useEffect(() => {
    if (!whole || !q.data) return;
    let raf = 0;
    const scan = () => {
      raf = 0;
      if (Date.now() < lock.current) return;
      const rects = Array.from(
        list.current?.querySelectorAll("[data-verse]") || [],
      ).map((el) => {
        const r = el.getBoundingClientRect();
        return {
          verse: Number(el.dataset.verse),
          top: r.top,
          bottom: r.bottom,
        };
      });
      const atEnd =
        window.scrollY > 0 &&
        window.scrollY + window.innerHeight >=
          document.documentElement.scrollHeight - 3;
      const next = activeFromRects(rects, window.innerHeight, atEnd);
      if (next) {
        setActive(next);
        visit(chapter, next);
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(scan);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(raf);
    };
  }, [whole, chapter, q.data]);
  useEffect(() => {
    if (a.current && a.playing && s.followAudio) go(a.current, whole, true);
  }, [a.current?.chapter, a.current?.verse, a.playing, s.followAudio]);
  useEffect(() => {
    document.documentElement.classList.toggle("focus-reader", focus);
    return () => document.documentElement.classList.remove("focus-reader");
  }, [focus]);
  useEffect(() => {
    const changed = () => {
      if (!document.fullscreenElement) setFocus(false);
    };
    document.addEventListener("fullscreenchange", changed);
    return () => {
      document.removeEventListener("fullscreenchange", changed);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);
  async function toggleFocus() {
    const next = !focus;
    setFocus(next);
    try {
      if (next && document.fullscreenEnabled)
        await document.documentElement.requestFullscreen();
      else if (!next && document.fullscreenElement)
        await document.exitFullscreen();
    } catch {
      /* Focus layout is also available without fullscreen permission. */
    }
  }
  useEffect(() => {
    const key = (event) => {
      if (
        event.altKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.target?.closest(
          "input,textarea,select,button,dialog,[contenteditable=true]",
        )
      )
        return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        go(step(chapter, active, 1));
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(step(chapter, active, -1));
      }
      if (event.key === "Escape") setFocus(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const shown = q.data?.verses.filter((v) => whole || v.verse === active);
  const navigation = (
    <nav className="rail-navigation" aria-label="Chapters and verses">
      <h2>Chapter {chapter} verses</h2>
      <div className="verse-grid">
        {Array.from({ length: ch.versesCount }, (_, i) => i + 1).map((v) => (
          <button
            key={v}
            onClick={() => go({ chapter, verse: v })}
            aria-current={v === active ? "true" : undefined}
            aria-label={`Verse ${v}${read[`${chapter}.${v}`] ? ", read" : ""}`}
            className={`${v === active ? "selected" : ""} ${read[`${chapter}.${v}`] ? "read" : ""}`}
          >
            {v}
          </button>
        ))}
      </div>
      <h2>All chapters</h2>
      <ul className="rail-chapters">
        {meta.chapters.map((c) => (
          <li key={c.number}>
            <Link
              to={`/read/${c.number}${whole ? "" : "?view=verse"}`}
              onClick={() => {
                setDrawer(false);
                if (c.number === chapter) window.scrollTo({ top: 0 });
              }}
              aria-current={c.number === chapter ? "page" : undefined}
            >
              <span>{c.number}</span>
              {c.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
  const showRail = desktop && rail && !focus;
  return (
    <div className={`reader-layout container ${showRail ? "with-rail" : ""}`}>
      {showRail && <aside className="chapter-rail">{navigation}</aside>}
      <div className="reader-content">
        <div className="reader-toolbar">
          <div className="toolbar-start">
            <IconButton
              label={
                desktop && rail && !focus
                  ? "Hide chapter navigation"
                  : "Open chapter navigation"
              }
              active={desktop ? rail && !focus : drawer}
              onClick={() =>
                desktop && !focus ? setRail(!rail) : setDrawer(true)
              }
            >
              <PanelLeft size={17} />
            </IconButton>
            <span className="toolbar-label">
              Ch. {chapter}
              <span className="toolbar-reference"> · v{active}</span>
              <span className="toolbar-chapter"> · {ch.title}</span>
            </span>
          </div>
          <div className="toolbar-actions">
            <IconButton
              label="Previous verse"
              disabled={!step(chapter, active, -1)}
              onClick={() => go(step(chapter, active, -1))}
            >
              <ChevronLeft size={17} />
            </IconButton>
            <IconButton
              label="Next verse"
              disabled={!step(chapter, active, 1)}
              onClick={() => go(step(chapter, active, 1))}
            >
              <ChevronRight size={17} />
            </IconButton>
            <IconButton
              label="Play current verse"
              onClick={() => a.play(chapter, active)}
            >
              <Play size={17} />
            </IconButton>
            <IconButton
              label="Listening options"
              onClick={() => setListening(true)}
            >
              <Headphones size={17} />
            </IconButton>
            <IconButton label="Reader settings" onClick={() => setPrefs(true)}>
              <Settings2 size={17} />
            </IconButton>
            <IconButton
              label={focus ? "Exit focus mode" : "Enter focus mode"}
              active={focus}
              onClick={toggleFocus}
            >
              {focus ? <Minimize size={17} /> : <Maximize size={17} />}
            </IconButton>
          </div>
        </div>
        <header className="chapter-heading">
          <p className="eyebrow">
            Chapter {chapter} · {ch.versesCount} verses
          </p>
          <h1>{ch.title}</h1>
          <p lang="sa" className="deva chapter-sanskrit">
            {ch.name}
          </p>
          <p className="muted">{ch.meaning}</p>
          <details className="chapter-summary">
            <summary>About this chapter</summary>
            <p
              className={s.translationMode === "hi" ? "deva" : ""}
              lang={s.translationMode === "hi" ? "hi" : "en"}
            >
              {s.translationMode === "hi" ? ch.summary.hi : ch.summary.en}
            </p>
          </details>
          <label className="chapter-mode check">
            <input
              type="checkbox"
              checked={whole}
              onChange={() => go({ chapter, verse: active }, !whole)}
            />
            Read the whole chapter on one page
          </label>
        </header>
        {q.loading ? (
          <Loading text="Opening the chapter…" />
        ) : q.error ? (
          <ErrorBox message={q.error} retry={q.retry} />
        ) : (
          <>
            <div ref={list} className="verse-list">
              {shown?.map((v) => (
                <VerseCard
                  key={v.id}
                  v={v}
                  meta={meta}
                  selected={v.verse === active}
                />
              ))}
            </div>
            <nav className="verse-pager" aria-label="Verse navigation">
              <button
                className="button secondary"
                disabled={!step(chapter, active, -1)}
                onClick={() => go(step(chapter, active, -1))}
              >
                <ChevronLeft size={17} />
                Previous verse
              </button>
              <span>
                {chapter}.{active}
              </span>
              <button
                className="button secondary"
                disabled={!step(chapter, active, 1)}
                onClick={() => go(step(chapter, active, 1))}
              >
                Next verse
                <ChevronRight size={17} />
              </button>
            </nav>
            {whole && (
              <nav className="chapter-pager" aria-label="Chapter navigation">
                {chapter > 1 && (
                  <Link
                    className="button secondary small"
                    to={`/read/${chapter - 1}`}
                  >
                    ← Chapter {chapter - 1}
                  </Link>
                )}
                {chapter < meta.chapters.length && (
                  <Link
                    className="button secondary small"
                    to={`/read/${chapter + 1}`}
                  >
                    Chapter {chapter + 1} →
                  </Link>
                )}
              </nav>
            )}
          </>
        )}
      </div>
      <Modal
        title="Navigate"
        className="navigation-drawer"
        open={drawer}
        onClose={() => setDrawer(false)}
      >
        {drawer && navigation}
      </Modal>
      <Modal
        title="Listening preferences"
        open={listening}
        onClose={() => setListening(false)}
      >
        <ListeningSettings />
      </Modal>
      <SettingsDialog
        meta={meta}
        open={prefs}
        onClose={() => setPrefs(false)}
      />
    </div>
  );
}
