import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

async function call(method, path, body) {
  const response = await fetch(path, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    credentials: "same-origin",
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      data?.error?.message || `Request failed (${response.status}).`,
    );
    error.needsVerification = !!data?.needsVerification;
    error.email = data?.email;
    throw error;
  }
  return data;
}
export const api = {
  get: (path) => call("GET", path),
  post: (path, body) => call("POST", path, body || {}),
  del: (path) => call("DELETE", path),
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [users, setUsers] = useState(null);
  const [thought, setThought] = useState(null);

  const refresh = useCallback(async () => {
    const [me, stats, today] = await Promise.allSettled([
      api.get("/api/auth/me"),
      api.get("/api/stats"),
      api.get("/api/thoughts/today"),
    ]);
    if (me.status === "fulfilled") setUser(me.value?.user ?? null);
    if (stats.status === "fulfilled" && Number.isInteger(stats.value?.users))
      setUsers(stats.value.users);
    if (today.status === "fulfilled") setThought(today.value?.thought ?? null);
    setReady(true);
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 60000);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({
      user,
      ready,
      users,
      thought,
      refresh,
      async login(email, password) {
        const data = await api.post("/api/auth/login", { email, password });
        setUser(data.user);
        refresh();
      },
      // Sign-up sends a 6-digit code by e-mail; the account is only usable after verify().
      register: (name, email, password) =>
        api.post("/api/auth/register", { name, email, password }),
      async verify(email, code) {
        const data = await api.post("/api/auth/verify", { email, code });
        setUser(data.user);
        refresh();
      },
      resend: (email) => api.post("/api/auth/resend", { email }),
      async logout() {
        await api.post("/api/auth/logout");
        setUser(null);
      },
      async setDailyEmail(dailyEmail) {
        const data = await api.post("/api/auth/preferences", { dailyEmail });
        setUser(data.user);
      },
    }),
    [user, ready, users, thought, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
