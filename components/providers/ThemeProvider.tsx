"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

/** Layout effect on the client, plain effect during SSR (avoids React's warning). */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "music-theme";
const CHANGE_EVENT = "music:theme-change";

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStored(): ThemeMode {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    /* storage can be unavailable in private mode */
  }
  /* Music-first default: the player opens dark, like Spotify. */
  return "dark";
}

/** The DOM attributes the pre-paint script and this provider keep in sync. */
function apply(mode: ThemeMode, scheme: "light" | "dark") {
  const root = document.documentElement;
  const resolved = mode === "system" ? scheme : mode;
  root.dataset.theme = resolved;
  root.classList.add(resolved);
  root.classList.remove(resolved === "dark" ? "light" : "dark");
}

function subscribe(onChange: () => void) {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", onChange);
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    query.removeEventListener("change", onChange);
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** A single primitive snapshot so React can compare by value. */
function getSnapshot(): string {
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return `${readStored()}|${dark ? "dark" : "light"}`;
}

function getServerSnapshot(): string {
  return "system|light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [mode, scheme] = snapshot.split("|") as [ThemeMode, "light" | "dark"];

  useIsomorphicLayoutEffect(() => {
    apply(mode, scheme);
  }, [mode, scheme]);

  const setMode = useCallback((next: ThemeMode) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const resolved: "light" | "dark" = mode === "system" ? scheme : mode;

  const toggle = useCallback(() => {
    setMode(resolved === "dark" ? "light" : "dark");
  }, [resolved, setMode]);

  const value = useMemo(
    () => ({ mode, resolved, setMode, toggle }),
    [mode, resolved, setMode, toggle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
