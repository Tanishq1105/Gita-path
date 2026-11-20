import { useSyncExternalStore } from "react";
import { z } from "zod";
import { parseRef, validRef } from "./domain";
import { EN_AUTHORS, HI_AUTHORS } from "./generated/edition";
export const STORAGE_KEY = "gita-path:v1";
export const MAX_BACKUP = 2 * 1024 * 1024;
const timestamp = z.number().finite().min(0).max(8.64e15);
const reference = z.string().refine((v) => !!parseRef(v));
const settingsSchema = z.object({
  theme: z.enum(["paper", "light", "dark"]),
  fontScale: z.number().min(0.8).max(1.6),
  lineHeight: z.number().min(1.3).max(2.2),
  showSanskrit: z.boolean(),
  showTransliteration: z.boolean(),
  showWordMeanings: z.boolean(),
  translationMode: z.enum(["en", "hi", "both"]),
  enAuthor: z
    .number()
    .int()
    .refine((n) => EN_AUTHORS.includes(n)),
  hiAuthor: z
    .number()
    .int()
    .refine((n) => HI_AUTHORS.includes(n)),
  playbackRate: z.union([
    z.literal(0.75),
    z.literal(1),
    z.literal(1.25),
    z.literal(1.5),
  ]),
  volume: z.number().min(0).max(1),
  audioTrack: z.enum(["sa", "hi", "en", "chant", "all"]).default("sa"),
  repeat: z.boolean(),
  autoplay: z.boolean(),
  autoplayScope: z.enum(["chapter", "continue"]),
  followAudio: z.boolean(),
});
export const stateSchema = z.object({
  version: z.literal(1),
  settings: settingsSchema,
  bookmarks: z.record(reference, z.object({ at: timestamp })),
  notes: z.record(
    reference,
    z.object({ text: z.string().max(10000), at: timestamp }),
  ),
  read: z.record(reference, timestamp),
  recent: z.array(z.object({ ref: reference, at: timestamp })).max(50),
  last: z
    .object({
      chapter: z.number().int(),
      verse: z.number().int(),
      at: timestamp,
    })
    .refine((r) => validRef(r.chapter, r.verse))
    .nullable(),
});
export const defaults = () => ({
  version: 1,
  settings: {
    theme: "paper",
    fontScale: 1,
    lineHeight: 1.8,
    showSanskrit: true,
    showTransliteration: true,
    showWordMeanings: false,
    translationMode: "en",
    enAuthor: 21,
    hiAuthor: 17,
    playbackRate: 1,
    volume: 1,
    audioTrack: "sa",
    repeat: false,
    autoplay: true,
    autoplayScope: "chapter",
    followAudio: true,
  },
  bookmarks: {},
  notes: {},
  read: {},
  recent: [],
  last: null,
});
export let storageAvailable = true;
export function parseSaved(value) {
  const result = stateSchema.safeParse(value);
  return result.success ? result.data : defaults();
}
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseSaved(JSON.parse(raw)) : defaults();
  } catch {
    storageAvailable = false;
    return defaults();
  }
}
let state = load();
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());
export const getState = () => state;
export function update(fn) {
  state = fn(state);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
  emit();
}
export function useStore(selector) {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => selector(state),
  );
}
export const settings = (patch) =>
  update((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
export const bookmark = (ref) => {
  if (!parseRef(ref)) return;
  update((s) => {
    const b = { ...s.bookmarks };
    if (b[ref]) delete b[ref];
    else b[ref] = { at: Date.now() };
    return { ...s, bookmarks: b };
  });
};
export const note = (ref, text) => {
  if (!parseRef(ref)) return;
  update((s) => {
    const n = { ...s.notes };
    if (text.trim()) n[ref] = { text: text.slice(0, 10000), at: Date.now() };
    else delete n[ref];
    return { ...s, notes: n };
  });
};
export const mark = (ref) => {
  if (!parseRef(ref)) return;
  update((s) => {
    const r = { ...s.read };
    if (r[ref]) delete r[ref];
    else r[ref] = Date.now();
    return { ...s, read: r };
  });
};
export function visit(chapter, verse) {
  if (
    !validRef(chapter, verse) ||
    (state.last?.chapter === chapter && state.last.verse === verse)
  )
    return;
  const ref = `${chapter}.${verse}`,
    at = Date.now();
  update((s) => ({
    ...s,
    last: { chapter, verse, at },
    recent: [{ ref, at }, ...s.recent.filter((r) => r.ref !== ref)].slice(
      0,
      20,
    ),
  }));
}
export const exportBackup = () =>
  JSON.stringify(
    { app: "gita-path", exportedAt: new Date().toISOString(), data: state },
    null,
    2,
  );
export function validateBackup(text) {
  if (new TextEncoder().encode(text).length > MAX_BACKUP)
    return { ok: false, error: "The backup exceeds the 2 MB limit." };
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "Choose a valid JSON backup file." };
  }
  if (
    !raw ||
    typeof raw !== "object" ||
    !("app" in raw) ||
    raw.app !== "gita-path" ||
    !("data" in raw)
  )
    return { ok: false, error: "This is not a Gita Path backup." };
  const result = stateSchema.safeParse(raw.data);
  return result.success
    ? { ok: true, data: result.data }
    : {
        ok: false,
        error: "The backup contains invalid verses, settings or data.",
      };
}
export const restore = (data) => {
  const parsed = stateSchema.parse(data);
  update(() => parsed);
};
export const reset = () => update(() => defaults());
export const reloadForTest = () => {
  state = load();
  emit();
};
if (typeof window !== "undefined")
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      state = load();
      emit();
    }
  });
