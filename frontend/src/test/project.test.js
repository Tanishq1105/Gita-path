import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  audioUrl,
  SEQUENCE,
  startLang,
  activeFromRects,
  dayVerse,
  ended,
  formatTime,
  parseRef,
  step,
  validRef,
} from "../domain";
import * as store from "../store";
describe("edition navigation", () => {
  it("handles book ends and chapter boundaries", () => {
    expect(step(1, 1, -1)).toBeNull();
    expect(step(18, 78, 1)).toBeNull();
    expect(step(1, 47, 1)).toEqual({ chapter: 2, verse: 1 });
    expect(step(2, 1, -1)).toEqual({ chapter: 1, verse: 47 });
    expect(step(13, 35, 1)).toEqual({ chapter: 14, verse: 1 });
    expect(step(13, 36, 1)).toBeNull();
  });
  it.each(["0.1", "19.1", "13.36", "2.0", "1.48", "bad", "2.47<script>"])(
    "rejects invalid references: %s",
    (reference) => expect(parseRef(reference)).toBeNull(),
  );
  it("includes the last verse of chapter 13", () =>
    expect(parseRef("13.35")).toEqual({ chapter: 13, verse: 35 }));
  it("daily verse always belongs to the edition", () => {
    for (let i = 0; i < 800; i++) {
      const r = dayVerse(new Date(2026, 0, i));
      expect(validRef(r.chapter, r.verse)).toBe(true);
    }
  });
  it("uses the visible card for whole-chapter navigation", () => {
    const cards = [
      { verse: 9, top: -450, bottom: 50 },
      { verse: 10, top: 70, bottom: 600 },
      { verse: 11, top: 620, bottom: 1150 },
    ];
    const active = activeFromRects(cards, 900);
    expect(active).toBe(10);
    expect(step(1, active, 1)).toEqual({ chapter: 1, verse: 11 });
    expect(activeFromRects(cards, 900, true)).toBe(11);
    expect(activeFromRects([], 900)).toBeNull();
  });
});
describe("playback decisions", () => {
  const s = {
    repeat: false,
    autoplay: true,
    autoplayScope: "chapter",
  };
  it("advances within a chapter", () =>
    expect(ended(2, 47, s)).toEqual({ chapter: 2, verse: 48 }));
  it("stops at a chapter boundary", () => expect(ended(1, 47, s)).toBeNull());
  it("continues across chapters when selected", () =>
    expect(ended(1, 47, { ...s, autoplayScope: "continue" })).toEqual({
      chapter: 2,
      verse: 1,
    }));
  it("stops at the end of the book", () =>
    expect(ended(18, 78, { ...s, autoplayScope: "continue" })).toBeNull());
  it("honours repeat and disabled autoplay", () => {
    expect(ended(18, 78, { ...s, repeat: true })).toEqual({
      chapter: 18,
      verse: 78,
    });
    expect(ended(2, 47, { ...s, autoplay: false })).toBeNull();
  });
  it("formats unloaded and valid playback positions", () => {
    expect(formatTime(NaN)).toBe("0:00");
    expect(formatTime(61)).toBe("1:01");
  });
});
describe("personal library", () => {
  beforeEach(() => {
    localStorage.clear();
    store.reset();
  });
  it("persists bookmarks, notes, read marks and the last verse", () => {
    store.bookmark("2.47");
    store.note("2.47", "Reflect on action.");
    store.mark("2.47");
    store.visit(13, 35);
    store.reloadForTest();
    const state = store.getState();
    expect(state.bookmarks["2.47"]).toBeTruthy();
    expect(state.notes["2.47"].text).toBe("Reflect on action.");
    expect(state.read["2.47"]).toBeTruthy();
    expect(state.last?.verse).toBe(35);
    store.bookmark("2.47");
    store.note("2.47", "");
    expect(store.getState().bookmarks["2.47"]).toBeUndefined();
    expect(store.getState().notes["2.47"]).toBeUndefined();
  });
  it("rejects invalid references in actions", () => {
    store.bookmark("19.999");
    store.note("13.36", "invalid");
    store.mark("0.1");
    expect(Object.keys(store.getState().bookmarks)).toHaveLength(0);
    expect(Object.keys(store.getState().notes)).toHaveLength(0);
    expect(Object.keys(store.getState().read)).toHaveLength(0);
  });
  it("round-trips a valid backup", () => {
    store.bookmark("13.35");
    store.note("13.35", "विचार");
    store.settings({ theme: "dark" });
    const result = store.validateBackup(store.exportBackup());
    expect(result.ok).toBe(true);
    if (result.ok) {
      store.reset();
      store.restore(result.data);
      expect(store.getState().settings.theme).toBe("dark");
      expect(store.getState().notes["13.35"].text).toBe("विचार");
    }
  });
  it("rejects malformed files without changing the library", () => {
    store.bookmark("1.1");
    expect(store.validateBackup("{")).toMatchObject({ ok: false });
    expect(store.validateBackup("{}")).toMatchObject({ ok: false });
    expect(store.getState().bookmarks["1.1"]).toBeTruthy();
  });
  it.each(["19.999", "13.36", "0.1"])(
    "rejects backups with nonexistent verse %s",
    (ref) => {
      const state = store.defaults();
      state.bookmarks[ref] = { at: Date.now() };
      expect(
        store.validateBackup(JSON.stringify({ app: "gita-path", data: state }))
          .ok,
      ).toBe(false);
    },
  );
  it("rejects unknown or wrong-language translators", () => {
    const s = store.defaults();
    s.settings.enAuthor = 1;
    expect(
      store.validateBackup(JSON.stringify({ app: "gita-path", data: s })).ok,
    ).toBe(false);
  });
  it("rejects invalid last positions and timestamps", () => {
    const s = store.defaults();
    s.last = { chapter: 13, verse: 36, at: 0 };
    expect(
      store.validateBackup(JSON.stringify({ app: "gita-path", data: s })).ok,
    ).toBe(false);
    s.last = { chapter: 1, verse: 1, at: -1 };
    expect(
      store.validateBackup(JSON.stringify({ app: "gita-path", data: s })).ok,
    ).toBe(false);
  });
  it("counts actual UTF-8 backup bytes", () =>
    expect(store.validateBackup("अ".repeat(store.MAX_BACKUP / 3 + 1)).ok).toBe(
      false,
    ));
  it("handles a full browser store without losing the active session", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Full", "QuotaExceededError");
      });
    store.bookmark("2.47");
    expect(store.getState().bookmarks["2.47"]).toBeTruthy();
    expect(store.storageAvailable).toBe(false);
    spy.mockRestore();
  });
  it("recovers from corrupted storage", () => {
    localStorage.setItem(store.STORAGE_KEY, "{not json");
    store.reloadForTest();
    expect(store.getState()).toEqual(store.defaults());
  });
});

