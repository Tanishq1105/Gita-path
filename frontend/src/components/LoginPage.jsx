import { useState } from "react";
import { Eye, EyeOff, MailCheck } from "lucide-react";
import { useAuth } from "../auth";
import { TopStrip } from "./Account";

export function PasswordField({
  label = "Password",
  value,
  onChange,
  autoComplete,
  minLength,
}) {
  const [shown, setShown] = useState(false);
  return (
    <label>
      {label}
      <span className="password-field">
        <input
          type={shown ? "text" : "password"}
          required
          minLength={minLength}
          maxLength={128}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className="password-toggle"
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          onClick={() => setShown(!shown)}
        >
          {shown ? <EyeOff size={18} /> : <Eye size={18} />}
          <span>{shown ? "Hide" : "Show"}</span>
        </button>
      </span>
    </label>
  );
}

export function LoginPage() {
  const { login, register, verify, resend } = useAuth();
  const [mode, setMode] = useState("login"); // login | register | verify
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    code: "",
  });
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const go = (next) => {
    setMode(next);
    setError("");
    setInfo("");
  };

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      if (mode === "login") await login(form.email, form.password);
      else if (mode === "register") {
        await register(form.name, form.email, form.password);
        setMode("verify");
        setInfo(`We sent a 6-digit code to ${form.email.trim()}.`);
      } else await verify(form.email, form.code);
    } catch (err) {
      if (err.needsVerification) {
        setMode("verify");
        setInfo(
          `Please verify your e-mail. We sent a 6-digit code to ${form.email.trim()}.`,
        );
      } else setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function again() {
    setError("");
    try {
      await resend(form.email);
      setInfo(`A new code is on its way to ${form.email.trim()}.`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="login-page">
      <TopStrip />
      <main className="login-main">
        <div className="login-brand">
          <span className="brand-sanskrit deva" lang="sa">
            गीता
          </span>
          <h1>Gita Path</h1>
          <p>Read. Listen. Reflect.</p>
        </div>
        <form
          className="login-card account-form"
          onSubmit={submit}
          aria-labelledby="login-heading"
        >
          <h2 id="login-heading">
            {mode === "login"
              ? "Log in"
              : mode === "register"
                ? "Create your account"
                : "Verify your e-mail"}
          </h2>
          {mode === "verify" ? (
            <>
              <p className="login-note">
                <MailCheck size={18} aria-hidden="true" />{" "}
                {info || `Enter the 6-digit code sent to ${form.email.trim()}.`}
              </p>
              <label>
                Verification code
                <input
                  value={form.code}
                  onChange={set("code")}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  required
                  autoFocus
                />
              </label>
            </>
          ) : (
            <>
              {mode === "register" && (
                <label>
                  Name (optional)
                  <input
                    value={form.name}
                    onChange={set("name")}
                    autoComplete="name"
                    maxLength={60}
                  />
                </label>
              )}
              <label>
                E-mail
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={set("email")}
                  autoComplete="email"
                />
              </label>
              <PasswordField
                value={form.password}
                onChange={set("password")}
                minLength={mode === "register" ? 8 : undefined}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
              />
              {mode === "register" && (
                <p className="muted">
                  Use at least 8 characters. We will e-mail a code to confirm
                  your address, then send you a daily verse (you can turn that
                  off any time).
                </p>
              )}
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="button" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "login"
                ? "Log in"
                : mode === "register"
                  ? "Sign up"
                  : "Verify and continue"}
          </button>
          {mode === "verify" ? (
            <>
              <button type="button" className="link-button" onClick={again}>
                Send a new code
              </button>
              <button
                type="button"
                className="link-button"
                onClick={() => go("login")}
              >
                Back to log in
              </button>
            </>
          ) : (
            <button
              type="button"
              className="link-button"
              onClick={() => go(mode === "login" ? "register" : "login")}
            >
              {mode === "login"
                ? "New here? Create an account"
                : "Already have an account? Log in"}
            </button>
          )}
        </form>
      </main>
    </div>
  );
}
