import { COUNTS } from "./generated/edition";
export const TOTAL = COUNTS.reduce((n, c) => n + c, 0);
export const refKey = (c, v) => `${c}.${v}`;
export function validRef(c, v) {
  return (
    Number.isInteger(c) &&
    Number.isInteger(v) &&
    c >= 1 &&
    c <= 18 &&
    v >= 1 &&
    v <= COUNTS[c - 1]
  );
}
export function parseRef(value) {
  const match = /^(\d{1,2})\.(\d{1,3})$/.exec(value);
  if (!match) return null;
  const chapter = Number(match[1]),
    verse = Number(match[2]);
  return validRef(chapter, verse) ? { chapter, verse } : null;
}
export function step(c, v, direction) {
  if (!validRef(c, v)) return null;
  if (direction === 1)
    return v < COUNTS[c - 1]
      ? { chapter: c, verse: v + 1 }
      : c < 18
        ? { chapter: c + 1, verse: 1 }
        : null;
  return v > 1
    ? { chapter: c, verse: v - 1 }
    : c > 1
      ? { chapter: c - 1, verse: COUNTS[c - 2] }
      : null;
}
export function ended(c, v, settings) {
  if (settings.repeat) return { chapter: c, verse: v };
  if (!settings.autoplay) return null;
  const next = step(c, v, 1);
  return next && (settings.autoplayScope === "continue" || next.chapter === c)
    ? next
    : null;
}
export function dayVerse(date = new Date()) {
  let index =
    (Math.floor(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000,
    ) *
      2654435761) %
    TOTAL;
  if (index < 0) index += TOTAL;
  for (let c = 1; c <= 18; c++) {
    if (index < COUNTS[c - 1]) return { chapter: c, verse: index + 1 };
    index -= COUNTS[c - 1];
  }
  return { chapter: 2, verse: 47 };
}
export function activeFromRects(rects, height, atEnd = false) {
  if (!rects.length) return null;
  if (atEnd) return rects[rects.length - 1].verse;
  const line = Math.min(height * 0.35, 260);
  let active = rects[0].verse;
  for (const r of rects) {
    if (r.top <= line) active = r.verse;
    if (r.top <= line && r.bottom > line) return r.verse;
  }
  return active;
}
export function formatTime(t) {
  if (!Number.isFinite(t) || t < 0) return "0:00";
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
}

export const TRACKS = [
  { id: "sa", label: "Sanskrit", detail: "Verse recitation" },
  { id: "hi", label: "Hindi", detail: "Narrated translation" },
  { id: "en", label: "English", detail: "Narrated translation" },
  {
    id: "all",
    label: "Sanskrit → Hindi → English",
    detail: "All three, one after another",
  },
  {
    id: "chant",
    label: "Sanskrit (slow chant)",
    detail: "Original slow melodic chant",
  },
];
export const SEQUENCE = ["sa", "hi", "en"];
export const trackLabel = (id) =>
  ({
    sa: "Sanskrit recitation",
    hi: "Hindi narration",
    en: "English narration",
    chant: "Sanskrit slow chant",
  })[id] || "Recitation";
export const audioUrl = (chapter, verse, lang) =>
  lang === "chant"
    ? `/api/audio/${chapter}/${verse}.mp3`
    : `/api/audio/${lang}/${chapter}/${verse}.mp3`;
export const startLang = (track) => (track === "all" ? "sa" : track);