describe("audio tracks", () => {
  it("builds the right URL for each language and the legacy chant", () => {
    expect(audioUrl(2, 47, "hi")).toBe("/api/audio/hi/2/47.mp3");
    expect(audioUrl(2, 47, "en")).toBe("/api/audio/en/2/47.mp3");
    expect(audioUrl(2, 47, "sa")).toBe("/api/audio/sa/2/47.mp3");
    expect(audioUrl(2, 47, "chant")).toBe("/api/audio/2/47.mp3");
  });
  it("starts the all-languages mode with Sanskrit and orders the sequence", () => {
    expect(startLang("all")).toBe("sa");
    expect(startLang("en")).toBe("en");
    expect(SEQUENCE).toEqual(["sa", "hi", "en"]);
  });
  it("defaults to the translators that the narration reads and accepts older backups", () => {
    const s = store.defaults().settings;
    expect([s.enAuthor, s.hiAuthor, s.audioTrack]).toEqual([21, 17, "sa"]);
    const old = store.defaults();
    delete old.settings.audioTrack;
    old.bookmarks = { 2.47: { at: 1 } };
    expect(store.parseSaved(old).bookmarks["2.47"]).toBeTruthy();
    expect(store.parseSaved(old).settings.audioTrack).toBe("sa");
  });
});
