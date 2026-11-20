import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import App from "../App";
import { AudioProvider } from "../audio";
import * as store from "../store";
const data = (path) =>
  JSON.parse(
    readFileSync(resolve(process.cwd(), "../backend/data", path), "utf8"),
  );
const meta = data("meta.json");
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function () {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function () {
      this.removeAttribute("open");
    },
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  window.matchMedia = vi.fn(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  window.scrollTo = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(function () {
    Object.defineProperty(this, "duration", { value: 30, configurable: true });
    this.dispatchEvent(new Event("loadedmetadata"));
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function () {
    Object.defineProperty(this, "paused", { value: false, configurable: true });
    this.dispatchEvent(new Event("playing"));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function () {
    Object.defineProperty(this, "paused", { value: true, configurable: true });
    this.dispatchEvent(new Event("pause"));
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const url = new URL(input, "http://localhost");
      let payload;
      if (url.pathname === "/api/chapters") payload = meta;
      else if (/^\/api\/chapters\/\d+$/.test(url.pathname)) {
        const c = Number(url.pathname.split("/").pop());
        payload = {
          chapter: meta.chapters[c - 1],
          verses: data(`chapters/${c}.json`),
        };
      } else if (/^\/api\/verses\/\d+\/\d+$/.test(url.pathname)) {
        const [, , , c, v] = url.pathname.split("/");
        payload = data(`chapters/${c}.json`)[Number(v) - 1];
      } else if (url.pathname === "/api/search") {
        const v = data("chapters/2.json")[46];
        payload = {
          total: 1,
          offset: 0,
          limit: 20,
          results: [
            {
              chapter: 2,
              verse: 47,
              field: "english",
              authorId: 16,
              snippet: v.translations["16"],
            },
          ],
        };
      } else if (url.pathname === "/api/stats") payload = { users: 1234 };
      else if (url.pathname === "/api/thoughts/today")
        payload = {
          thought: {
            id: 7,
            title: "Calm mind",
            message: "Act without attachment to results.",
            createdAt: 1,
            active: true,
          },
        };
      else if (url.pathname === "/api/auth/register")
        payload = { needsVerification: true, email: "asha@example.com" };
      else if (url.pathname === "/api/auth/verify") {
        signedIn = true;
        payload = { user: asha };
      } else if (url.pathname === "/api/auth/me")
        payload = { user: signedIn ? asha : null };
      else if (url.pathname === "/api/auth/login") {
        signedIn = true;
        payload = { user: asha };
      } else payload = {};
      return { ok: true, status: 200, json: async () => payload };
    }),
  );
});
let signedIn = true;
const asha = { id: 2, name: "Asha", email: "asha@example.com", isAdmin: false };
beforeEach(() => {
  signedIn = true;
  cleanup();
  localStorage.clear();
  store.reset();
  window.history.replaceState({}, "", "/");
});
afterEach(() => cleanup());
function mount(path = "/") {
  window.history.replaceState({}, "", path);
  return render(
    <BrowserRouter>
      <AudioProvider>
        <App />
      </AudioProvider>
    </BrowserRouter>,
  );
}
describe("reader interaction flows", () => {
  it("renders all eighteen real chapter cards and a verse of the day", async () => {
    const view = mount();
    await screen.findByRole("heading", { name: "The eighteen chapters" });
    expect(view.container.querySelectorAll(".chapter-card")).toHaveLength(18);
    await screen.findByText("Verse of the day");
    expect(view.container.textContent).toContain("701");
  });
  it("opens the correct deep link and saves bookmarks and notes through the UI", async () => {
    const user = userEvent.setup();
    mount("/read/2/47");
    await screen.findByText(/कर्मण्येवाधिकारस्ते/);
    const verse = within(screen.getByRole("article", { name: "Verse 2.47" }));
    await user.click(verse.getByRole("button", { name: "Bookmark verse" }));
    expect(store.getState().bookmarks["2.47"]).toBeTruthy();
    await user.click(verse.getByRole("button", { name: "Add note" }));
    const dialog = screen.getByRole("dialog", { name: "Your note · 2.47" });
    await user.type(
      within(dialog).getByRole("textbox", { name: "Your reflection" }),
      "Act with care.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Save note" }));
    expect(store.getState().notes["2.47"].text).toBe("Act with care.");
    await user.click(screen.getAllByRole("button", { name: "Next verse" })[0]);
    await waitFor(() => expect(window.location.pathname).toBe("/read/2/48"));
  });
  it("opens the chapter drawer and preserves the chosen reading view", async () => {
    const user = userEvent.setup();
    mount("/read/2");
    await screen.findByRole("article", { name: "Verse 2.47" });
    expect(screen.getAllByRole("article")).toHaveLength(72);
    await user.click(
      screen.getByRole("button", { name: "Open chapter navigation" }),
    );
    const drawer = within(screen.getByRole("dialog", { name: "Navigate" }));
    await user.click(drawer.getByRole("button", { name: "Verse 47" }));
    expect(window.location.pathname).toBe("/read/2/47");
    expect(screen.queryByRole("dialog", { name: "Navigate" })).toBeNull();
    await user.click(
      screen.getByRole("checkbox", {
        name: "Read the whole chapter on one page",
      }),
    );
    expect(window.location.search).toBe("?view=verse");
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("article", { name: "Verse 2.47" })).toBeTruthy();
  });
  it("changes language and theme using the reading preferences", async () => {
    const user = userEvent.setup();
    mount("/read/2/47");
    await screen.findByText(/कर्मण्येवाधिकारस्ते/);
    await user.click(screen.getByRole("button", { name: "Reader settings" }));
    const dialog = screen.getByRole("dialog", { name: "Reading preferences" });
    await user.selectOptions(
      within(dialog).getByLabelText("Translation language"),
      "both",
    );
    expect(store.getState().settings.translationMode).toBe("both");
    await user.click(within(dialog).getByRole("button", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    await user.click(
      within(dialog).getByRole("button", { name: "Close dialog" }),
    );
    expect(document.querySelector('blockquote[lang="hi"]')).not.toBeNull();
  });
  it("persists playback controls after navigating to My Library", async () => {
    const user = userEvent.setup();
    const view = mount("/read/2/47");
    await screen.findByText(/कर्मण्येवाधिकारस्ते/);
    const verse = within(screen.getByRole("article", { name: "Verse 2.47" }));
    await user.click(verse.getByRole("button", { name: "Play recitation" }));
    await screen.findByRole("button", { name: "Pause audio" });
    const library = view.container.querySelector(
      '.desktop-nav a[href="/library"]',
    );
    await user.click(library);
    await screen.findByRole("heading", { name: "My Library" });
    expect(screen.getByRole("button", { name: "Pause audio" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Close player" }));
    expect(screen.queryByRole("region", { name: "Audio player" })).toBeNull();
  });
  it("searches and navigates from a result to its verse", async () => {
    const user = userEvent.setup();
    mount("/search?q=2.47&lang=english");
    await screen.findByText(/1 verse found/);
    const result = document.querySelector(".result-card");
    await user.click(result);
    await screen.findByText(/कर्मण्येवाधिकारस्ते/);
    expect(window.location.pathname).toBe("/read/2/47");
  });
  it("requires confirmation for backup restore, and cancellation keeps current data", async () => {
    const user = userEvent.setup();
    store.bookmark("1.1");
    const backup = JSON.parse(store.exportBackup());
    backup.data.bookmarks = { 13.35: { at: Date.now() } };
    mount("/library");
    await screen.findByRole("heading", { name: "My Library" });
    const input = screen.getByLabelText("Choose backup file");
    await user.upload(
      input,
      new File([JSON.stringify(backup)], "backup.json", {
        type: "application/json",
      }),
    );
    let dialog = await screen.findByRole("dialog", {
      name: "Restore this backup?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(store.getState().bookmarks["1.1"]).toBeTruthy();
    await user.upload(
      input,
      new File([JSON.stringify(backup)], "backup.json", {
        type: "application/json",
      }),
    );
    dialog = await screen.findByRole("dialog", {
      name: "Restore this backup?",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Replace with backup" }),
    );
    expect(store.getState().bookmarks["13.35"]).toBeTruthy();
    expect(store.getState().bookmarks["1.1"]).toBeUndefined();
  });
  it("rejects a malformed backup without replacing the library", async () => {
    const user = userEvent.setup();
    store.bookmark("2.47");
    mount("/library");
    await screen.findByRole("heading", { name: "My Library" });
    await user.upload(
      screen.getByLabelText("Choose backup file"),
      new File(["{broken"], "bad.json", { type: "application/json" }),
    );
    await screen.findByText("Choose a valid JSON backup file.");
    expect(store.getState().bookmarks["2.47"]).toBeTruthy();
    expect(
      screen.queryByRole("dialog", { name: "Restore this backup?" }),
    ).toBeNull();
  });
  it("shows a useful invalid-verse page", async () => {
    mount("/read/13/36");
    await screen.findByRole("heading", {
      name: "That verse is not in this edition.",
    });
    expect(
      screen.getByRole("link", { name: "Browse all chapters" }),
    ).toBeTruthy();
  });
});

describe("login first, user count and thought of the day", () => {
  it("shows the login page before the app and lets the password be revealed", async () => {
    signedIn = false;
    mount();
    expect(await screen.findByRole("heading", { name: "Log in" })).toBeTruthy();
    expect(screen.queryByText("Verse of the day")).toBeNull();
    expect(screen.getByText(/Users joined : 1,234/)).toBeTruthy();
    const password = screen.getByLabelText("Password");
    expect(password.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password.type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password.type).toBe("password");
  });
  it("logs in and then shows the app", async () => {
    signedIn = false;
    mount();
    fireEvent.change(await screen.findByLabelText("E-mail"), {
      target: { value: "asha@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Log in",
        selector: "button[type=submit]",
      }),
    );
    expect(await screen.findByText("Verse of the day")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Account: Asha" })).toBeTruthy();
  });
  it("signs up with an e-mailed code before entering the app", async () => {
    signedIn = false;
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: /Create an account/ }),
    );
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "asha@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    expect(
      await screen.findByRole("heading", { name: "Verify your e-mail" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/We sent a 6-digit code to asha@example.com/),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Verification code"), {
      target: { value: "123456" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Verify and continue" }),
    );
    expect(await screen.findByText("Verse of the day")).toBeTruthy();
  });
  it("shows the admin's thought as its own section on the home page", async () => {
    mount();
    expect(await screen.findByText(/Users joined : 1,234/)).toBeTruthy();
    const section = await screen.findByRole("region", {
      name: "Thought of the day",
    });
    expect(section.textContent).toContain("Calm mind");
    expect(section.textContent).toContain("Act without attachment to results.");
  });
});
