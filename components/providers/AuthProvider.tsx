"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  apiFetch,
  loginRequest,
  logoutRequest,
  refreshSession,
  registerRequest,
  type AuthUser,
  type LoginInput,
  type RegisterInput,
} from "@/lib/api";

import { readPersonalWelcome, subscribePersonalWelcome, rememberPersonalWelcome } from "@/lib/personal-welcome";

type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  /** A member whose session has run out, as opposed to someone new. */
  expired: boolean;
  /** Permanent account restrictions; independent of the appearance toggle. */
  personalExperience: boolean;
  personalThemeEnabled: boolean;
  returningPersonalEmail: string | null;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/*
 * The refresh endpoint answers 401 the same way for a stranger and for a
 * member whose cookie went stale, and rotation deletes the session row — so
 * "we have met before" can only be answered from this device's own memory.
 * The mark outlives signing out on purpose: a logged-out member belongs on the
 * sign-in screen, not in guest mode.
 */
const HAS_ACCOUNT_MARK = "zyrava:has-account";

function rememberDevice() {
  try {
    window.localStorage.setItem(HAS_ACCOUNT_MARK, "1");
  } catch {
    /* storage off costs only the shortcut back to the sign-in screen */
  }
}

function knownDevice(): boolean {
  try {
    return window.localStorage.getItem(HAS_ACCOUNT_MARK) === "1";
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [expired, setExpired] = useState(false);
  const rememberedPersonalEmail = useSyncExternalStore(subscribePersonalWelcome, readPersonalWelcome, () => null);
  const personalExperience = status === "authenticated" && user?.experience === "brown-burgundy";

  const [appearanceEnabled, setAppearanceEnabled] = useState<boolean | null>(null);
  const personalThemeEnabled = personalExperience && appearanceEnabled === true;
  // Never trust a stale welcome hint before the server confirms the switch.
  const returningPersonalEmail = appearanceEnabled === true ? rememberedPersonalEmail : null;
  useEffect(() => {
    let alive = true;
    let inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const settings = await apiFetch<{vimithaThemeEnabled:boolean}>("/api/appearance", {auth:false});
        if (alive && typeof settings.vimithaThemeEnabled === "boolean") {
          setAppearanceEnabled(settings.vimithaThemeEnabled);
        }
      } catch { /* Keep the last confirmed state during a transient failure. */ }
      finally { inFlight = false; }
    };
    void load();
    const relevant = personalExperience || !!rememberedPersonalEmail;
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    const timer = relevant ? window.setInterval(onVisible, 5000) : undefined;
    if (relevant) { window.addEventListener("focus", onVisible); document.addEventListener("visibilitychange", onVisible); }
    return () => {
      alive = false;
      if (timer) window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [personalExperience, rememberedPersonalEmail]);

  // Scope tokens to this signed-in account, including portals; never persist them.
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (personalThemeEnabled) root.dataset.experience = "brown-burgundy";
    else delete root.dataset.experience;
    return () => { delete root.dataset.experience; };
  }, [personalThemeEnabled]);

  // Recover a session from the httpOnly refresh cookie on first paint.
  useEffect(() => {
    let alive = true;
    refreshSession()
      .then((session) => {
        if (!alive) return;
        if (session) {
          rememberPersonalWelcome(session.user);
          setUser(session.user);
          setStatus("authenticated");
        } else {
          setExpired(knownDevice());
          setStatus("anonymous");
        }
      })
      .catch(() => {
        if (!alive) return;
        setExpired(knownDevice());
        setStatus("anonymous");
      });
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const nextUser = await loginRequest(input);
    rememberPersonalWelcome(nextUser);
    setUser(nextUser);
    setStatus("authenticated");
    setExpired(false);
    rememberDevice();
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const nextUser = await registerRequest(input);
    rememberPersonalWelcome(nextUser);
    setUser(nextUser);
    setStatus("authenticated");
    setExpired(false);
    rememberDevice();
  }, []);

  const logout = useCallback(async () => {
    // Leave the private shell immediately; revoking the cookie can happen
    // behind the redirect, so a slow API never makes the button feel dead.
    setUser(null);
    setStatus("anonymous");
    setExpired(true);
    await logoutRequest().catch(() => undefined);
  }, []);

  const value = useMemo(
    () => ({ user, status, expired, personalExperience, personalThemeEnabled, returningPersonalEmail, login, register, logout }),
    [user, status, expired, personalExperience, personalThemeEnabled, returningPersonalEmail, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
