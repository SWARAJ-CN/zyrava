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
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

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
          setStatus("anonymous");
        }
      })
      .catch(() => {
        if (alive) setStatus("anonymous");
      });
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const nextUser = await loginRequest(input);
    setUser(nextUser);
    setStatus("authenticated");
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const nextUser = await registerRequest(input);
    setUser(nextUser);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    // Leave the private shell immediately; revoking the cookie can happen
    // behind the redirect, so a slow API never makes the button feel dead.
    setUser(null);
    setStatus("anonymous");
    await logoutRequest().catch(() => undefined);
  }, []);

  const value = useMemo(
    () => ({ user, status, login, register, logout }),
    [user, status, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
