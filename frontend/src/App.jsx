import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import {
  BookOpen,
  Headphones,
  Search,
  Library as LibraryIcon,
  Info,
  Sun,
  Moon,
  ScrollText,
  Settings2,
  ArrowRight,
} from "lucide-react";
import { useApi } from "./api";
import { settings, useStore } from "./store";
import { ErrorBox, IconButton, Loading, Notices } from "./components/UI";
import { Player } from "./components/Player";
import { SettingsDialog } from "./components/Settings";
import { Home, Listen, SearchPage, Library, About } from "./pages";
import Reader from "./Reader";
import { AuthProvider, useAuth } from "./auth";
import { AccountButton, AdminPage, TopStrip } from "./components/Account";
import { LoginPage } from "./components/LoginPage";
const nav = [
  { to: "/read", label: "Read", icon: BookOpen },
  { to: "/listen", label: "Listen", icon: Headphones },
  { to: "/search", label: "Search", icon: Search },
  { to: "/library", label: "My Library", icon: LibraryIcon },
  { to: "/about", label: "About", icon: Info },
];
function Application() {
  const meta = useApi("/api/chapters"),
    s = useStore((st) => st.settings),
    [prefs, setPrefs] = useState(false),
    location = useLocation();
  useEffect(() => {
    document.documentElement.dataset.theme = s.theme;
    document.documentElement.style.colorScheme =
      s.theme === "dark" ? "dark" : "light";
  }, [s.theme]);
  useEffect(() => {
    if (!location.pathname.startsWith("/read/")) window.scrollTo({ top: 0 });
    document.title = `${location.pathname.startsWith("/read") ? "Read" : location.pathname === "/listen" ? "Listen" : location.pathname === "/search" ? "Search" : location.pathname === "/library" ? "My Library" : location.pathname === "/about" ? "About" : "Read. Listen. Reflect."} · Gita Path`;
  }, [location.pathname]);
  const last = useStore((st) => st.last),
    Theme = s.theme === "dark" ? Moon : s.theme === "light" ? Sun : ScrollText;
  return (
    <>
      <TopStrip />
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="container header-inner">
          <Link className="brand" to="/" aria-label="Gita Path home">
            <span>Gita Path</span>
            <span className="brand-sanskrit deva" lang="sa">
              गीता
            </span>
          </Link>
          <nav className="desktop-nav" aria-label="Main navigation">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="header-tools">
            <AccountButton />
            <IconButton
              label={`Theme: ${s.theme}. Change theme`}
              onClick={() =>
                settings({
                  theme:
                    s.theme === "paper"
                      ? "dark"
                      : s.theme === "dark"
                        ? "light"
                        : "paper",
                })
              }
            >
              <Theme size={20} />
            </IconButton>
            {meta.data && (
              <IconButton
                label="Reading preferences"
                onClick={() => setPrefs(true)}
              >
                <Settings2 size={20} />
              </IconButton>
            )}
          </div>
        </div>
      </header>
      <main id="main">
        {meta.loading ? (
          <Loading text="Opening Gita Path…" />
        ) : meta.error ? (
          <div className="container page">
            <ErrorBox
              message="The book server could not be reached. Start the project with python run.py, then try again."
              retry={meta.retry}
            />
          </div>
        ) : (
          meta.data && (
            <Routes>
              <Route path="/" element={<Home meta={meta.data} />} />
              <Route
                path="/read"
                element={
                  <Navigate
                    replace
                    to={
                      last ? `/read/${last.chapter}/${last.verse}` : "/read/1"
                    }
                  />
                }
              />
              <Route
                path="/read/:chapter/:verse?"
                element={<Reader meta={meta.data} />}
              />
              <Route path="/listen" element={<Listen meta={meta.data} />} />
              <Route path="/search" element={<SearchPage meta={meta.data} />} />
              <Route path="/library" element={<Library meta={meta.data} />} />
              <Route path="/about" element={<About meta={meta.data} />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route
                path="*"
                element={
                  <section className="container page narrow">
                    <h1>This page could not be found.</h1>
                    <p className="lead">
                      Return to the chapter library to continue reading.
                    </p>
                    <Link className="button" to="/">
                      Go to the library
                      <ArrowRight size={18} />
                    </Link>
                  </section>
                }
              />
            </Routes>
          )
        )}
      </main>
      <footer className="site-footer container">
        <Link className="brand-word" to="/">
          Gita Path
        </Link>
        <span>A quiet space for timeless wisdom.</span>
        <Link to="/about">Sources & privacy</Link>
      </footer>
      <Player chapters={meta.data?.chapters} />
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            <n.icon size={20} />
            <span>{n.label === "My Library" ? "Library" : n.label}</span>
          </NavLink>
        ))}
      </nav>
      {meta.data && (
        <SettingsDialog
          meta={meta.data}
          open={prefs}
          onClose={() => setPrefs(false)}
        />
      )}
    </>
  );
}
function Gate() {
  const { user, ready } = useAuth();
  if (!ready) return <Loading text="Opening Gita Path…" />;
  return user ? <Application /> : <LoginPage />;
}
export default function App() {
  return (
    <Notices>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </Notices>
  );
}
