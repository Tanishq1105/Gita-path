import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PenLine, UserRound } from "lucide-react";
import { Modal } from "./UI";
import { api, useAuth } from "../auth";

export function TopStrip() {
  const { users } = useAuth();
  return (
    <div className="top-area">
      <div className="top-strip">
        <div className="container top-strip-inner">
          <span className="user-count" aria-live="polite">
            <UserRound size={15} aria-hidden="true" />
            Users joined : {users === null ? "…" : users.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

/** The administrator's thought of the day, shown on the home page like the verse of the day. */
export function ThoughtSection() {
  const { thought } = useAuth();
  if (!thought) return null;
  return (
    <section className="daily panel thought" aria-label="Thought of the day">
      <div className="section-heading">
        <h2>{thought.title || "Thought of the day"}</h2>
      </div>
      <p className="thought-text">{thought.message}</p>
    </section>
  );
}

export function AccountButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  return (
    <>
      <button
        type="button"
        className="account-button"
        onClick={() => setOpen(true)}
        aria-label={`Account: ${user.name}`}
      >
        <UserRound size={18} aria-hidden="true" />
        <span>{user.name}</span>
      </button>
      <AccountDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function AccountDialog({ open, onClose }) {
  const { user, logout, setDailyEmail } = useAuth();
  const [error, setError] = useState("");
  if (!user) return null;
  return (
    <Modal title="Your account" open={open} onClose={onClose}>
      <p>
        Signed in as <strong>{user.name}</strong>
        <br />
        <span className="muted">{user.email}</span>
      </p>
      <label className="check-row">
        <input
          type="checkbox"
          checked={user.dailyEmail}
          onChange={async (e) => {
            setError("");
            try {
              await setDailyEmail(e.target.checked);
            } catch (err) {
              setError(err.message);
            }
          }}
        />
        Send me a verse by e-mail every day
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {user.isAdmin && (
        <p>
          <Link className="button" to="/admin" onClick={onClose}>
            <PenLine size={18} /> Write the thought of the day
          </Link>
        </p>
      )}
      <button
        type="button"
        className="button secondary"
        onClick={async () => {
          await logout();
          onClose();
        }}
      >
        Log out
      </button>
    </Modal>
  );
}

export function AdminPage() {
  const { user, ready, refresh } = useAuth();
  const [items, setItems] = useState(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const isAdmin = !!user?.isAdmin;
  const load = async () => {
    try {
      setItems((await api.get("/api/admin/thoughts")).thoughts);
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);
  if (!ready) return null;
  if (!isAdmin)
    return (
      <section className="container page narrow">
        <h1>Administrator only</h1>
        <p className="lead">
          Log in with the administrator account to write the thought of the day.
        </p>
      </section>
    );
  async function publish(e) {
    e.preventDefault();
    setError("");
    setNote("");
    try {
      await api.post("/api/admin/thoughts", { title, message: text });
      setTitle("");
      setText("");
      await load();
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }
  async function remove(id) {
    await api.del(`/api/admin/thoughts/${id}`);
    await load();
    refresh();
  }
  async function testMail() {
    setError("");
    setNote("");
    try {
      const r = await api.post("/api/admin/test-email");
      setNote(
        r.mode === "smtp"
          ? `Test e-mail sent to ${r.to}.`
          : "E-mail is not set up yet, so the test e-mail was printed in the server terminal instead.",
      );
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <section className="container page narrow admin-page">
      <h1>Thought of the day</h1>
      <p className="lead">
        The newest message you publish appears in its own section on the home
        page for every user, and is added to the daily e-mail.
      </p>
      <form onSubmit={publish} className="account-form">
        <label>
          Heading (optional)
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder="Thought of the day"
          />
        </label>
        <label>
          Message
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={600}
            rows={4}
            required
          />
        </label>
        <span className="muted">{text.length}/600</span>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {note && <p className="muted">{note}</p>}
        <button className="button" type="submit" disabled={!text.trim()}>
          Publish to all users
        </button>
      </form>
      <p>
        <button
          type="button"
          className="button secondary small"
          onClick={testMail}
        >
          Send me today&apos;s daily e-mail as a test
        </button>
      </p>
      <h2>Earlier messages</h2>
      {items?.length === 0 && <p className="muted">Nothing published yet.</p>}
      <ul className="admin-list">
        {items?.map((a) => (
          <li key={a.id}>
            {a.title && <strong>{a.title}</strong>}
            <p>{a.message}</p>
            <span className="muted">
              {new Date(a.createdAt * 1000).toLocaleString()} ·{" "}
              {a.active ? "Showing" : "Removed"}
            </span>
            {a.active && (
              <button
                type="button"
                className="button secondary small"
                onClick={() => remove(a.id)}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
