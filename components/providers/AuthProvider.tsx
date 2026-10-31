"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  loginRequest,
  logoutRequest,
  refreshSession,
  registerRequest,
  type AuthUser,
  type LoginInput,
  type RegisterInput,
} from "@/lib/api";

type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  /** A member whose session has run out, as opposed to someone new. */
  expired: boolean;
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

  // Recover a session from the httpOnly refresh cookie on first paint.
  useEffect(() => {
    let alive = true;
    refreshSession()
      .then((session) => {
        if (!alive) return;
        if (session) {
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
    setUser(nextUser);
    setStatus("authenticated");
    setExpired(false);
    rememberDevice();
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const nextUser = await registerRequest(input);
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
    () => ({ user, status, expired, login, register, logout }),
    [user, status, expired, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
