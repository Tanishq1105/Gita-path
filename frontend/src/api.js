import { useEffect, useState } from "react";
const cache = new Map();
async function request(path) {
  const response = await fetch(path, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      body?.error?.message || `Request failed (${response.status}).`,
    );
  }
  return response.json();
}
export function fetchApi(path) {
  if (!cache.has(path)) {
    const promise = request(path).catch((error) => {
      cache.delete(path);
      throw error;
    });
    cache.set(path, promise);
  }
  return cache.get(path);
}
export function useApi(path) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ path, loading: !!path });
  useEffect(() => {
    if (!path) {
      setState({ path, loading: false });
      return;
    }
    let live = true;
    setState({ path, loading: true });
    fetchApi(path).then(
      (data) => {
        if (live) setState({ path, data, loading: false });
      },
      (error) => {
        if (live)
          setState({
            path,
            error:
              error instanceof Error ? error.message : "Could not load data.",
            loading: false,
          });
      },
    );
    return () => {
      live = false;
    };
  }, [path, revision]);
  return {
    ...(state.path === path
      ? state
      : { loading: !!path, data: undefined, error: undefined }),
    retry: () => {
      if (path) cache.delete(path);
      setRevision((n) => n + 1);
    },
  };
}
